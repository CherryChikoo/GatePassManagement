import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader } from "jose";

/** Supabase Auth calls (e.g. renewing an expired session) give up after 8 s instead of hanging */
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(8_000) });

/**
 * Identity headers forwarded to server components / actions.
 * They are ALWAYS stripped from the incoming request first, so a client can
 * never inject them; they are only re-added after the session JWT has been
 * cryptographically verified.
 */
export const USER_ID_HEADER = "x-user-id";
export const USER_EMAIL_HEADER = "x-user-email";
/**
 * Set when the user was let in on an expired (but genuinely signed) token
 * because Supabase could not be reached to renew it. Only Security accounts
 * are kept signed in that way — every other role counts as signed out
 * (enforced in getAuthUser, which knows the role).
 */
export const AUTH_GRACE_HEADER = "x-auth-grace";
/**
 * Set on every request the proxy has checked. With it and no user id, the
 * visitor is simply not signed in — server code need not ask Supabase again.
 */
export const AUTH_CHECKED_HEADER = "x-auth-checked";

type VerifiedUser = { id: string; email: string };

// Short-lived cache of VERIFIED sessions, keyed by the exact auth cookie value.
// A forged cookie never verifies, so it can never enter this cache.
const sessionCache = new Map<string, { user: VerifiedUser; expiresAt: number; grace?: boolean }>();
/** A login Supabase refused to renew: let in on its old token for this long before asking again */
const GRACE_CACHE_MS = 5 * 60_000;
const MAX_CACHE_SIZE = 2000;
const CACHE_TTL_MS = 30_000;

// ─── Fast local verification ────────────────────────────────────────────────
// supabase.auth.getClaims() verifies locally only for asymmetric signing keys;
// with the legacy HS256 secret it calls the Auth server on every check, which
// adds a network round-trip to every click. We verify the access token locally
// (HS256 via SUPABASE_JWT_SECRET, or asymmetric via the project's JWKS) and only
// fall back to Supabase when the token is missing, expiring, or unverifiable.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
  : null;
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const REFRESH_MARGIN_S = 60;

/** Reads the (possibly chunked) Supabase session cookie and returns its access token. */
function readAccessToken(request: NextRequest): string | null {
  try {
    const chunks = request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-") && /-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => {
        const n = (s: string) => Number(s.match(/\.(\d+)$/)?.[1] ?? 0);
        return n(a.name) - n(b.name);
      });
    if (chunks.length === 0) return null;

    let raw = chunks.map((c) => c.value).join("");
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice(7), "base64url").toString("utf-8");
    }
    const session = JSON.parse(raw);
    const token = session?.access_token;
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}

/** Cryptographically verifies the access token without any network call (JWKS is cached). */
async function verifyLocally(token: string): Promise<VerifiedUser | null> {
  try {
    const { alg } = decodeProtectedHeader(token);
    const options = { issuer: ISSUER, audience: "authenticated" };
    let payload;
    if (alg === "HS256") {
      if (!JWT_SECRET) return null; // cannot verify locally → fall back
      ({ payload } = await jwtVerify(token, JWT_SECRET, { ...options, algorithms: ["HS256"] }));
    } else {
      ({ payload } = await jwtVerify(token, JWKS, { ...options, algorithms: ["ES256", "RS256"] }));
    }
    if (!payload.sub || typeof payload.exp !== "number") return null;
    // Let Supabase refresh tokens that are about to expire
    if (payload.exp - REFRESH_MARGIN_S < Date.now() / 1000) return null;
    return { id: payload.sub, email: (payload.email as string) || "" };
  } catch {
    return null;
  }
}

/** How long after expiry a genuinely signed token still identifies the user while renewal is unreachable */
const RENEWAL_GRACE_S = 400 * 24 * 60 * 60; // as long as the login cookie lives: Security signs out only by Log out

/**
 * Verifies the token's signature and issuer but accepts it up to RENEWAL_GRACE_S
 * past its expiry. Used only when Supabase could not be reached to renew the
 * session (network / timeout / outage): a gate phone on a weak network after a
 * long idle must not be signed out. The signature still proves who it is.
 */
async function verifyExpiredButGenuine(token: string): Promise<VerifiedUser | null> {
  try {
    const { alg } = decodeProtectedHeader(token);
    const options = { issuer: ISSUER, audience: "authenticated", clockTolerance: RENEWAL_GRACE_S };
    let payload;
    if (alg === "HS256") {
      if (!JWT_SECRET) return null;
      ({ payload } = await jwtVerify(token, JWT_SECRET, { ...options, algorithms: ["HS256"] }));
    } else {
      ({ payload } = await jwtVerify(token, JWKS, { ...options, algorithms: ["ES256", "RS256"] }));
    }
    return payload.sub ? { id: payload.sub, email: (payload.email as string) || "" } : null;
  } catch {
    return null;
  }
}

/** Renewal failed because Supabase was unreachable (not because the login is invalid) */
function isTransientAuthError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; status?: number; message?: string };
  if (e.name === "AuthRetryableFetchError") return true;
  if (typeof e.status === "number" && (e.status === 0 || e.status >= 500)) return true;
  return /fetch|network|timeout|timed out|abort|ECONN|ENOTFOUND|socket/i.test(e.message ?? "");
}

/**
 * One renewal per login at a time. A screen sends several requests at once
 * (list, counts, live…); when the login is due for renewal each of them used
 * to renew it with the same refresh token. Supabase replaces the token on the
 * first renewal, so a device that then kept an older copy (a request cut off
 * before its answer arrived) was later refused with "Refresh Token Not Found"
 * and its screens stopped loading. Now the requests share the first renewal
 * and all hand back the same new login. Kept a few seconds for stragglers.
 */
type Renewal = { claims: Record<string, unknown> | null; error: unknown; cookies: { name: string; value: string; options: any }[] };
const renewals = new Map<string, Promise<Renewal>>();
const RENEWAL_SHARE_MS = 15_000;

function renewSession(request: NextRequest, key: string): Promise<Renewal> {
  const running = renewals.get(key);
  if (running) return running;
  const cookies: Renewal["cookies"] = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { fetch: timedFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        cookies.push(...toSet);
      },
    },
  });
  // getClaims() verifies the JWT signature and refreshes the session when needed.
  const p: Promise<Renewal> = supabase.auth
    .getClaims()
    .then(({ data, error }) => ({ claims: (data?.claims as Record<string, unknown> | undefined) ?? null, error, cookies }))
    .catch((err: unknown) => ({ claims: null, error: err, cookies }));
  renewals.set(key, p);
  if (renewals.size > 500) renewals.delete(renewals.keys().next().value!);
  p.finally(() => setTimeout(() => renewals.get(key) === p && renewals.delete(key), RENEWAL_SHARE_MS));
  return p;
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/callback" ||
    pathname === "/api/health" ||
    pathname === "/api/version" ||
    // Phone notifications worker and the app manifest (fetched by the browser itself)
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/api/cron/") ||
    // Visitor self check-in on the visitor's own phone (no login): the form
    // and its API (src/lib/visits/requests.ts)
    pathname.startsWith("/v/") ||
    pathname.startsWith("/api/visit/")
  );
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Signing out: no session check or refresh here — a refreshed login cookie on
  // this response would undo the sign-out (the route clears the cookies itself)
  if (pathname === "/api/auth/logout") {
    const headers = new Headers(request.headers);
    headers.delete(USER_ID_HEADER);
    headers.delete(USER_EMAIL_HEADER);
    headers.delete(AUTH_GRACE_HEADER);
    headers.delete(AUTH_CHECKED_HEADER);
    return NextResponse.next({ request: { headers } });
  }

  const isPublic = isPublicPath(pathname);

  const authCookieKey = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
    .map((c) => `${c.name}=${c.value}`)
    .join(";");

  let user: VerifiedUser | null = null;
  // Let in on the renewal grace (Security only — see AUTH_GRACE_HEADER)
  let grace = false;
  // Supabase could not be reached to renew (e.g. a tab reopened before the network is up): every role stays in
  let graceNet = false;
  const cookiesToSet: { name: string; value: string; options: any }[] = [];

  if (authCookieKey) {
    const cached = sessionCache.get(authCookieKey);
    if (cached && cached.expiresAt > Date.now()) {
      user = cached.user;
      grace = !!cached.grace;
    }

    if (!user) {
      const token = readAccessToken(request);
      if (token) user = await verifyLocally(token);
    }

    if (!user) {
      // Shared with any other request renewing this same login right now
      const renewal = await renewSession(request, authCookieKey);
      const { error } = renewal;
      const claims = renewal.claims as { sub?: string; email?: unknown; exp?: unknown } | null;
      if (claims?.sub) {
        for (const c of renewal.cookies) request.cookies.set(c.name, c.value);
        cookiesToSet.push(...renewal.cookies);
      } else {
        // Not renewed — Supabase unreachable, or it no longer knows this login
        // ("Refresh Token Not Found"). Stay signed in on the genuinely signed
        // current token: getAuthUser lets only Security in this way, and their
        // API routes make them a fresh login (src/lib/auth/revive.ts). No cookie
        // is cleared here, so a tablet signs out only by Log out.
        const token = readAccessToken(request);
        const fallback = token ? await verifyExpiredButGenuine(token) : null;
        if (fallback) {
          user = fallback;
          if (isTransientAuthError(error)) {
            // Unreachable: everyone stays signed in; the next request tries the renewal again
            graceNet = true;
            console.warn("[auth] session renewal unreachable — kept the user signed in");
          } else {
            // Refused (login gone): Security only, not asked again for a few minutes
            grace = true;
            sessionCache.set(authCookieKey, { user, grace: true, expiresAt: Date.now() + GRACE_CACHE_MS });
            console.warn("[auth] session not renewed — kept on its current token (Security only)");
          }
        }
      }
      if (claims?.sub) {
        user = { id: claims.sub, email: (claims.email as string) || "" };
        const expMs = typeof claims.exp === "number" ? claims.exp * 1000 : Date.now() + CACHE_TTL_MS;
        if (cookiesToSet.length === 0) {
          sessionCache.set(authCookieKey, {
            user,
            expiresAt: Math.min(Date.now() + CACHE_TTL_MS, expMs),
          });
          if (sessionCache.size > MAX_CACHE_SIZE) {
            const oldest = sessionCache.keys().next().value;
            if (oldest) sessionCache.delete(oldest);
          }
        }
      }
    }
  }

  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = authCookieKey ? "?ended=1" : "";
    const redirect = NextResponse.redirect(url);
    // A session that could not be renewed is removed here, so the login page
    // does not try to renew it again (one less wait on a fresh open)
    cookiesToSet.forEach(({ name, value, options }) => redirect.cookies.set(name, value, options));
    return redirect;
  }

  // Build downstream headers AFTER any cookie refresh so server code sees the new cookies.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(USER_ID_HEADER);
  requestHeaders.delete(USER_EMAIL_HEADER);
  requestHeaders.delete(AUTH_GRACE_HEADER);
  requestHeaders.set(AUTH_CHECKED_HEADER, "1");
  // "1": login refused — only Security is let in (getAuthUser); "net": renewal unreachable — everyone
  if (user && grace) requestHeaders.set(AUTH_GRACE_HEADER, "1");
  else if (user && graceNet) requestHeaders.set(AUTH_GRACE_HEADER, "net");
  if (user) {
    requestHeaders.set(USER_ID_HEADER, user.id);
    if (user.email) requestHeaders.set(USER_EMAIL_HEADER, user.email);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

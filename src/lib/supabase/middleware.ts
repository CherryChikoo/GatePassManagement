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
const sessionCache = new Map<string, { user: VerifiedUser; expiresAt: number }>();
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
const RENEWAL_GRACE_S = 7 * 24 * 60 * 60;

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

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/callback" ||
    pathname === "/api/health" ||
    pathname === "/api/version" ||
    pathname.startsWith("/api/cron/")
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
  const cookiesToSet: { name: string; value: string; options: any }[] = [];

  if (authCookieKey) {
    const cached = sessionCache.get(authCookieKey);
    if (cached && cached.expiresAt > Date.now()) {
      user = cached.user;
    }

    if (!user) {
      const token = readAccessToken(request);
      if (token) user = await verifyLocally(token);
    }

    if (!user) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { fetch: timedFetch },
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(toSet) {
              toSet.forEach(({ name, value }) => request.cookies.set(name, value));
              cookiesToSet.push(...toSet);
            },
          },
        }
      );

      // getClaims() verifies the JWT signature (JWKS, or the Auth server for
      // legacy symmetric keys) and refreshes the session when needed.
      const { data, error } = await supabase.auth.getClaims().catch((err: unknown) => ({ data: null, error: err }));
      const claims = data?.claims;
      if (!claims?.sub && isTransientAuthError(error)) {
        // Could not reach Supabase to renew: stay signed in on the (genuinely
        // signed) current token; the next request tries the renewal again.
        // Any cookie change from the failed attempt is dropped (never a sign-out).
        const token = readAccessToken(request);
        const fallback = token ? await verifyExpiredButGenuine(token) : null;
        if (fallback) {
          user = fallback;
          grace = true;
          cookiesToSet.length = 0;
          console.warn("[auth] session renewal unreachable — kept the user signed in");
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
    url.search = "";
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
  if (user && grace) requestHeaders.set(AUTH_GRACE_HEADER, "1");
  if (user) {
    requestHeaders.set(USER_ID_HEADER, user.id);
    if (user.email) requestHeaders.set(USER_EMAIL_HEADER, user.email);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

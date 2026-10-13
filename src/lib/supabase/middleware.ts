import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decodeJwt } from "jose";

// Cache validated sessions for 60s to eliminate external Supabase Auth network latency on rapid navigations
// Increased to 2000 entries for 5K+ concurrent users (was 200 - caused cache thrashing)
const sessionCache = new Map<string, { user: any; expiresAt: number }>();
const MAX_CACHE_SIZE = 2000;

function extractUserFromCookies(cookies: { name: string; value: string }[]): { id: string; email: string } | null {
  try {
    const authCookies = cookies.filter((c) => c.name.includes("-auth-token"));
    if (authCookies.length === 0) return null;

    let raw = "";
    if (authCookies.length === 1) {
      raw = authCookies[0].value;
    } else {
      authCookies.sort((a, b) => {
        const numA = parseInt(a.name.slice(a.name.lastIndexOf(".") + 1), 10) || 0;
        const numB = parseInt(b.name.slice(b.name.lastIndexOf(".") + 1), 10) || 0;
        return numA - numB;
      });
      raw = authCookies.map((c) => c.value).join("");
    }

    if (!raw) return null;

    if (raw.startsWith("base64-")) {
      const b64 = raw.slice(7);
      if (typeof atob === "function") {
        raw = atob(b64);
      } else {
        raw = Buffer.from(b64, "base64").toString("utf-8");
      }
    }

    const parsed = JSON.parse(raw);
    const token =
      parsed.access_token ||
      (Array.isArray(parsed) ? parsed[0] : null) ||
      (typeof parsed === "string" ? parsed : null);

    if (!token || typeof token !== "string") return null;

    const payload = decodeJwt(token);
    if (!payload || !payload.sub || typeof payload.exp !== "number") return null;

    // Check expiration with a 30s buffer
    if (payload.exp * 1000 < Date.now() + 30_000) {
      return null;
    }

    return {
      id: payload.sub as string,
      email: (payload.email as string) || (parsed.user?.email as string) || "",
    };
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  const publicRoutes = ["/login", "/api/auth/callback", "/api/health", "/api/cron"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  // For public routes, let them through immediately
  if (isPublicRoute) {
    return NextResponse.next({
      request,
    });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const allCookies = request.cookies.getAll();
  const authCookieKey = allCookies
    .filter((c) => c.name.includes("auth-token"))
    .map((c) => `${c.name}=${c.value}`)
    .join(";");

  let user: any = null;

  // 1. Check in-memory session cache
  if (authCookieKey) {
    const cached = sessionCache.get(authCookieKey);
    if (cached && cached.expiresAt > Date.now()) {
      user = cached.user;
    }
  }

  // 2. Fast local JWT decoding from cookie to avoid Supabase network latency
  if (!user && authCookieKey) {
    const localUser = extractUserFromCookies(allCookies);
    if (localUser) {
      user = localUser;
      sessionCache.set(authCookieKey, {
        user,
        expiresAt: Date.now() + 60_000,
      });
    }
  }

  // 3. Fallback to Supabase Auth network call if not cached or local decode didn't succeed
  if (!user && authCookieKey) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();

    user = fetchedUser;

    if (user && authCookieKey) {
      sessionCache.set(authCookieKey, {
        user,
        expiresAt: Date.now() + 60_000,
      });
      // LRU eviction - remove oldest entries when cache is full
      if (sessionCache.size > MAX_CACHE_SIZE) {
        const entriesToDelete = sessionCache.size - MAX_CACHE_SIZE;
        const keys = Array.from(sessionCache.keys());
        for (let i = 0; i < entriesToDelete; i++) {
          sessionCache.delete(keys[i]);
        }
      }
    }
  }

  // 3. Handle unauthenticated access
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 4. Forward authenticated user ID & email downstream via request headers
  if (user) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", user.id);
    if (user.email) requestHeaders.set("x-user-email", user.email);

    const responseWithHeaders = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    supabaseResponse.cookies.getAll().forEach((cookie) => {
      responseWithHeaders.cookies.set(cookie.name, cookie.value, cookie);
    });

    return responseWithHeaders;
  }

  return supabaseResponse;
}


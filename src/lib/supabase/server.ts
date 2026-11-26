import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase Auth calls (e.g. renewing an expired session) give up after 8 s instead of hanging */
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(8_000) });

/** keepCookies: a failed renewal never removes the login cookies (Security: only Log out signs out) */
export async function createServerSupabaseClient({ keepCookies = false }: { keepCookies?: boolean } = {}) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timedFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // A cleared login (empty value) is ignored when keepCookies is set
          if (keepCookies && cookiesToSet.some(({ value }) => !value)) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

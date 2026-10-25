import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateProfileCache } from "@/lib/auth/helpers";

/**
 * Sign out (POST). A plain request rather than a server action:
 * - it never waits behind another action still running on the page, and
 * - the proxy skips its session refresh for this path (src/lib/supabase/middleware.ts),
 *   so a refreshed login cookie can never be written back on the same response
 *   that deletes it — which left people signed in on the first try.
 * Every Supabase login cookie is cleared; the browser then replaces the page
 * with /login (stores/app-store.ts: logoutAndClear).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getClaims();
    userId = (data?.claims?.sub as string) || null;
    // This device only (scope "local"): other signed-in devices stay signed in
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Already signed out / Auth unreachable: the cookies are cleared below anyway
  }

  const res = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
      res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }
  if (userId) invalidateProfileCache(userId);
  return res;
}

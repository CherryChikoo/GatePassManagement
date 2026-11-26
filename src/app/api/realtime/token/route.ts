import { headers } from "next/headers";
import { AUTH_GRACE_HEADER } from "@/lib/supabase/middleware";
import { reviveSecuritySession } from "@/lib/auth/revive";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The signed-in user's current access token (and id), for the live-updates
 * connection (src/lib/realtime/live.ts) to join its private channels. What
 * each user may listen to is enforced by the database policies
 * (prisma/migrations/realtime_live_updates.sql): gate staff the gate channel,
 * everyone only their own user:<id> topic.
 *
 * The proxy refreshes the session cookie before this runs, so the browser
 * never refreshes tokens itself (which could clash with the server's
 * refresh). Called about once an hour per open screen.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  // Security tablet on its old login: make a fresh one first (live updates need a current login).
  // A failed renewal here never clears the tablet's login (only Log out does that).
  if (user.role === "SECURITY" && (await headers()).get(AUTH_GRACE_HEADER) === "1") {
    const revived = await reviveSecuritySession(user.userId, user.email);
    if (!revived) return NextResponse.json({ error: "Live updates are paused" }, { status: 503, headers: NO_STORE });
  }
  const supabase = await createServerSupabaseClient({ keepCookies: user.role === "SECURITY" });
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  // Out of date (renewal could not reach Supabase just now): the screen asks again shortly
  if ((session.expires_at ?? 0) * 1000 < Date.now() + 30_000) {
    return NextResponse.json({ error: "Live updates are paused" }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json(
    { token: session.access_token, expiresAt: (session.expires_at ?? 0) * 1000, userId: session.user.id },
    { headers: NO_STORE }
  );
}

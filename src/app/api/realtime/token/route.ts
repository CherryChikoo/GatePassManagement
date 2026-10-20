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
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  return NextResponse.json(
    { token: session.access_token, expiresAt: (session.expires_at ?? 0) * 1000, userId: session.user.id },
    { headers: NO_STORE }
  );
}

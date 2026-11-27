import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { saveNotifications } from "@/lib/notifications/send";
import { pingUsersNow } from "@/lib/realtime/notify";

/**
 * A test notification for the signed-in person: kept in their bell, shown as the in-portal
 * alert when the portal is open, and sent to their devices when it is closed.
 * Body { delay } (seconds, up to 8): time to close or minimise the portal first.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { delay?: unknown };
  const delay = Math.min(8, Math.max(0, Number(body.delay) || 0));
  if (delay) await new Promise((r) => setTimeout(r, delay * 1000));
  await saveNotifications(
    [
      {
        profileId: user.profileId,
        userId: user.userId,
        kind: "system",
        level: "IMPORTANT",
        title: "Test notification",
        body: "Gate Pass alerts are working",
        link: null,
        dedupeKey: `test:${user.profileId}:${Date.now()}`,
      },
    ],
    pingUsersNow
  );
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}

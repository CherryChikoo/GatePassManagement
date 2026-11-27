import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { deliverPush } from "@/lib/notifications/push";

/** A test notification to the signed-in person's own devices (not kept in the bell) */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  await deliverPush([
    {
      profileId: user.profileId,
      kind: "system",
      level: "IMPORTANT",
      title: "Notifications are on",
      body: "Gate Pass alerts will appear here",
      link: "/settings",
      dedupeKey: `test:${Date.now()}`,
    },
  ]);
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}

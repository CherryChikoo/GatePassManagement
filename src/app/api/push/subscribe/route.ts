import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";

/**
 * This device's phone / desktop notifications for the signed-in person.
 * POST   { subscription }  → on (a device moved to another person is re-assigned)
 * DELETE { endpoint }      → off
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

type Body = { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; endpoint?: unknown; userAgent?: unknown };

const validEndpoint = (e: unknown): e is string => typeof e === "string" && e.startsWith("https://") && e.length < 1000;

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => null)) as Body | null;
  const sub = body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!validEndpoint(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400, headers: NO_STORE });
  }
  const userAgent = typeof body?.userAgent === "string" ? body.userAgent.slice(0, 200) : null;
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, userAgent, profileId: user.profileId },
      update: { p256dh, auth, userAgent, profileId: user.profileId },
    });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[push] subscribe failed:", err?.message);
    return NextResponse.json({ error: "Could not turn on notifications" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!validEndpoint(body?.endpoint)) return NextResponse.json({ error: "Invalid device" }, { status: 400, headers: NO_STORE });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, profileId: user.profileId } }).catch(() => {});
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}

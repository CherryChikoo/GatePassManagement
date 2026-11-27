import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";

/**
 * What the signed-in person muted (Urgent ones always come).
 * GET → { muted }   POST { muted } → saved
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const KINDS = ["request", "pass", "scan", "visitor", "system"];

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const row = await prisma.notificationPreference.findUnique({ where: { profileId: user.profileId }, select: { muted: true } }).catch(() => null);
  return NextResponse.json({ muted: row?.muted ?? [] }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => null)) as { muted?: unknown } | null;
  const muted = Array.isArray(body?.muted) ? [...new Set(body.muted.filter((k): k is string => typeof k === "string" && KINDS.includes(k)))] : null;
  if (!muted) return NextResponse.json({ error: "Invalid choice" }, { status: 400, headers: NO_STORE });
  try {
    await prisma.notificationPreference.upsert({
      where: { profileId: user.profileId },
      create: { profileId: user.profileId, muted },
      update: { muted },
    });
    return NextResponse.json({ success: true, muted }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[notifications] preferences failed:", err?.message);
    return NextResponse.json({ error: "Could not save" }, { status: 500, headers: NO_STORE });
  }
}

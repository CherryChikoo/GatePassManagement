import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";

/**
 * The signed-in person's notifications (the bell): the newest 30 and how many
 * are unread. One small indexed read; asked on open and when a live "notify"
 * ping arrives — never polled.
 *
 * GET  /api/notifications            → { items, unread }
 * POST /api/notifications {ids?|all} → marks them read
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const LIMIT = 30;

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { profileId: user.profileId },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
        select: { id: true, kind: true, level: true, title: true, body: true, link: true, createdAt: true, readAt: true },
      }),
      prisma.notification.count({ where: { profileId: user.profileId, readAt: null } }),
    ]);
    return NextResponse.json(
      { items: items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null })), unread },
      { headers: NO_STORE }
    );
  } catch (err: any) {
    console.error("[notifications] list failed:", err?.message);
    return NextResponse.json({ error: "Could not load notifications" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => null)) as { ids?: unknown; all?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  if (!ids.length && body?.all !== true) return NextResponse.json({ error: "Nothing to mark" }, { status: 400, headers: NO_STORE });
  try {
    await prisma.notification.updateMany({
      where: { profileId: user.profileId, readAt: null, ...(ids.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[notifications] mark read failed:", err?.message);
    return NextResponse.json({ error: "Could not update" }, { status: 500, headers: NO_STORE });
  }
}

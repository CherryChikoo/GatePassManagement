import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { passSig } from "@/lib/passes/pass-sig";

/**
 * Tiny "has my pass changed?" check for the pass holder's screen (QR shown,
 * or waiting for approval). Returns only a short fingerprint of the pass —
 * status, QR use and number of gate scans — from one indexed lookup, so the
 * screen can check every few seconds and reload its data only when something
 * actually changed (scanned, approved, rejected…).
 *
 * Only the pass's own student / faculty member gets an answer.
 */
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const p = await prisma.permission.findFirst({
    where: {
      id,
      OR: [{ student: { profileId: user.profileId } }, { faculty: { profileId: user.profileId } }],
    },
    select: {
      status: true,
      qr: { select: { usedForExit: true, usedForEntry: true, active: true } },
      _count: { select: { movements: true } },
    },
  });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sig = passSig(p, p._count.movements);
  return NextResponse.json({ sig }, { headers: { "Cache-Control": "no-store" } });
}

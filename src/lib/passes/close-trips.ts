import type { Prisma, PrismaClient } from "@prisma/client";
import { OPEN_TRIP_WHERE } from "./return-scan";

type Db = PrismaClient | Prisma.TransactionClient;
type Owner = { studentId?: string | null; facultyId?: string | null };

/**
 * A trip (faculty / outing pass scanned out, no return yet) is over once the
 * same person goes through the gate again: they were back on campus, even if
 * they came back on another pass (e.g. after being changed between day scholar
 * and hosteller). Such passes are completed, so they no longer block new
 * requests or show as "out" / "Delayed return". The books still show when the
 * person came back (their next gate scan).
 */
async function completeTrips(db: Db, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  await db.qrCredential.updateMany({ where: { permissionId: { in: ids } }, data: { usedForEntry: true, active: false } });
  const done = await db.permission.updateMany({ where: { id: { in: ids }, status: "EXITED" }, data: { status: "COMPLETED" } });
  return done.count;
}

/**
 * At a gate scan (exit or entry): the person's other open trips are over.
 * `exceptPermissionId` = the pass being scanned now (it may itself become a trip).
 */
export async function closeSupersededTrips(db: Db, owner: Owner, exceptPermissionId?: string): Promise<number> {
  const ownerWhere = owner.studentId ? { studentId: owner.studentId } : owner.facultyId ? { facultyId: owner.facultyId } : null;
  if (!ownerWhere) return 0;
  const open = await db.permission.findMany({
    where: { ...ownerWhere, ...OPEN_TRIP_WHERE, ...(exceptPermissionId ? { id: { not: exceptPermissionId } } : {}) },
    select: { id: true },
  });
  return completeTrips(db, open.map((p) => p.id));
}

/**
 * Open trips whose person has gone through the gate again since — e.g. trips
 * left open before this rule existed. All of them (pass cleanup, nightly cron),
 * or one person's (checked right before they request a new pass).
 */
export async function closeAllSupersededTrips(db: Db, owner?: Owner): Promise<number> {
  const ownerWhere = owner?.studentId ? { studentId: owner.studentId } : owner?.facultyId ? { facultyId: owner.facultyId } : {};
  const open = await db.permission.findMany({
    where: { ...ownerWhere, ...OPEN_TRIP_WHERE },
    take: 500,
    select: {
      id: true,
      studentId: true,
      facultyId: true,
      movements: { where: { type: "EXIT" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const superseded: string[] = [];
  for (const p of open) {
    const exitAt = p.movements[0]?.createdAt;
    if (!exitAt) continue;
    const later = await db.movement.findFirst({
      where: {
        ...(p.studentId ? { studentId: p.studentId } : { facultyId: p.facultyId }),
        createdAt: { gt: exitAt },
        NOT: { permissionId: p.id },
      },
      select: { id: true },
    });
    if (later) superseded.push(p.id);
  }
  return completeTrips(db, superseded);
}

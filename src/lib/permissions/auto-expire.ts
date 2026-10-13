import { prisma } from "@/lib/db/prisma";
import { istStartOfDay } from "@/lib/time/ist";

let lastRunTime = 0;
// Opportunistic cleanup from request handlers, at most every 5 minutes per
// instance. Correctness does not depend on it: QR expiry and pass dates are
// re-checked at scan time, and the nightly cron does the full sweep.
const THROTTLE_INTERVAL_MS = 5 * 60_000;

/**
 * Automatically expires outdated permissions and QR credentials.
 *
 * Rules (all day boundaries are IST):
 * 1. An APPROVED pass whose QR validity window (expiresAt) has passed is EXPIRED.
 * 2. A PENDING or un-used APPROVED pass whose scheduled date (exitDate) is before
 *    today is EXPIRED. Advance requests for future dates are left alone.
 */
export async function autoExpireOutdatedPermissions(force: boolean = false) {
  const now = Date.now();
  if (!force && now - lastRunTime < THROTTLE_INTERVAL_MS) {
    return { skipped: true };
  }
  lastRunTime = now;

  try {
    const nowDate = new Date();
    const today = istStartOfDay(nowDate);

    // 1. QR validity window ended
    const expiredQrs = await prisma.qrCredential.findMany({
      where: { active: true, expiresAt: { lt: nowDate } },
      select: { id: true, permissionId: true },
    });

    let expiredByTimeLimit = 0;
    if (expiredQrs.length > 0) {
      const [updatedPerms] = await prisma.$transaction([
        prisma.permission.updateMany({
          where: { id: { in: expiredQrs.map((q) => q.permissionId) }, status: "APPROVED" },
          data: { status: "EXPIRED" },
        }),
        prisma.qrCredential.updateMany({
          where: { id: { in: expiredQrs.map((q) => q.id) } },
          data: { active: false },
        }),
      ]);
      expiredByTimeLimit = updatedPerms.count;
    }

    // 2. Scheduled day is over
    const [expiredByDayEnd] = await prisma.$transaction([
      prisma.permission.updateMany({
        where: { status: { in: ["PENDING", "APPROVED"] }, exitDate: { lt: today } },
        data: { status: "EXPIRED" },
      }),
      prisma.qrCredential.updateMany({
        where: { active: true, usedForExit: false, usedForEntry: false, permission: { exitDate: { lt: today } } },
        data: { active: false },
      }),
    ]);

    return { success: true, expiredByTimeLimit, expiredByDayEnd: expiredByDayEnd.count };
  } catch (error: any) {
    console.error("[autoExpireOutdatedPermissions Error]", error?.message);
    return { success: false, error: "Auto-expire failed" };
  }
}

type ActivePassOwner = { studentId: string } | { facultyId: string };

async function resolveActivePass(owner: ActivePassOwner, withApproverNames: boolean) {
  const now = new Date();
  const today = istStartOfDay(now);

  const existingActive = await prisma.permission.findFirst({
    where: { ...owner, status: { in: ["PENDING", "APPROVED"] } },
    include: {
      qr: true,
      ...(withApproverNames
        ? {
            approval: {
              include: {
                faculty: { select: { profile: { select: { name: true } } } },
                warden: { select: { profile: { select: { name: true } } } },
              },
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existingActive) return null;

  const qrEnded =
    existingActive.status === "APPROVED" &&
    existingActive.qr &&
    (!existingActive.qr.active || existingActive.qr.expiresAt <= now);
  const dayEnded = existingActive.exitDate < today;

  if (qrEnded || dayEnded) {
    await prisma.$transaction([
      prisma.permission.updateMany({
        where: { id: existingActive.id, status: { in: ["PENDING", "APPROVED"] } },
        data: { status: "EXPIRED" },
      }),
      prisma.qrCredential.updateMany({
        where: { permissionId: existingActive.id },
        data: { active: false },
      }),
    ]);
    return null;
  }

  return existingActive;
}

/**
 * Returns the student's current PENDING/APPROVED pass, expiring it first if its
 * time window or scheduled day has ended (so students are never falsely blocked).
 */
export async function resolveStudentActivePass(studentId: string) {
  return resolveActivePass({ studentId }, true) as Promise<any>;
}

/** Same as resolveStudentActivePass, for faculty passes. */
export async function resolveFacultyActivePass(facultyId: string) {
  return resolveActivePass({ facultyId }, false) as Promise<any>;
}

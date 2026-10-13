import { prisma } from "@/lib/db/prisma";

let lastRunTime = 0;
const THROTTLE_INTERVAL_MS = 60_000; // Run at most once every 60s in regular flows

/**
 * Automatically expires outdated permissions and QR credentials in the database.
 * 
 * Rules enforced:
 * 1. Time Limit Expiry: Any APPROVED pass whose QR code validity window (expiresAt) has passed is marked EXPIRED.
 * 2. Same-Day Expiry (Midnight): Any PENDING or un-exited APPROVED pass from previous days (createdAt < today) is marked EXPIRED.
 */
export async function autoExpireOutdatedPermissions(force: boolean = false) {
  const now = Date.now();
  if (!force && now - lastRunTime < THROTTLE_INTERVAL_MS) {
    return { skipped: true };
  }
  lastRunTime = now;

  try {
    const nowDate = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Expire approved passes whose QR validity window (expiresAt) has ended
    const expiredQrs = await prisma.qrCredential.findMany({
      where: {
        active: true,
        expiresAt: { lt: nowDate },
      },
      select: {
        id: true,
        permissionId: true,
      },
    });

    let expiredQrPassesCount = 0;
    if (expiredQrs.length > 0) {
      const qrIds = expiredQrs.map((q) => q.id);
      const permIds = expiredQrs.map((q) => q.permissionId);

      const [updatedPerms] = await prisma.$transaction([
        prisma.permission.updateMany({
          where: {
            id: { in: permIds },
            status: "APPROVED",
          },
          data: {
            status: "EXPIRED",
          },
        }),
        prisma.qrCredential.updateMany({
          where: {
            id: { in: qrIds },
          },
          data: {
            active: false,
          },
        }),
      ]);
      expiredQrPassesCount = updatedPerms.count;
    }

    // 2. Scheduled Date Expiry: Expire all PENDING or un-exited APPROVED requests whose day has ended
    const midnightExpired = await prisma.permission.updateMany({
      where: {
        status: { in: ["PENDING", "APPROVED"] },
        OR: [
          { exitDate: { lt: today } },
          { createdAt: { lt: today } },
        ],
      },
      data: {
        status: "EXPIRED",
      },
    });

    // Deactivate any dangling QRs whose scheduled exit date has passed
    await prisma.qrCredential.updateMany({
      where: {
        active: true,
        usedForExit: false,
        permission: {
          exitDate: { lt: today },
        },
      },
      data: {
        active: false,
      },
    });

    return {
      success: true,
      expiredByTimeLimit: expiredQrPassesCount,
      expiredByDayEnd: midnightExpired.count,
    };
  } catch (error) {
    console.error("[autoExpireOutdatedPermissions Error]", error);
    return { success: false, error };
  }
}

/**
 * Checks and immediately expires any existing active pass for a student if its time limit has passed,
 * ensuring they are never falsely blocked from applying for a new pass.
 */
export async function resolveStudentActivePass(studentId: string) {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingActive = await prisma.permission.findFirst({
    where: {
      studentId,
      status: { in: ["PENDING", "APPROVED"] },
    },
    include: {
      qr: true,
      approval: {
        include: {
          faculty: { select: { profile: { select: { name: true } } } },
          warden: { select: { profile: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existingActive) return null;

  // Check if APPROVED pass time limit expired
  if (
    existingActive.status === "APPROVED" &&
    existingActive.qr &&
    (!existingActive.qr.active || new Date(existingActive.qr.expiresAt) <= now)
  ) {
    await prisma.$transaction([
      prisma.permission.update({
        where: { id: existingActive.id },
        data: { status: "EXPIRED" },
      }),
      prisma.qrCredential.updateMany({
        where: { permissionId: existingActive.id },
        data: { active: false },
      }),
    ]);
    return null; // Expired, no longer active
  }

  // Check if PENDING pass exit date has passed
  if (existingActive.status === "PENDING" && existingActive.exitDate < today) {
    await prisma.permission.update({
      where: { id: existingActive.id },
      data: { status: "EXPIRED" },
    });
    return null; // Expired, no longer active
  }

  return existingActive;
}

/**
 * Checks and immediately expires any existing active pass for a faculty member if its time limit has passed.
 */
export async function resolveFacultyActivePass(facultyId: string) {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingActive = await prisma.permission.findFirst({
    where: {
      facultyId,
      status: { in: ["PENDING", "APPROVED"] },
    },
    include: {
      qr: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existingActive) return null;

  // Check if APPROVED pass time limit expired
  if (
    existingActive.status === "APPROVED" &&
    existingActive.qr &&
    (!existingActive.qr.active || new Date(existingActive.qr.expiresAt) <= now)
  ) {
    await prisma.$transaction([
      prisma.permission.update({
        where: { id: existingActive.id },
        data: { status: "EXPIRED" },
      }),
      prisma.qrCredential.updateMany({
        where: { permissionId: existingActive.id },
        data: { active: false },
      }),
    ]);
    return null;
  }

  // Check if PENDING pass exit date has passed
  if (existingActive.status === "PENDING" && existingActive.exitDate < today) {
    await prisma.permission.update({
      where: { id: existingActive.id },
      data: { status: "EXPIRED" },
    });
    return null;
  }

  return existingActive;
}

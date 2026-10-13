"use server";

import type { ApproverType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, type AuthUser } from "@/lib/auth/helpers";
import { generateQrToken } from "@/lib/qr/token";
import { revalidatePath } from "next/cache";
import { getDepartmentVariants } from "@/lib/constants";
import { APPROVAL_EXPIRY_MINUTES, batchApprovalSchema } from "@/lib/validation/schemas";
import { istDayRange, istStartOfDay } from "@/lib/time/ist";

// In-memory dashboard caches for faculty and warden (15s TTL)
const facultyDashboardCache = new Map<string, { data: any; expiresAt: number }>();
const wardenDashboardCache = new Map<string, { data: any; expiresAt: number }>();

function invalidateApprovalsCache() {
  facultyDashboardCache.clear();
  wardenDashboardCache.clear();
}

/**
 * Builds the Prisma filter for PENDING permissions the given approver may act on.
 * Returns null when the user has no approver record.
 */
async function getApprovableScope(user: AuthUser): Promise<{
  where: Prisma.PermissionWhereInput;
  facultyRecordId: string | null;
  wardenRecordId: string | null;
} | null> {
  switch (user.role) {
    case "FACULTY": {
      // Legacy: requests that were routed to an individual faculty member.
      const faculty = await prisma.faculty.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
      if (!faculty) return null;
      return {
        where: { approverType: "FACULTY", approverId: faculty.id, studentId: { not: null } },
        facultyRecordId: faculty.id,
        wardenRecordId: null,
      };
    }
    case "WARDEN": {
      const warden = await prisma.warden.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
      if (!warden) return null;
      return {
        where: { approverType: "WARDEN", approverId: warden.id },
        facultyRecordId: null,
        wardenRecordId: warden.id,
      };
    }
    case "FACULTY_ADMIN": {
      const hod = await prisma.faculty.findUnique({
        where: { profileId: user.profileId },
        select: { id: true, department: true },
      });
      if (!hod) return null;
      const variants = getDepartmentVariants(hod.department);
      return {
        where: {
          approverType: "FACULTY_ADMIN",
          // An HOD never approves their own pass
          AND: [{ OR: [{ facultyId: null }, { facultyId: { not: hod.id } }] }],
          OR: [
            { approverId: { in: [user.profileId, hod.id] } },
            ...(variants.length > 0
              ? [
                  { student: { department: { in: variants } } },
                  { faculty: { department: { in: variants } } },
                ]
              : []),
          ],
        },
        facultyRecordId: hod.id,
        wardenRecordId: null,
      };
    }
    case "DIRECTOR":
    case "DEAN": {
      const faculty = await prisma.faculty.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
      if (!faculty) return null;
      // Campus leadership acts on faculty / HOD passes (never students, never their own).
      return {
        where: {
          facultyId: { not: null },
          AND: [{ facultyId: { not: faculty.id } }],
        },
        facultyRecordId: faculty.id,
        wardenRecordId: null,
      };
    }
    default:
      return null;
  }
}

function clampExpiryMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return APPROVAL_EXPIRY_MINUTES.DEFAULT;
  return Math.min(APPROVAL_EXPIRY_MINUTES.MAX, Math.max(APPROVAL_EXPIRY_MINUTES.MIN, Math.round(n)));
}

/**
 * Faculty/Warden/HOD/Director/Dean approves or rejects a permission request
 */
export async function handleApproval(
  permissionId: string,
  action: "APPROVE" | "REJECT",
  reason?: string,
  expiryMinutes?: number
) {
  const user = await requireRole("FACULTY", "WARDEN", "FACULTY_ADMIN", "DIRECTOR", "DEAN");

  if (typeof permissionId !== "string" || !permissionId) return { error: "Invalid request" };
  if (action !== "APPROVE" && action !== "REJECT") return { error: "Invalid action" };
  const trimmedReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";

  if (action === "REJECT" && !trimmedReason) {
    return { error: "A reason is required when rejecting a request" };
  }

  const scope = await getApprovableScope(user);
  if (!scope) return { error: "Approver record not found" };

  const permission = await prisma.permission.findFirst({
    where: { AND: [{ id: permissionId, status: "PENDING" }, scope.where] },
    select: { id: true, studentId: true, facultyId: true, exitDate: true },
  });

  if (!permission) {
    return { error: "Permission request not found or already processed" };
  }

  const approvalRecord = {
    approverType: user.role as ApproverType,
    facultyId: scope.facultyRecordId,
    wardenId: scope.wardenRecordId,
  };

  if (action === "REJECT") {
    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.permission.updateMany({
          where: { id: permissionId, status: "PENDING" },
          data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: trimmedReason },
        });
        if (updated.count !== 1) throw new Error(ALREADY_PROCESSED);
        await tx.permissionApproval.upsert({
          where: { permissionId },
          create: { permissionId, ...approvalRecord, approved: false, reason: trimmedReason },
          update: { ...approvalRecord, approved: false, reason: trimmedReason },
        });
      });
    } catch (err: any) {
      if (err?.message === ALREADY_PROCESSED) return { error: "This request was already processed by someone else." };
      console.error("[handleApproval] reject failed:", err?.message);
      return { error: "Failed to reject request" };
    }

    invalidateApprovalsCache();
    revalidateApprovalPaths();
    return { success: true, action: "REJECTED" };
  }

  // APPROVE flow — QR validity:
  // - Pass for today: valid for the chosen window from now.
  // - Advance pass for a future IST day: valid for that whole day (scan is
  //   blocked before the day starts; see security.ts).
  const now = new Date();
  const exitDay = istDayRange(permission.exitDate);
  const expiresAt =
    exitDay.start > now
      ? exitDay.end
      : new Date(now.getTime() + clampExpiryMinutes(expiryMinutes ?? APPROVAL_EXPIRY_MINUTES.DEFAULT) * 60_000);

  const qrTargetId = permission.studentId || permission.facultyId;
  if (!qrTargetId) return { error: "No student or faculty attached to permission" };

  const { token } = await generateQrToken(permissionId, qrTargetId, expiresAt);

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.permission.updateMany({
        where: { id: permissionId, status: "PENDING" },
        data: { status: "APPROVED", approvedAt: now },
      });
      if (updated.count !== 1) throw new Error(ALREADY_PROCESSED);
      await tx.permissionApproval.upsert({
        where: { permissionId },
        create: { permissionId, ...approvalRecord, approved: true, reason: trimmedReason || null },
        update: { ...approvalRecord, approved: true, reason: trimmedReason || null },
      });
      await tx.qrCredential.upsert({
        where: { permissionId },
        create: { permissionId, token, expiresAt, active: true },
        update: { token, expiresAt, active: true, usedForExit: false, usedForEntry: false },
      });
    });
  } catch (err: any) {
    if (err?.message === ALREADY_PROCESSED) return { error: "This request was already processed by someone else." };
    console.error("[handleApproval] approve failed:", err?.message);
    return { error: "Failed to approve request" };
  }

  invalidateApprovalsCache();
  revalidateApprovalPaths();
  return { success: true, action: "APPROVED" };
}

const ALREADY_PROCESSED = "ALREADY_PROCESSED";

function revalidateApprovalPaths() {
  for (const p of [
    "/faculty", "/faculty/requests", "/warden", "/warden/requests",
    "/faculty-admin", "/faculty-admin/requests", "/director", "/director/requests",
    "/dean", "/dean/requests", "/student",
  ]) {
    revalidatePath(p);
  }
}

/**
 * Batch approval — approve up to 5 permissions concurrently
 */
export async function batchApproval(
  permissionIds: string[],
  action: "APPROVE" | "REJECT",
  reason?: string
) {
  await requireRole("FACULTY", "WARDEN", "FACULTY_ADMIN", "DIRECTOR", "DEAN");

  const parsed = batchApprovalSchema.safeParse({ permissionIds, action, reason: reason ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Execute up to 5 requests concurrently; each is individually authorized and atomic
  const results = await Promise.all(
    parsed.data.permissionIds.map(async (id) => {
      try {
        const res = await handleApproval(id, action, reason);
        return {
          id,
          success: !res?.error,
          error: res?.error,
        };
      } catch (err: any) {
        return {
          id,
          success: false,
          error: err?.message || "Failed to process request",
        };
      }
    })
  );

  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    return {
      success: false,
      error: failures.map((f) => f.error).filter(Boolean)[0] || "Some requests failed to process",
      results,
    };
  }

  return { success: true, results };
}

/**
 * Get all requests for faculty (up to 100)
 */
export async function getFacultyAllRequests() {
  const user = await requireRole("FACULTY");

  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!faculty) return [];

  return prisma.permission.findMany({
    where: {
      approverId: faculty.id,
      approverType: "FACULTY",
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: {
        select: {
          studentRoll: true,
          department: true,
          year: true,
          section: true,
          profile: {
            select: { name: true, email: true },
          },
        },
      },
      qr: {
        select: {
          usedForExit: true,
          usedForEntry: true,
        },
      },
    },
  });
}

/**
 * Get all requests for warden (up to 100)
 */
export async function getWardenAllRequests() {
  const user = await requireRole("WARDEN");

  const warden = await prisma.warden.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!warden) return [];

  return prisma.permission.findMany({
    where: {
      approverId: warden.id,
      approverType: "WARDEN",
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: {
        select: {
          studentRoll: true,
          department: true,
          year: true,
          roomNumber: true,
          hostelBlock: true,
          profile: {
            select: { name: true, email: true },
          },
        },
      },
      qr: {
        select: {
          usedForExit: true,
          usedForEntry: true,
        },
      },
    },
  });
}

/**
 * Get faculty dashboard stats
 */
export async function getFacultyDashboard() {
  const user = await requireRole("FACULTY");

  const cached = facultyDashboardCache.get(user.profileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, department: true, designation: true, maxApprovals: true },
  });

  if (!faculty) return null;

  const today = istStartOfDay();

  const [
    totalStudents,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    recentApprovals,
  ] = await Promise.all([
    prisma.student.count({ where: { facultyId: faculty.id } }),
    prisma.permission.count({
      where: {
        approverId: faculty.id,
        status: { in: ["APPROVED", "EXITED", "COMPLETED"] },
        approvedAt: { gte: today },
      },
    }),
    prisma.permission.count({
      where: {
        approverId: faculty.id,
        status: "REJECTED",
        rejectedAt: { gte: today },
      },
    }),
    prisma.movement.count({
      where: {
        student: { facultyId: faculty.id },
        type: "EXIT",
        createdAt: { gte: today },
      },
    }),
    prisma.movement.count({
      where: {
        student: { facultyId: faculty.id },
        type: "ENTRY",
        createdAt: { gte: today },
      },
    }),
      prisma.permission.findMany({
      where: { approverId: faculty.id, approverType: "FACULTY" },
      orderBy: { updatedAt: "desc" },
      take: 10, // Only 10 for dashboard display (was 100 - massive waste)
      select: { // Use select instead of include for better performance
        id: true,
        status: true,
        type: true,
        purpose: true,
        destination: true,
        expectedExit: true,
        expectedReturn: true,
        createdAt: true,
        updatedAt: true,
        rejectionReason: true,
        student: {
          select: {
            studentRoll: true,
            department: true,
            year: true,
            section: true,
            profile: { select: { name: true, phone: true } },
          },
        },
        qr: {
          select: {
            usedForExit: true,
            usedForEntry: true,
            expiresAt: true,
          }
        }
      },
    }),
  ]);

  const result = {
    faculty,
    stats: {
      totalStudents,
      approvedToday,
      rejectedToday,
      exitsToday,
      entriesToday,
    },
    recentActivity: recentApprovals,
  };

  // Cache the result for 15 seconds
  facultyDashboardCache.set(user.profileId, {
    data: result,
    expiresAt: Date.now() + 15000, // 15 seconds cache
  });

  return result;
}

/**
 * Get warden dashboard stats
 */
export async function getWardenDashboard() {
  const user = await requireRole("WARDEN");  const cached = wardenDashboardCache.get(user.profileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const warden = await prisma.warden.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, hostelBlock: true },
  });

  if (!warden) return null;

  const today = istStartOfDay();

  const [
    totalHostellers,
    pendingCount,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    recentApprovals,
  ] = await Promise.all([
      prisma.student.count({ where: { wardenId: warden.id } }),
      prisma.permission.count({
        where: { approverId: warden.id, status: "PENDING", approverType: "WARDEN", createdAt: { gte: today } },
      }),
      prisma.permission.count({
        where: {
          approverId: warden.id,
          status: { in: ["APPROVED", "EXITED", "COMPLETED"] },
          approvedAt: { gte: today },
        },
      }),
      prisma.permission.count({
        where: {
          approverId: warden.id,
          status: "REJECTED",
          rejectedAt: { gte: today },
        },
      }),
      prisma.movement.count({
        where: {
          student: { wardenId: warden.id },
          type: "EXIT",
          createdAt: { gte: today },
        },
      }),
      prisma.movement.count({
        where: {
          student: { wardenId: warden.id },
          type: "ENTRY",
          createdAt: { gte: today },
        },
      }),
      prisma.permission.findMany({
        where: { approverId: warden.id, approverType: "WARDEN" },
        orderBy: { updatedAt: "desc" },
        take: 10, // Only 10 for dashboard display (was 100)
        select: { // Use select instead of include
          id: true,
          status: true,
          type: true,
          purpose: true,
          destination: true,
          expectedExit: true,
          expectedReturn: true,
          createdAt: true,
          updatedAt: true,
          rejectionReason: true,
          student: {
            select: {
              studentRoll: true,
              roomNumber: true,
              profile: { select: { name: true, phone: true } },
            },
          },
          qr: {
            select: {
              usedForExit: true,
              usedForEntry: true,
              expiresAt: true,
            }
          }
        },
      }),
    ]);

  const result = {
    warden,
    stats: { 
      totalHostellers, 
      approvedToday,
      rejectedToday,
      exitsToday,
      entriesToday,
    },
    recentActivity: recentApprovals,
  };

  // Cache the result for 15 seconds
  wardenDashboardCache.set(user.profileId, {
    data: result,
    expiresAt: Date.now() + 15000, // 15 seconds cache
  });

  return result;
}

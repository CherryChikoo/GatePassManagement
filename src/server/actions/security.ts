"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole, getAuthUser, type AuthUser } from "@/lib/auth/helpers";
import { verifyQrToken } from "@/lib/qr/token";
import { revalidatePath } from "next/cache";
import { uploadExitPhotoAdmin } from "@/lib/storage/storage-admin";
import { istDateString, istDayRangeFromParam, istStartOfDay } from "@/lib/time/ist";

let securityDashboardCache: { data: any; expiresAt: number } | null = null;
let securityLogCache = new Map<string, { data: any; expiresAt: number }>();

export async function invalidateSecurityCache() {
  // Exported from a "use server" module (browser-callable): require a signed-in user.
  if (!(await getAuthUser())) return;
  securityDashboardCache = null;
  securityLogCache.clear();
}

function clearSecurityCaches() {
  securityDashboardCache = null;
  securityLogCache.clear();
}

/** Every gate movement is attributed to the guard who actually recorded it. */
async function getSecurityStaffId(user: AuthUser): Promise<string | null> {
  const staff = await prisma.securityStaff.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });
  return staff?.id ?? null;
}

const ROLL_RE = /^[A-Za-z0-9/_-]{2,30}$/;

/**
 * Verify a scanned QR (rotating signed token) or a manually typed roll number
 * and return the pass details for the guard.
 */
export async function verifyQrScan(token: string) {
  await requireRole("SECURITY", "ADMIN");
  if (typeof token !== "string" || !token.trim()) {
    return { valid: false, error: "Scan a QR code or enter a roll number" };
  }
  const input = token.trim();

  let permissionId: string | null = null;
  let manualOverride = false;
  let tokenError: string | undefined;

  if (input.split(".").length === 3) {
    // Signed JWT. Only the rotating on-screen tokens are accepted, so
    // screenshots of an old QR stop working within a minute.
    const result = await verifyQrToken(input);
    if (result.valid && result.payload) {
      if (!result.payload.live) {
        return { valid: false, error: "Outdated QR code. Ask the pass holder to open their live pass screen." };
      }
      permissionId = result.payload.permissionId;
    } else {
      tokenError = result.error;
    }
  } else if (ROLL_RE.test(input)) {
    // Manual fallback typed by the guard (e.g. phone not available).
    const studentPerm = await prisma.permission.findFirst({
      where: {
        student: { studentRoll: { equals: input, mode: "insensitive" } },
        status: "APPROVED",
        qr: { active: true },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (studentPerm) {
      permissionId = studentPerm.id;
      manualOverride = true;
    }
  }

  if (!permissionId) {
    return { valid: false, error: tokenError || "Invalid QR code or no approved pass found" };
  }

  // Fetch the full permission with student details
  const permission = await prisma.permission.findUnique({
    where: { id: permissionId },
    include: {
      student: {
        select: {
          id: true,
          studentRoll: true,
          department: true,
          year: true,
          section: true,
          status: true,
          studentType: true,
          profile: {
            select: { name: true, email: true, phone: true },
          },
        },
      },
      faculty: {
        select: {
          id: true,
          employeeId: true,
          department: true,
          profile: {
            select: { name: true, email: true, phone: true },
          },
        },
      },
      qr: {
        select: {
          id: true,
          active: true,
          usedForExit: true,
          usedForEntry: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!permission) {
    return { valid: false, error: "Permission not found" };
  }

  if (!permission.qr) {
    return { valid: false, error: "This pass has no QR credential (not approved)" };
  }

  if (permission.status === "APPROVED" && permission.qr.active && new Date(permission.qr.expiresAt) < new Date()) {
    await prisma.$transaction([
      prisma.permission.updateMany({
        where: { id: permission.id, status: "APPROVED" },
        data: { status: "EXPIRED" },
      }),
      prisma.qrCredential.update({
        where: { id: permission.qr.id },
        data: { active: false },
      }),
    ]);
    return { valid: false, error: "QR code has expired" };
  }

  if (istStartOfDay(permission.exitDate) > new Date()) {
    return { valid: false, error: `This pass is valid only from ${istDateString(permission.exitDate)}.` };
  }

  // Determine what action is allowed
  let allowedAction: "EXIT" | "ENTRY" | null = null;
  if (permission.type === "ENTRY") {
    if (permission.status === "APPROVED" && !permission.qr.usedForEntry && permission.qr.active) {
      allowedAction = "ENTRY";
    }
  } else {
    // Default or EXIT type
    if (permission.status === "APPROVED" && !permission.qr.usedForExit && permission.qr.active) {
      allowedAction = "EXIT";
    }
  }

  if (!allowedAction) {
    if (permission.type !== "ENTRY" && (permission.status === "EXITED" || permission.qr.usedForExit)) {
      return {
        valid: false,
        error: "This Exit Pass has already been used to leave campus. The student must raise a separate Entry Request to enter campus.",
      };
    }
    if (permission.type === "ENTRY" && permission.qr.usedForEntry) {
      return {
        valid: false,
        error: "This Entry Pass has already been used to enter campus.",
      };
    }
    if (permission.status === "APPROVED" && !permission.qr.active) {
      return { valid: false, error: "QR credential is inactive or revoked" };
    }
    const reasons: Record<string, string> = {
      PENDING: "Permission is still pending approval",
      REJECTED: "Permission was rejected",
      CANCELLED: "Permission was cancelled",
      EXPIRED: "Permission has expired",
      COMPLETED: "This pass has already been used and completed",
      EXITED: "Student has already exited. They must raise a separate Entry Request to return.",
    };
    return {
      valid: false,
      error: reasons[permission.status] || "No valid action available for this QR",
    };
  }

  return {
    valid: true,
    allowedAction,
    manualOverride,
    /** Faculty passes: security only verifies and marks the movement (no photo). */
    isFaculty: !!permission.facultyId && !permission.studentId,
    photoRequired: !!permission.studentId,
    permission: {
      id: permission.id,
      type: permission.type,
      status: permission.status,
      purpose: permission.purpose,
      destination: permission.destination,
      expectedExit: permission.expectedExit,
      expectedReturn: permission.expectedReturn,
      approverType: permission.approverType,
      approvedAt: permission.approvedAt,
      // Faculty Book request type / hostel outing details
      requestType: permission.requestType,
      exitDate: permission.exitDate,
      endDate: permission.endDate,
      numberOfDays: permission.numberOfDays,
      parentInformed: permission.parentInformed,
      videoCallNumber: permission.videoCallNumber,
      guardianName: permission.guardianName,
      guardianRelation: permission.guardianRelation,
      hostelInchargeDetails: permission.hostelInchargeDetails,
    },
    student: permission.student || (permission.faculty ? {
      id: permission.faculty.id,
      studentRoll: permission.faculty.employeeId || "FACULTY",
      department: permission.faculty.department,
      year: null,
      section: null,
      status: "ACTIVE" as any,
      studentType: "FACULTY" as any,
      profile: permission.faculty.profile,
    } : null),
  };
}

/** Throws if the pass is outside its valid window (scheduled IST day / QR expiry). */
function assertPassWindow(exitDate: Date, qrExpiresAt: Date) {
  const now = new Date();
  if (qrExpiresAt < now) throw new Error("This gate pass has expired");
  if (istStartOfDay(exitDate) > now) {
    throw new Error(`This pass is valid only from ${istDateString(exitDate)}`);
  }
}

/**
 * Gate photo rule: required for student passes; faculty passes are just
 * verified and marked (a photo, if one is sent anyway, is still stored).
 */
async function resolveGatePhoto(
  permissionId: string,
  imagePath: string | undefined,
  movement: "exit" | "entry"
): Promise<{ path: string | null } | { error: string }> {
  const owner = await prisma.permission.findUnique({
    where: { id: permissionId },
    select: { studentId: true },
  });
  if (!owner) return { error: "Permission not found" };

  if (!imagePath) {
    return owner.studentId
      ? { error: `Photo capture is mandatory for student ${movement} registration` }
      : { path: null };
  }
  if (typeof imagePath !== "string") return { error: "Invalid photo" };
  return storeGatePhoto(imagePath, permissionId);
}

/**
 * Stores a captured gate photo in Supabase Storage and returns its path.
 * If Storage is unavailable the (size-checked) inline image is kept so the
 * gate is never blocked.
 */
async function storeGatePhoto(imageData: string, permissionId: string): Promise<{ path: string } | { error: string }> {
  if (imageData.length > 700_000) {
    return { error: "Captured image is too large. Please retake with lower resolution." };
  }
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageData)) {
    return { error: "Invalid photo format" };
  }
  const owner = await prisma.permission.findUnique({
    where: { id: permissionId },
    select: { studentId: true, facultyId: true },
  });
  if (!owner) return { error: "Permission not found" };

  const upload = await uploadExitPhotoAdmin(imageData, owner.studentId || owner.facultyId || "unknown", permissionId);
  if (upload.path) return { path: upload.path };

  console.error("[storeGatePhoto] storage upload failed, keeping inline image:", upload.error);
  return { path: imageData };
}

/**
 * Register an EXIT movement
 * Uses an interactive transaction to prevent TOCTOU race conditions
 */
export async function registerExit(
  permissionId: string,
  gateId: string,
  imagePath?: string,
  notes?: string
) {
  const user = await requireRole("SECURITY");

  const securityStaffId = await getSecurityStaffId(user);
  if (!securityStaffId) {
    return { error: "Your security staff record was not found. Contact the administrator." };
  }
  const securityStaff = { id: securityStaffId };
  if (typeof permissionId !== "string" || typeof gateId !== "string") {
    return { error: "Invalid request" };
  }
  if (notes !== undefined && (typeof notes !== "string" || notes.length > 500)) {
    return { error: "Notes must be at most 500 characters" };
  }

  // Photo: mandatory for student passes, not needed for faculty passes
  const photoResult = await resolveGatePhoto(permissionId, imagePath, "exit");
  if ("error" in photoResult) return { error: photoResult.error };
  const storedImage = photoResult.path;

  try {
    // Interactive transaction: reads + checks + writes are all atomic
    await prisma.$transaction(async (tx) => {
      // Read permission state INSIDE the transaction
      const permission = await tx.permission.findUnique({
        where: { id: permissionId },
        include: {
          qr: true,
          student: { select: { id: true, status: true } },
        },
      });

      if (!permission) throw new Error("Permission not found");
      if (permission.status !== "APPROVED") {
        throw new Error(`Cannot register exit — permission status is ${permission.status}`);
      }
      if (permission.type === "ENTRY") {
        throw new Error("Cannot register exit with an ENTRY pass. This pass is only for entering campus.");
      }
      if (!permission.qr || !permission.qr.active) {
        throw new Error("QR credential is not active");
      }
      if (permission.qr.usedForExit) {
        throw new Error("Exit already registered for this permission");
      }
      assertPassWindow(permission.exitDate, permission.qr.expiresAt);

      // Verify gate exists
      const gate = await tx.gate.findUnique({ where: { id: gateId } });
      if (!gate || !gate.active) {
        throw new Error("Invalid or inactive gate");
      }

      // All checks passed — perform writes
      await tx.movement.create({
        data: {
          permissionId,
          studentId: permission.studentId || null,
          facultyId: permission.facultyId || null,
          gateId,
          securityUserId: securityStaff.id,
          type: "EXIT",
          imagePath: storedImage,
          notes: notes || null,
        },
      });
      // Mark permission as EXITED (they are currently outside)
      await tx.permission.update({
        where: { id: permissionId },
        data: { status: "EXITED" },
      });
      // Deactivate QR immediately upon exit: this pass is finished and cannot be used again
      await tx.qrCredential.update({
        where: { id: permission.qr!.id },
        data: { 
          usedForExit: true,
          active: false, 
        },
      });
      // Student is now OUTSIDE
      if (permission.studentId) {
        await tx.student.update({
          where: { id: permission.studentId },
          data: { status: "OUTSIDE" },
        });
      }

    });
  } catch (err: any) {
    return { error: err.message || "Failed to register exit" };
  }

  clearSecurityCaches();
  revalidatePath("/security");
  revalidatePath("/security/log");
  revalidatePath("/student");
  revalidatePath("/admin");
  revalidatePath("/faculty");
  revalidatePath("/warden");
  return { success: true };
}

/**
 * Register an ENTRY movement
 */
export async function registerEntry(
  permissionId: string,
  gateId: string,
  imagePath?: string,
  notes?: string
) {
  const user = await requireRole("SECURITY");

  const securityStaffId = await getSecurityStaffId(user);
  if (!securityStaffId) {
    return { error: "Your security staff record was not found. Contact the administrator." };
  }
  const securityStaff = { id: securityStaffId };
  if (typeof permissionId !== "string" || typeof gateId !== "string") {
    return { error: "Invalid request" };
  }
  if (notes !== undefined && (typeof notes !== "string" || notes.length > 500)) {
    return { error: "Notes must be at most 500 characters" };
  }

  // Photo: mandatory for student passes, not needed for faculty passes
  const photoResult = await resolveGatePhoto(permissionId, imagePath, "entry");
  if ("error" in photoResult) return { error: photoResult.error };
  const storedImage = photoResult.path;

  try {
    // Interactive transaction: reads + checks + writes are all atomic
    await prisma.$transaction(async (tx) => {
      const permission = await tx.permission.findUnique({
        where: { id: permissionId },
        include: {
          qr: true,
          student: { select: { id: true, status: true } },
        },
      });

      if (!permission) throw new Error("Permission not found");
      if (permission.type !== "ENTRY") {
        throw new Error("Cannot register entry with an EXIT pass. A separate Entry Request is required to enter campus.");
      }
      if (permission.status !== "APPROVED") {
        throw new Error(`Cannot register entry — permission status is ${permission.status}`);
      }
      if (!permission.qr || !permission.qr.active) {
        throw new Error("QR credential is not active or has expired");
      }
      if (permission.qr.usedForEntry) {
        throw new Error("Entry already registered for this permission");
      }
      assertPassWindow(permission.exitDate, permission.qr.expiresAt);

      const gate = await tx.gate.findUnique({ where: { id: gateId } });
      if (!gate || !gate.active) {
        throw new Error("Invalid or inactive gate");
      }

      // All checks passed — perform writes
      await tx.movement.create({
        data: {
          permissionId,
          studentId: permission.studentId || null,
          facultyId: permission.facultyId || null,
          gateId,
          securityUserId: securityStaff.id,
          type: "ENTRY",
          imagePath: storedImage,
          notes: notes || null,
        },
      });
      await tx.permission.update({
        where: { id: permissionId },
        data: { status: "COMPLETED" },
      });
      await tx.qrCredential.update({
        where: { id: permission.qr!.id },
        data: { usedForEntry: true, active: false },
      });
      if (permission.studentId) {
        await tx.student.update({
          where: { id: permission.studentId },
          data: { status: "INSIDE" },
        });
      }

    });
  } catch (err: any) {
    return { error: err.message || "Failed to register entry" };
  }

  clearSecurityCaches();
  revalidatePath("/security");
  revalidatePath("/security/log");
  revalidatePath("/student");
  revalidatePath("/admin");
  revalidatePath("/faculty");
  revalidatePath("/warden");
  return { success: true };
}

/**
 * Get security dashboard data
 */
export async function getSecurityDashboard() {
  await requireRole("SECURITY", "ADMIN");
  if (securityDashboardCache && securityDashboardCache.expiresAt > Date.now()) {
    return securityDashboardCache.data;
  }

  const today = istStartOfDay();

  const [
    outsiderVisitsToday,
    studentExitsToday,
    studentEntriesToday,
    outsidersInside,
    recentMovements,
    gates,
  ] = await Promise.all([
    prisma.outsider.count({ where: { createdAt: { gte: today } } }),
    prisma.movement.count({
      where: { type: "EXIT", createdAt: { gte: today } },
    }),
    prisma.movement.count({
      where: { type: "ENTRY", createdAt: { gte: today } },
    }),
    prisma.outsider.count({ where: { status: "INSIDE" } }),
    prisma.movement.findMany({
      where: { createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        createdAt: true,
        notes: true,
        student: {
          select: {
            studentRoll: true,
            profile: { select: { name: true } },
          },
        },
        gate: { select: { name: true } },
        permission: {
          select: { purpose: true, destination: true },
        },
      },
    }),
    prisma.gate.findMany({
      where: { active: true },
      select: { id: true, name: true, location: true },
    }),
  ]);

  const result = {
    stats: { outsiderVisitsToday, studentExitsToday, studentEntriesToday, outsidersInside },
    recentMovements,
    gates,
  };

  securityDashboardCache = { data: result, expiresAt: Date.now() + 15_000 };
  return result;
}

export async function getSecurityLogData(dateStr?: string) {
  await requireRole("SECURITY", "ADMIN");

  const { start: targetDate, end: endOfDay, dateStr: selectedDate } = istDayRangeFromParam(dateStr);

  const cacheKey = selectedDate;
  const cached = securityLogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [studentEntries, studentExits, outsiderVisits] = await Promise.all([
    prisma.movement.findMany({
      where: { type: "ENTRY", createdAt: { gte: targetDate, lt: endOfDay } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, createdAt: true, notes: true, imagePath: true,
        student: { select: { studentRoll: true, profile: { select: { name: true, phone: true } } } },
        gate: { select: { name: true } },
        permission: { select: { purpose: true, destination: true } },
      },
    }),
    prisma.movement.findMany({
      where: { type: "EXIT", createdAt: { gte: targetDate, lt: endOfDay } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, createdAt: true, notes: true, imagePath: true,
        student: { select: { studentRoll: true, profile: { select: { name: true, phone: true } } } },
        gate: { select: { name: true } },
        permission: { select: { purpose: true, destination: true } },
      },
    }),
    prisma.outsider.findMany({
      where: { entryTime: { gte: targetDate, lt: endOfDay } },
      orderBy: { entryTime: "desc" },
    }),
  ]);

  const result = { 
    studentEntries, 
    studentExits, 
    outsiderVisits, 
    selectedDate,
  };
  
  securityLogCache.set(cacheKey, { data: result, expiresAt: Date.now() + 15000 }); // 15s cache
  return result;
}

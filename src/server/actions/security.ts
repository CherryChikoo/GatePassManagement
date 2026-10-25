"use server";

import { prisma } from "@/lib/db/prisma";
import { notifyLive, notifyPassHolder } from "@/lib/realtime/notify";
import { requireRole, getAuthUser, type AuthUser } from "@/lib/auth/helpers";
import { verifyScannedQr } from "@/lib/qr/token";
import { revalidatePath } from "next/cache";
import { gatePhotoFolder, isSafeStoragePath, uploadExitPhotoAdmin } from "@/lib/storage/storage-admin";
import { istDateString, istDayRangeFromParam, istStartOfDay } from "@/lib/time/ist";
import { fillMovementPeople } from "@/lib/people";
import { canScanReturn, delayMinutes, formatDelay, returnDueAt } from "@/lib/passes/return-scan";
import { closeSupersededTrips } from "@/lib/passes/close-trips";

// No in-memory copies of these lists: several server instances run at once,
// and a copy kept by one is not cleared by a change made on another (a saved
// record would vanish and come back on reload). The queries take milliseconds.
export async function invalidateSecurityCache() {}

function clearSecurityCaches() {}

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
  let scannedTokenId: string | null = null;
  let manualOverride = false;
  let tokenError: string | undefined;

  if (input.startsWith("GP1.") || input.split(".").length === 3) {
    // Signed rotating code (compact, or a legacy JWT). Only live codes are
    // accepted, so screenshots of an old QR stop working within a minute.
    const result = await verifyScannedQr(input);
    if (result.valid && result.payload) {
      if (!result.payload.live) {
        return { valid: false, error: "Outdated QR code. Ask the pass holder to open their live pass screen." };
      }
      permissionId = result.payload.permissionId;
      scannedTokenId = result.payload.tokenId || null;
    } else {
      tokenError = result.error;
    }
  } else if (ROLL_RE.test(input)) {
    // Manual fallback typed by the guard (e.g. phone not available).
    const studentPerm = await prisma.permission.findFirst({
      where: {
        student: { studentRoll: input.toUpperCase() },
        status: "APPROVED",
        qr: { active: true },
        // Hostel passes are scanned by the warden, not at the gate
        OR: [{ passKind: null }, { passKind: { not: "HOSTEL" } }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (studentPerm) {
      permissionId = studentPerm.id;
      manualOverride = true;
    } else {
      // A hosteller coming back from an outing: their exit pass, used to go out
      const returning = await prisma.permission.findFirst({
        where: {
          student: { studentRoll: input.toUpperCase() },
          approverType: "WARDEN",
          status: "EXITED",
          type: { not: "ENTRY" },
          OR: [{ passKind: null }, { passKind: { not: "HOSTEL" } }],
          qr: { usedForExit: true, usedForEntry: false },
          movements: { none: { type: "ENTRY" } },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (returning) {
        permissionId = returning.id;
        manualOverride = true;
      }
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
            select: { id: true, name: true, email: true, phone: true, avatarUpdatedAt: true },
          },
        },
      },
      faculty: {
        select: {
          id: true,
          employeeId: true,
          department: true,
          designation: true,
          profile: {
            select: { id: true, name: true, email: true, phone: true, avatarUpdatedAt: true },
          },
        },
      },
      // Who approved it (shown to the guard)
      approval: {
        select: {
          approverType: true,
          createdAt: true,
          faculty: { select: { designation: true, profile: { select: { name: true } } } },
          warden: { select: { profile: { select: { name: true } } } },
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
      // A recorded return (faculty: scanned again, or "Mark In")
      movements: { where: { type: "ENTRY" }, select: { id: true }, take: 1 },
    },
  });

  if (!permission) {
    return { valid: false, error: "Permission not found" };
  }

  // The code must match the current QR credential of this pass
  if (scannedTokenId && permission.qr && permission.qr.id !== scannedTokenId) {
    return { valid: false, error: "Outdated QR code. Ask the pass holder to refresh their pass screen." };
  }

  if (permission.passKind === "HOSTEL") {
    return { valid: false, error: "This is a hostel pass. It is scanned by the hostel warden, not at the gate." };
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
    } else if (canScanReturn(permission, permission.movements.length > 0)) {
      // Faculty / hosteller coming back: the same pass QR, scanned a second time
      allowedAction = "ENTRY";
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

  const approvedBy = await approversOf(permission);
  const holder = permission.student?.profile ?? permission.faculty?.profile ?? null;
  // Coming back on the same pass after the planned return: still allowed — shown as a delayed return
  const isReturn = allowedAction === "ENTRY" && permission.type !== "ENTRY";
  const dueAt = isReturn ? returnDueAt(permission) : null;
  const delayedMinutes = delayMinutes(dueAt);
  const photoUrl = holder?.avatarUpdatedAt ? `/avatar/${holder.id}?v=${new Date(holder.avatarUpdatedAt).getTime()}` : null;

  return {
    valid: true,
    allowedAction,
    manualOverride,
    /** Return after the planned time: minutes late (0 = on time), and when it was due */
    delayedMinutes,
    returnDueAt: delayedMinutes > 0 && dueAt ? dueAt.toISOString() : null,
    /** Who approved the pass: name + role (HOD and Dean both, for two-step passes) */
    approvedBy,
    /** The holder's profile photo, to compare with the person at the gate */
    photoUrl,
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
      designation: permission.faculty.designation,
      profile: permission.faculty.profile,
    } : null),
  };
}

const APPROVER_ROLE: Record<string, string> = {
  FACULTY: "Faculty mentor",
  FACULTY_ADMIN: "HOD",
  WARDEN: "Warden",
  DEAN: "Dean",
  DIRECTOR: "Director",
};

/** Names and roles of the people who approved a pass. */
async function approversOf(p: {
  approvalMode: string;
  approverType: string;
  approvedAt: Date | null;
  hodApproverId: string | null;
  hodApprovedAt: Date | null;
  deanApproverId: string | null;
  deanApprovedAt: Date | null;
  approval: {
    approverType: string;
    createdAt: Date;
    faculty: { designation: string | null; profile: { name: string } } | null;
    warden: { profile: { name: string } } | null;
  } | null;
}): Promise<{ role: string; name: string; at: string | null }[]> {
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
  // HOD + Dean passes: both people
  if (p.approvalMode === "BOTH" && (p.hodApproverId || p.deanApproverId)) {
    const ids = [p.hodApproverId, p.deanApproverId].filter((x): x is string => !!x);
    const people = await prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nameOf = (id: string | null) => people.find((x) => x.id === id)?.name ?? "";
    return [
      ...(p.hodApproverId ? [{ role: "HOD", name: nameOf(p.hodApproverId), at: iso(p.hodApprovedAt) }] : []),
      ...(p.deanApproverId ? [{ role: "Dean", name: nameOf(p.deanApproverId), at: iso(p.deanApprovedAt) }] : []),
    ];
  }
  const a = p.approval;
  if (a) {
    const name = a.faculty?.profile.name ?? a.warden?.profile.name ?? "";
    // Deans / Directors: their own title (e.g. "Dean of Academics")
    const role =
      (a.approverType === "DEAN" || a.approverType === "DIRECTOR") && a.faculty?.designation
        ? a.faculty.designation
        : APPROVER_ROLE[a.approverType] ?? a.approverType;
    return [{ role, name, at: iso(p.approvedAt ?? a.createdAt) }];
  }
  return [{ role: APPROVER_ROLE[p.approverType] ?? p.approverType, name: "", at: iso(p.approvedAt) }];
}

/** Throws if the pass is outside its valid window (scheduled IST day / QR expiry). */
function assertPassWindow(exitDate: Date, qrExpiresAt: Date) {
  const now = new Date();
  if (qrExpiresAt < now) throw new Error("This gate pass has expired");
  if (istStartOfDay(exitDate) > now) {
    throw new Error(`This pass is valid only from ${istDateString(exitDate)}.`);
  }
}

/**
 * Gate photo rule: required for student passes; faculty passes are just
 * verified and marked (a photo, if one is sent anyway, is still stored).
 * `imagePath` is either a photo already uploaded with prepareGatePhoto (fast
 * path) or the captured image itself.
 */
async function resolveGatePhoto(
  permissionId: string,
  imagePath: string | undefined,
  movement: "exit" | "entry"
): Promise<{ path: string | null } | { error: string }> {
  const owner = await prisma.permission.findUnique({
    where: { id: permissionId },
    select: { studentId: true, facultyId: true },
  });
  if (!owner) return { error: "Permission not found" };

  if (!imagePath) {
    return owner.studentId
      ? { error: movement === "exit" ? "Take the student's photo before registering the exit" : "Take the student's photo before registering the entry" }
      : { path: null };
  }
  if (typeof imagePath !== "string") return { error: "Invalid photo" };

  // Already uploaded in the background while the guard checked the details
  if (!imagePath.startsWith("data:")) {
    const folder = gatePhotoFolder(owner.studentId || owner.facultyId || "unknown");
    if (isSafeStoragePath(imagePath) && imagePath.startsWith(`${folder}/`)) return { path: imagePath };
    return { error: "Invalid photo" };
  }
  return storeGatePhoto(imagePath, permissionId, owner.studentId || owner.facultyId || "unknown");
}

/**
 * Stores a captured gate photo in Supabase Storage and returns its path.
 * If Storage is unavailable the (size-checked) inline image is kept so the
 * gate is never blocked.
 */
async function storeGatePhoto(imageData: string, permissionId: string, ownerId: string): Promise<{ path: string } | { error: string }> {
  if (imageData.length > 700_000) {
    return { error: "Captured image is too large. Please retake with lower resolution." };
  }
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageData)) {
    return { error: "Invalid photo format" };
  }
  const upload = await uploadExitPhotoAdmin(imageData, ownerId, permissionId);
  if (upload.path) return { path: upload.path };

  console.error("[storeGatePhoto] storage upload failed, keeping inline image:", upload.error);
  return { path: imageData };
}

/**
 * Uploads the gate photo as soon as it is taken, so "Register" only has to
 * save the movement. Returns the stored path to send with registerExit / registerEntry.
 */
export async function prepareGatePhoto(permissionId: string, imageData: string) {
  await requireRole("SECURITY");
  if (typeof permissionId !== "string" || typeof imageData !== "string") return { error: "Invalid photo" };
  const pass = await prisma.permission.findUnique({
    where: { id: permissionId },
    select: { status: true, studentId: true, facultyId: true },
  });
  if (!pass || pass.status !== "APPROVED") return { error: "This pass can no longer be used" };
  return storeGatePhoto(imageData, permissionId, pass.studentId || pass.facultyId || "unknown");
}

/**
 * Register an EXIT movement
 * Uses an interactive transaction to prevent TOCTOU race conditions
 */
export async function registerExit(
  permissionId: string,
  gateId: string,
  imagePath?: string | null,
  notes?: string | null
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
  // No note (left out, null or blank) is fine; a note must be text of at most 500 characters
  if (notes === null || (typeof notes === "string" && !notes.trim())) notes = undefined;
  if (notes !== undefined && typeof notes !== "string") return { error: "Invalid note" };
  if (notes !== undefined && notes.length > 500) {
    return { error: "Notes must be at most 500 characters" };
  }
  if (imagePath === null) imagePath = undefined;

  // Photo: mandatory for student passes, not needed for faculty passes
  const photoResult = await resolveGatePhoto(permissionId, imagePath, "exit");
  if ("error" in photoResult) return { error: photoResult.error };
  const storedImage = photoResult.path;

  try {
    // Interactive transaction: reads + checks + writes are all atomic
    await prisma.$transaction(async (tx) => {
      // One gate write per pass at a time: a second scan (another guard, a
      // double tap, a retry) waits here and then sees the pass already used.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"gate-scan:" + permissionId}))`;
      // Read permission state INSIDE the transaction
      const permission = await tx.permission.findUnique({
        where: { id: permissionId },
        include: {
          qr: true,
          student: { select: { id: true, status: true } },
        },
      });

      if (!permission) throw new Error("Permission not found");
      if (permission.passKind === "HOSTEL") throw new Error("Hostel passes are scanned by the hostel warden, not at the gate");
      if (permission.status !== "APPROVED") {
        throw new Error("This pass can't be used for an exit now");
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
      // Mark permission as EXITED (they are currently outside) — only from APPROVED
      const moved = await tx.permission.updateMany({
        where: { id: permissionId, status: "APPROVED" },
        data: { status: "EXITED" },
      });
      if (moved.count !== 1) throw new Error("Exit already registered for this permission");
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
      // Going out now means they were back on campus: older trips they never
      // returned on (e.g. came back on another pass) are over
      await closeSupersededTrips(tx, permission, permissionId);

    });
  } catch (err: any) {
    if (err?.code === "P2002") return { error: "Exit already registered for this permission" };
    return { error: err.message || "Failed to register exit" };
  }

  clearSecurityCaches();
  notifyLive("gate");
  notifyPassHolder(permissionId);
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
  imagePath?: string | null,
  notes?: string | null
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
  // No note (left out, null or blank) is fine; a note must be text of at most 500 characters
  if (notes === null || (typeof notes === "string" && !notes.trim())) notes = undefined;
  if (notes !== undefined && typeof notes !== "string") return { error: "Invalid note" };
  if (notes !== undefined && notes.length > 500) {
    return { error: "Notes must be at most 500 characters" };
  }
  if (imagePath === null) imagePath = undefined;

  // Photo: mandatory for student passes, not needed for faculty passes
  const photoResult = await resolveGatePhoto(permissionId, imagePath, "entry");
  if ("error" in photoResult) return { error: photoResult.error };
  const storedImage = photoResult.path;

  // Set when this is a return after the planned time (kept on the movement)
  let lateNote: string | null = null;
  try {
    // Interactive transaction: reads + checks + writes are all atomic
    await prisma.$transaction(async (tx) => {
      // One gate write per pass at a time (see registerExit)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"gate-scan:" + permissionId}))`;
      const permission = await tx.permission.findUnique({
        where: { id: permissionId },
        include: {
          qr: true,
          student: { select: { id: true, status: true, studentType: true } },
        },
      });

      if (!permission) throw new Error("Permission not found");
      if (permission.type !== "ENTRY") {
        // Faculty / hosteller exit pass scanned again = their return on the same pass.
        // Same lock as "Mark In", so the two can never both record a return.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"faculty-return:" + permissionId}))`;
        const entries = await tx.movement.count({ where: { permissionId, type: "ENTRY" } });
        if (!canScanReturn(permission, entries > 0)) {
          throw new Error("Cannot register entry with an EXIT pass. A separate Entry Request is required to enter campus.");
        }
        // (No pass-window check: a late return is still a return, kept on record as delayed)
        const late = delayMinutes(returnDueAt(permission));
        if (late > 0) lateNote = `Delayed return: ${formatDelay(late)} late`;
      } else {
        if (permission.status !== "APPROVED") {
          throw new Error("This pass can't be used for an entry now");
        }
        if (!permission.qr || !permission.qr.active) {
          throw new Error("QR credential is not active or has expired");
        }
        if (permission.qr.usedForEntry) {
          throw new Error("Entry already registered for this permission");
        }
        assertPassWindow(permission.exitDate, permission.qr.expiresAt);
      }

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
          notes: [lateNote, notes].filter(Boolean).join(" · ") || null,
        },
      });
      // Complete the pass only from the state that was checked above
      const done = await tx.permission.updateMany({
        where: { id: permissionId, status: permission.type === "ENTRY" ? "APPROVED" : "EXITED" },
        data: { status: "COMPLETED" },
      });
      if (done.count !== 1) throw new Error("Entry already registered for this permission");
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
      // Back on campus: any other trip they never returned on is over
      await closeSupersededTrips(tx, permission, permissionId);

    });
  } catch (err: any) {
    if (err?.code === "P2002") return { error: "Entry already registered for this permission" };
    return { error: err.message || "Failed to register entry" };
  }

  clearSecurityCaches();
  notifyLive("gate");
  notifyPassHolder(permissionId);
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

  const today = istStartOfDay();

  const [
    outsiderVisitsToday,
    studentExitsToday,
    studentEntriesToday,
    outsidersInside,
    recentMovements,
    gates,
  ] = await Promise.all([
    prisma.outsider.count({ where: { entryTime: { gte: today } } }),
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
        faculty: { select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } } },
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

  fillMovementPeople(result);
  return result;
}

/** Most rows per list on the Gate Log screen (a whole day stays far below this) */
const LOG_DAY_LIMIT = 1500;

export async function getSecurityLogData(dateStr?: string) {
  await requireRole("SECURITY", "ADMIN");

  const { start: targetDate, end: endOfDay, dateStr: selectedDate } = istDayRangeFromParam(dateStr);

  const [studentEntries, studentExits, outsiderVisits] = await Promise.all([
    prisma.movement.findMany({
      where: { type: "ENTRY", createdAt: { gte: targetDate, lt: endOfDay } },
      orderBy: { createdAt: "desc" },
      take: LOG_DAY_LIMIT,
      select: {
        id: true, type: true, createdAt: true, notes: true,
        student: { select: { studentRoll: true, profile: { select: { name: true, phone: true } } } },
        faculty: { select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } } },
        gate: { select: { name: true } },
        permission: { select: { purpose: true, destination: true } },
      },
    }),
    prisma.movement.findMany({
      where: { type: "EXIT", createdAt: { gte: targetDate, lt: endOfDay } },
      orderBy: { createdAt: "desc" },
      take: LOG_DAY_LIMIT,
      select: {
        id: true, type: true, createdAt: true, notes: true,
        student: { select: { studentRoll: true, profile: { select: { name: true, phone: true } } } },
        faculty: { select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } } },
        gate: { select: { name: true } },
        permission: { select: { purpose: true, destination: true } },
      },
    }),
    prisma.outsider.findMany({
      where: { entryTime: { gte: targetDate, lt: endOfDay } },
      orderBy: { entryTime: "desc" },
      take: LOG_DAY_LIMIT,
    }),
  ]);

  const result = { 
    studentEntries, 
    studentExits, 
    outsiderVisits, 
    selectedDate,
  };
  
  fillMovementPeople(result);
  return result;
}

"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { permissionRequestSchema, batchGrantSchema, hostelOutingSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { notifyApprovers } from "@/lib/realtime/notify";
import { closeAllSupersededTrips } from "@/lib/passes/close-trips";
import { resolveStudentActivePass } from "@/lib/permissions/auto-expire";
import { resolveStudentApprover } from "@/lib/permissions/approver";
import { generateQrToken, generateCompactLiveQr } from "@/lib/qr/token";
import { canScanReturn, OPEN_TRIP_WHERE, RETURN_QR_TTL_MS } from "@/lib/passes/return-scan";
import { getStaffScope, studentWhereForScope } from "@/lib/auth/scope";
import { istDateString, istDateTime, istDateToInstant, istDayRange, istStartOfDay } from "@/lib/time/ist";

const MAX_DAYS_AHEAD = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Data for the student request forms: who will approve the request.
 * Students do not choose an approver (college rule):
 * day scholars → their department HOD, hostellers → their assigned warden.
 */
export async function getStudentFormData() {
  const user = await requireRole("STUDENT");

  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: { studentType: true, department: true, wardenId: true },
  });
  if (!student) return null;

  const resolution = await resolveStudentApprover(student);
  return {
    isHosteller: student.studentType === "HOSTELLER",
    assignedApprover: resolution.ok
      ? { name: resolution.approver.name, label: resolution.approver.label, available: true as const }
      : { name: null, label: null, available: false as const, reason: resolution.error },
  };
}

/**
 * Hostel outing details (Forms 12/13): outing date range, planned in-time,
 * parent / guardian contact, hostel in-charge, and a snapshot of the warden.
 */
async function parseHostelOuting(formData: FormData, fromDate: string, expectedExit: Date, wardenId: string | null) {
  const parsed = hostelOutingSchema.safeParse({
    outingDateTo: (formData.get("outingDateTo") as string) || "",
    inTime: (formData.get("inTime") as string) || "",
    parentInformed: (formData.get("parentInformed") as string) || "",
    videoCallNumber: (formData.get("videoCallNumber") as string) || "",
    guardianName: (formData.get("guardianName") as string) || "",
    guardianRelation: (formData.get("guardianRelation") as string) || "",
    hostelInchargeDetails: (formData.get("hostelInchargeDetails") as string) || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, field: String(parsed.error.issues[0].path[0] ?? "") };
  const o = parsed.data;

  if (o.outingDateTo < fromDate) return { error: "Outing date to cannot be before the outing date from", field: "outingDateTo" };
  if (istDateToInstant(o.outingDateTo).getTime() - istDateToInstant(fromDate).getTime() > MAX_DAYS_AHEAD * DAY_MS) {
    return { error: `An outing can be at most ${MAX_DAYS_AHEAD} days long`, field: "outingDateTo" };
  }

  let expectedReturn: Date | null = null;
  if (o.inTime) {
    expectedReturn = istDateTime(o.outingDateTo, o.inTime);
    if (!expectedReturn || expectedReturn <= expectedExit) {
      return { error: "In time and date must be after the out time and date", field: "inTime" };
    }
  }

  const warden = wardenId
    ? await prisma.warden.findUnique({
        where: { id: wardenId },
        select: { employeeId: true, hostelBlock: true, profile: { select: { name: true, phone: true } } },
      })
    : null;
  const wardenDetails = warden
    ? [warden.profile.name, warden.hostelBlock ? `Block ${warden.hostelBlock}` : null, warden.profile.phone, warden.employeeId]
        .filter(Boolean)
        .join(" • ")
    : null;

  return {
    expectedReturn,
    data: {
      endDate: istDateToInstant(o.outingDateTo),
      numberOfDays:
        Math.round((istDateToInstant(o.outingDateTo).getTime() - istDateToInstant(fromDate).getTime()) / DAY_MS) + 1,
      parentInformed: o.parentInformed === "yes",
      videoCallNumber: o.videoCallNumber || null,
      guardianName: o.guardianName || null,
      guardianRelation: o.guardianRelation || null,
      hostelInchargeDetails: o.hostelInchargeDetails || null,
      wardenDetails,
    },
  };
}

/**
 * Shared implementation for student EXIT and ENTRY requests.
 */
async function createStudentRequest(formData: FormData, type: "EXIT" | "ENTRY") {
  const user = await requireRole("STUDENT");

  const raw = {
    purpose: (formData.get("purpose") as string) || "",
    destination: (formData.get("destination") as string) || "",
    exitDate: (formData.get("exitDate") as string) || "",
    expectedExit: (formData.get("expectedExit") as string) || "",
    expectedReturn: type === "EXIT" ? (formData.get("expectedReturn") as string) || "" : "",
    contactNumber: (formData.get("contactNumber") as string) || "",
    remarks: (formData.get("remarks") as string) || "",
  };

  const parsed = permissionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, field: String(parsed.error.issues[0].path[0] ?? "") };
  }
  const input = parsed.data;

  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, studentType: true, department: true, wardenId: true },
  });
  if (!student) {
    return { error: "Student record not found. Contact admin." };
  }
  // Hostellers come back on their outing pass's QR — no entry request
  if (type === "ENTRY" && student.studentType === "HOSTELLER") {
    return { error: "Hostellers don't need an entry request. Show your outing pass QR at the gate when you come back." };
  }

  // Approver is decided by the server, never by the client.
  const resolution = await resolveStudentApprover(student);
  if (!resolution.ok) return { error: resolution.error };
  const { approverType, approverId } = resolution.approver;

  // Dates/times are IST wall-clock values.
  const today = istStartOfDay();
  const exitDate = istDateToInstant(input.exitDate);
  if (exitDate < today) {
    return { error: `${type === "ENTRY" ? "Entry" : "Exit"} date cannot be in the past.` };
  }
  if (exitDate.getTime() > today.getTime() + MAX_DAYS_AHEAD * DAY_MS) {
    return { error: `Requests can be made at most ${MAX_DAYS_AHEAD} days in advance.` };
  }

  const expectedExit = istDateTime(input.exitDate, input.expectedExit);
  if (!expectedExit) return { error: "Invalid time", field: "expectedExit" };
  if (input.exitDate === istDateString() && expectedExit.getTime() < Date.now() - 30 * 60 * 1000) {
    return { error: "The selected time has already passed. Please choose a later time.", field: "expectedExit" };
  }

  let expectedReturn: Date | null = null;
  if (type === "EXIT" && input.expectedReturn) {
    expectedReturn = istDateTime(input.exitDate, input.expectedReturn);
    // Return earlier than exit → next day
    if (expectedReturn && expectedReturn <= expectedExit) {
      expectedReturn = new Date(expectedReturn.getTime() + DAY_MS);
    }
  }

  // Hostel outing pass: outing date range, planned in-time and parent contact
  let outing: Awaited<ReturnType<typeof parseHostelOuting>> | null = null;
  if (type === "EXIT" && student.studentType === "HOSTELLER") {
    outing = await parseHostelOuting(formData, input.exitDate, expectedExit, student.wardenId);
    if ("error" in outing) return { error: outing.error, field: "field" in outing ? outing.field : undefined };
    if (outing.expectedReturn) expectedReturn = outing.expectedReturn;
  }
  const outingData = outing && !("error" in outing) ? outing.data : {};

  // Expire anything stale first so the student is not falsely blocked.
  await resolveStudentActivePass(student.id);

  try {
    const permission = await prisma.$transaction(async (tx) => {
      // Serialize concurrent submissions for the same student (double-click / two tabs).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"permission-request:" + student.id}))`;

      const active = await tx.permission.findFirst({
        where: { studentId: student.id, status: { in: ["PENDING", "APPROVED"] } },
        select: { status: true },
      });
      if (active?.status === "PENDING") throw new Error("PENDING_EXISTS");
      if (active?.status === "APPROVED") throw new Error("APPROVED_EXISTS");
      // Hosteller out on a pass: they come back on its return QR, not a new request
      // (a trip they already came back from on another pass is closed first)
      await closeAllSupersededTrips(tx, { studentId: student.id });
      const out = await tx.permission.findFirst({ where: { studentId: student.id, ...OPEN_TRIP_WHERE }, select: { id: true } });
      if (out) throw new Error("OUT_ON_PASS");

      return tx.permission.create({
        data: {
          studentId: student.id,
          approverType,
          approverId,
          type,
          purpose: input.purpose,
          destination: input.destination,
          exitDate,
          expectedExit,
          expectedReturn,
          contactNumber: input.contactNumber || null,
          remarks: input.remarks || null,
          ...outingData,
          status: "PENDING",
        },
        select: { id: true },
      });
    });

    revalidatePath("/student");
    revalidatePath("/faculty-admin");
    revalidatePath("/faculty-admin/requests");
    revalidatePath("/warden");
    revalidatePath("/warden/requests");

    notifyApprovers(permission.id);
    return { success: true, permissionId: permission.id };
  } catch (err: any) {
    if (err?.message === "PENDING_EXISTS") {
      return { error: "You already have a pending request. Please wait for approval or cancel it first." };
    }
    if (err?.message === "APPROVED_EXISTS") {
      return { error: "You have an approved gate pass. Please use your QR code before requesting another." };
    }
    if (err?.message === "OUT_ON_PASS") return { error: "You are out on a pass. Show its return QR at the gate when you come back — no new request is needed." };
    console.error("[createStudentRequest] failed:", err?.message);
    return { error: "Failed to submit request. Please try again." };
  }
}

/**
 * Student submits a new EXIT permission request
 */
export async function createPermissionRequest(formData: FormData) {
  return createStudentRequest(formData, "EXIT");
}

/**
 * Student submits a new ENTRY permission request
 */
export async function createEntryRequest(formData: FormData) {
  return createStudentRequest(formData, "ENTRY");
}

/**
 * Student cancels their own pending request
 */
export async function cancelPermissionRequest(permissionId: string) {
  const user = await requireRole("STUDENT");

  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });
  if (!student) return { error: "Student not found" };

  const updated = await prisma.permission.updateMany({
    where: { id: permissionId, studentId: student.id, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  if (updated.count !== 1) {
    return { error: "Request not found or can no longer be cancelled" };
  }

  revalidatePath("/student");
  notifyApprovers(permissionId);
  return { success: true };
}

/**
 * HOD / Warden directly grants passes (max 5 at a time) to students they are
 * responsible for: HOD → day scholars of their department, Warden → their
 * assigned hostellers. Passes are valid for the rest of today (IST).
 */
export async function batchCreatePermissions(studentIds: string[], data: Record<string, unknown>) {
  const user = await requireRole("FACULTY_ADMIN", "WARDEN");

  const parsed = batchGrantSchema.safeParse({ ...(data ?? {}), studentIds });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const scope = await getStaffScope(user);
  const baseWhere = studentWhereForScope(scope);
  if (!baseWhere || (scope.kind !== "FACULTY_ADMIN" && scope.kind !== "WARDEN")) {
    return { error: "Approver record not found" };
  }

  const allowedWhere =
    scope.kind === "FACULTY_ADMIN"
      ? { AND: [baseWhere, { studentType: "DAY_SCHOLAR" as const }] }
      : baseWhere;

  const allowed = await prisma.student.findMany({
    where: { AND: [{ id: { in: input.studentIds } }, allowedWhere] },
    select: { id: true },
    // Fixed order = locks always taken in the same order (no deadlock between two grants)
    orderBy: { id: "asc" },
  });
  if (allowed.length !== new Set(input.studentIds).size) {
    return {
      error:
        scope.kind === "FACULTY_ADMIN"
          ? "You can only grant passes to day scholars of your department."
          : "You can only grant passes to your assigned hostellers.",
    };
  }

  const approverType = scope.kind === "FACULTY_ADMIN" ? "FACULTY_ADMIN" : "WARDEN";
  const approverId = scope.kind === "WARDEN" ? scope.wardenId : user.profileId;
  const now = new Date();
  const { start: todayStart, end: todayEnd } = istDayRange(now);

  try {
    await prisma.$transaction(async (tx) => {
      for (const { id: studentId } of allowed) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"permission-request:" + studentId}))`;
        await closeAllSupersededTrips(tx, { studentId });
        const active = await tx.permission.findFirst({
          where: { OR: [{ studentId, status: { in: ["PENDING", "APPROVED"] } }, { studentId, ...OPEN_TRIP_WHERE }] },
          select: { id: true },
        });
        if (active) throw new Error("ACTIVE_EXISTS");

        const perm = await tx.permission.create({
          data: {
            studentId,
            type: input.type,
            purpose: input.purpose,
            destination: input.destination || null,
            exitDate: todayStart,
            expectedExit: now,
            status: "APPROVED",
            remarks: input.remarks || null,
            contactNumber: input.contactNumber || null,
            approverType,
            approverId,
            approvedAt: now,
          },
          select: { id: true },
        });

        await tx.permissionApproval.create({
          data: {
            permissionId: perm.id,
            approverType,
            facultyId: scope.kind === "FACULTY_ADMIN" ? scope.facultyId : null,
            wardenId: scope.kind === "WARDEN" ? scope.wardenId : null,
            approved: true,
            reason: `Directly granted by ${approverType === "WARDEN" ? "Warden" : "HOD"}`,
          },
        });

        const { token } = await generateQrToken(perm.id, studentId, todayEnd);
        await tx.qrCredential.create({
          data: { permissionId: perm.id, token, expiresAt: todayEnd },
        });
      }
    });
  } catch (err: any) {
    if (err?.message === "ACTIVE_EXISTS") {
      return { error: "One of the selected students already has a pending or approved pass, or is out on a pass." };
    }
    console.error("[batchCreatePermissions] failed:", err?.message);
    return { error: "Failed to grant passes" };
  }

  revalidatePath("/faculty-admin/students");
  revalidatePath("/warden/students");
  return { success: true };
}

/**
 * Issues a short-lived (60 s) signed QR token for the caller's own approved pass.
 * The QR shown on screen rotates, so screenshots stop working within a minute.
 * Works for students and for faculty/HOD passes.
 */
export async function generateLiveQrToken(permissionId: string) {
  // HODs, the Dean and the Director do not need gate passes
  const user = await requireRole("STUDENT", "FACULTY");
  if (typeof permissionId !== "string" || !permissionId) return { error: "Permission not found" };

  let ownerFilter: { studentId: string } | { facultyId: string };
  if (user.role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
    if (!student) return { error: "Student not found" };
    ownerFilter = { studentId: student.id };
  } else {
    const faculty = await prisma.faculty.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
    if (!faculty) return { error: "Faculty record not found" };
    ownerFilter = { facultyId: faculty.id };
  }

  const permission = await prisma.permission.findFirst({
    where: { id: permissionId, ...ownerFilter },
    include: {
      qr: true,
      movements: { where: { type: "ENTRY" }, select: { id: true }, take: 1 },
      student: { select: { studentType: true } },
    },
  });

  if (!permission) return { error: "Permission not found" };

  // Faculty / hostellers who are out on this pass: the same QR is shown again for
  // the return scan. Each displayed code lives 2 minutes (the screen refreshes it).
  if (permission.qr && canScanReturn(permission, permission.movements.length > 0)) {
    const token = generateCompactLiveQr({
      permissionId: permission.id,
      tokenId: permission.qr.id,
      expiresAt: new Date(Date.now() + RETURN_QR_TTL_MS),
    });
    return { token, expiresAt: null, returning: true };
  }

  if (permission.status !== "APPROVED") return { error: "Permission is not approved" };
  if (!permission.qr || !permission.qr.active) return { error: "QR credential is not active" };
  if (permission.qr.expiresAt < new Date()) return { error: "This gate pass has expired." };
  if (permission.type === "EXIT" && permission.qr.usedForExit) return { error: "Pass already used for exit" };
  if (permission.type === "ENTRY" && permission.qr.usedForEntry) return { error: "Pass already used for entry" };

  const validFrom = istStartOfDay(permission.exitDate);
  if (validFrom > new Date()) {
    return { error: `This pass becomes valid on ${istDateString(permission.exitDate)}.`, validFrom };
  }

  // Compact signed code (~110 characters): far fewer QR dots, so it scans quickly from a screen
  const token = generateCompactLiveQr({
    permissionId: permission.id,
    tokenId: permission.qr.id,
    expiresAt: permission.qr.expiresAt,
  });

  return { token, expiresAt: permission.qr.expiresAt, returning: false };
}

/**
 * Hostel student going from college to the hostel. Short form like a day
 * scholar's pass; approved by the department HOD; the QR is scanned by the
 * hostel warden on arrival (not by gate security).
 */
export async function createHostelVisitRequest(formData: FormData) {
  const user = await requireRole("STUDENT");

  const parsed = permissionRequestSchema.safeParse({
    purpose: (formData.get("purpose") as string) || "",
    destination: "Hostel",
    exitDate: istDateString(),
    expectedExit: (formData.get("expectedExit") as string) || "",
    expectedReturn: "",
    contactNumber: (formData.get("contactNumber") as string) || "",
    remarks: (formData.get("remarks") as string) || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, field: String(parsed.error.issues[0].path[0] ?? "") };
  const input = parsed.data;

  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, studentType: true, department: true, wardenId: true },
  });
  if (!student) return { error: "Student record not found. Contact admin." };
  if (student.studentType !== "HOSTELLER") return { error: "Hostel passes are only for hostel students." };

  // The department HOD approves (same as a day scholar's pass)
  const resolution = await resolveStudentApprover({ ...student, studentType: "DAY_SCHOLAR" });
  if (!resolution.ok) return { error: resolution.error };

  const expectedExit = istDateTime(input.exitDate, input.expectedExit);
  if (!expectedExit) return { error: "Invalid time", field: "expectedExit" };
  if (expectedExit.getTime() < Date.now() - 30 * 60 * 1000) {
    return { error: "The selected time has already passed. Please choose a later time.", field: "expectedExit" };
  }

  await resolveStudentActivePass(student.id);

  try {
    const permission = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"permission-request:" + student.id}))`;
      const active = await tx.permission.findFirst({
        where: { studentId: student.id, status: { in: ["PENDING", "APPROVED"] } },
        select: { status: true },
      });
      if (active?.status === "PENDING") throw new Error("PENDING_EXISTS");
      if (active?.status === "APPROVED") throw new Error("APPROVED_EXISTS");
      // Hosteller out on a pass: they come back on its return QR, not a new request
      // (a trip they already came back from on another pass is closed first)
      await closeAllSupersededTrips(tx, { studentId: student.id });
      const out = await tx.permission.findFirst({ where: { studentId: student.id, ...OPEN_TRIP_WHERE }, select: { id: true } });
      if (out) throw new Error("OUT_ON_PASS");
      return tx.permission.create({
        data: {
          studentId: student.id,
          approverType: resolution.approver.approverType,
          approverId: resolution.approver.approverId,
          type: "EXIT",
          passKind: "HOSTEL",
          purpose: input.purpose,
          destination: "Hostel",
          exitDate: istDateToInstant(input.exitDate),
          expectedExit,
          contactNumber: input.contactNumber || null,
          remarks: input.remarks || null,
          status: "PENDING",
        },
        select: { id: true },
      });
    });

    revalidatePath("/student");
    revalidatePath("/faculty-admin");
    revalidatePath("/faculty-admin/requests");
    notifyApprovers(permission.id);
    return { success: true, permissionId: permission.id };
  } catch (err: any) {
    if (err?.message === "PENDING_EXISTS") return { error: "You already have a pending request. Please wait for approval or cancel it first." };
    if (err?.message === "APPROVED_EXISTS") return { error: "You have an approved pass. Please use it before requesting another." };
    if (err?.message === "OUT_ON_PASS") return { error: "You are out on a pass. Show its return QR at the gate when you come back — no new request is needed." };
    console.error("[createHostelVisitRequest] failed:", err?.message);
    return { error: "Failed to submit request. Please try again." };
  }
}

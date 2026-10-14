"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, type AuthUser } from "@/lib/auth/helpers";
import { revalidatePath } from "next/cache";
import { createSignedPhotoUrl } from "@/lib/storage/storage-admin";
import { getRegisterAccess } from "@/lib/registers/access";
import {
  REGISTER_BY_KEY,
  facultyRequestTypeLabel,
  isEntryRegister,
  type EntryRegister,
  type RegisterKey,
} from "@/lib/registers/definitions";
import {
  buildSearchText,
  effectiveData,
  validateCompletion,
  validateAdminEdit,
  validateNewRecord,
  type CompletionPayload,
  type RawPayload,
  type RegisterData,
  type StaffResolver,
} from "@/lib/registers/validate";
import { istDateString, istDateToInstant, istDayRangeFromParam, parseDateParam, parsePageParam } from "@/lib/time/ist";

const PAGE_SIZE = 25;
const VIEW_ROLES = ["SECURITY", "ADMIN", "SECURITY_SUPERVISOR"] as const;
const TOKEN_RE = /^[A-Za-z0-9-]{8,100}$/;

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function entryRegister(key: unknown): EntryRegister | null {
  if (typeof key !== "string") return null;
  const def = (REGISTER_BY_KEY as Record<string, (typeof REGISTER_BY_KEY)[RegisterKey]>)[key];
  return def && isEntryRegister(def) ? def : null;
}

/** Who is recording, taken from the signed-in session — never from the form. */
async function recorderSnapshot(user: AuthUser) {
  const staff = await prisma.securityStaff.findUnique({
    where: { profileId: user.profileId },
    select: { employeeId: true, gate: { select: { name: true } } },
  });
  return {
    recordedById: user.profileId,
    recordedByName: user.name,
    recordedByRole: user.role,
    recordedByEmployeeId: staff?.employeeId ?? null,
    recordedAtGate: staff?.gate?.name ?? null,
  };
}

const resolveStaff: StaffResolver = async (id) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const s = await prisma.securityStaff.findUnique({
    where: { id },
    select: { id: true, employeeId: true, profile: { select: { name: true } } },
  });
  return s ? { id: s.id, name: s.profile.name, employeeId: s.employeeId } : null;
};

/** Optional "YYYY-MM-DD" filter; "" or "all" = every date. */
function dayFilter(date?: string | null) {
  if (!date || date === "all") return null;
  const d = parseDateParam(date);
  return d ? istDayRangeFromParam(d) : istDayRangeFromParam(istDateString());
}

function revalidateRegisters() {
  revalidatePath("/security/registers", "layout");
  revalidatePath("/admin/registers", "layout");
  revalidatePath("/supervisor/registers", "layout");
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ──────────────────────────────────────────────────────────────
// Entry registers (Forms 3–11, 14, 15, 17–19)
// ──────────────────────────────────────────────────────────────

export async function getRegisterStaffOptions() {
  await requireRole(...VIEW_ROLES);
  const staff = await prisma.securityStaff.findMany({
    where: { profile: { active: true } },
    select: { id: true, employeeId: true, profile: { select: { name: true } } },
    orderBy: { profile: { name: "asc" } },
    take: 500,
  });
  return staff.map((s) => ({ id: s.id, name: s.profile.name, employeeId: s.employeeId }));
}

/** Security records a new register entry. Saved records can never be edited or deleted. */
export async function createRegisterEntry(registerKey: string, payload: RawPayload, clientToken: string) {
  const user = await requireRole("SECURITY", "ADMIN");
  const def = entryRegister(registerKey);
  if (!def) return { error: "Unknown register" };
  if (!(await getRegisterAccess(user)).canCreate(def.key)) return { error: "You are not allowed to add to this register" };
  if (typeof clientToken !== "string" || !TOKEN_RE.test(clientToken)) return { error: "Invalid form. Reload the page." };

  const result = await validateNewRecord(def, payload, resolveStaff);
  if ("error" in result) return { error: result.error };

  try {
    const entry = await prisma.registerEntry.create({
      data: {
        register: def.key,
        kind: "ORIGINAL",
        entryDate: istDateToInstant(result.entryDateStr),
        data: result.data as Prisma.InputJsonValue,
        searchText: buildSearchText(def, result.data),
        clientToken,
        ...(await recorderSnapshot(user)),
      },
      select: { id: true },
    });
    revalidateRegisters();
    return { success: true, id: entry.id };
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true, duplicate: true }; // double submit: already saved
    console.error("[createRegisterEntry] failed:", err?.message);
    return { error: "Could not save the record. Please try again." };
  }
}

/**
 * Records the other side of an In / Out record (live time, plus its reading)
 * or marks workers out, as a separate COMPLETION record. Nothing is overwritten.
 */
export async function completeRegisterEntry(entryId: string, payload: CompletionPayload, clientToken: string) {
  const user = await requireRole("SECURITY", "ADMIN");
  const access = await getRegisterAccess(user);
  if (typeof entryId !== "string" || !entryId) return { error: "Record not found" };
  if (typeof clientToken !== "string" || !TOKEN_RE.test(clientToken)) return { error: "Invalid form. Reload the page." };

  try {
    const res = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"register-entry:" + entryId}))`;
      const original = await tx.registerEntry.findFirst({
        where: { id: entryId, kind: "ORIGINAL" },
        select: {
          id: true, register: true, data: true, entryDate: true,
          supplements: { select: { kind: true, data: true, createdAt: true } },
        },
      });
      if (!original) return { error: "Record not found" };
      const def = entryRegister(original.register);
      if (!def) return { error: "Unknown register" };
      if (!access.canCreate(def.key)) return { error: "You are not allowed to update this register" };

      const current = effectiveData(def, original.data as RegisterData, original.supplements);
      const checked = await validateCompletion(def, current, payload);
      if ("error" in checked) return { error: checked.error };

      await tx.registerEntry.create({
        data: {
          register: def.key,
          kind: "COMPLETION",
          parentId: original.id,
          entryDate: original.entryDate,
          data: checked.data as Prisma.InputJsonValue,
          clientToken,
          ...(await recorderSnapshot(user)),
        },
      });
      return { success: true as const };
    });
    if ("success" in res) revalidateRegisters();
    return res;
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true, duplicate: true };
    console.error("[completeRegisterEntry] failed:", err?.message);
    return { error: "Could not save. Please try again." };
  }
}

export async function listRegisterEntries(params: { register: string; date?: string; q?: string; page?: number }) {
  const user = await requireRole(...VIEW_ROLES);
  const def = entryRegister(params?.register);
  if (!def) return { error: "Unknown register" };
  if (!(await getRegisterAccess(user)).canView(def.key)) return { error: "You do not have access to this register" };

  const page = parsePageParam(String(params.page ?? 1));
  const range = dayFilter(params.date);
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase().slice(0, 100) : "";

  const where: Prisma.RegisterEntryWhereInput = {
    register: def.key,
    kind: "ORIGINAL",
    ...(range ? { entryDate: { gte: range.start, lt: range.end } } : {}),
    ...(q
      ? {
          OR: [
            { searchText: { contains: q } },
            { recordedByName: { contains: q, mode: "insensitive" } },
            { supplements: { some: { kind: "CORRECTION", searchText: { contains: q } } } },
          ],
        }
      : {}),
  };

  const recorder = {
    recordedByName: true, recordedByRole: true, recordedByEmployeeId: true, recordedAtGate: true, createdAt: true,
  } as const;

  const [rows, total] = await Promise.all([
    prisma.registerEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, data: true, entryDate: true, ...recorder,
        supplements: {
          orderBy: { createdAt: "asc" },
          select: { id: true, kind: true, data: true, reason: true, ...recorder },
        },
      },
    }),
    prisma.registerEntry.count({ where }),
  ]);

  return {
    success: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    entries: rows.map((r) => ({
      id: r.id,
      entryDate: istDateString(r.entryDate),
      createdAt: r.createdAt.toISOString(),
      recordedByName: r.recordedByName,
      recordedByRole: r.recordedByRole,
      recordedByEmployeeId: r.recordedByEmployeeId,
      recordedAtGate: r.recordedAtGate,
      original: r.data as RegisterData,
      current: effectiveData(def, r.data as RegisterData, r.supplements),
      supplements: r.supplements.map((s) => ({
        id: s.id,
        kind: s.kind,
        data: s.data as RegisterData,
        reason: s.reason,
        createdAt: s.createdAt.toISOString(),
        recordedByName: s.recordedByName,
        recordedByRole: s.recordedByRole,
        recordedByEmployeeId: s.recordedByEmployeeId,
        recordedAtGate: s.recordedAtGate,
      })),
    })),
  };
}

// ──────────────────────────────────────────────────────────────
// Form 1 — Faculty Book (from faculty passes + gate movements)
// ──────────────────────────────────────────────────────────────

/** Passes whose date range covers the day, or that had a gate movement that day. */
function passOnDay(range: { start: Date; end: Date }): Prisma.PermissionWhereInput {
  return {
    OR: [
      { exitDate: { gte: range.start, lt: range.end } },
      { exitDate: { lt: range.end }, endDate: { gte: range.start } },
      { movements: { some: { createdAt: { gte: range.start, lt: range.end } } } },
    ],
  };
}

const movementSelect = {
  orderBy: { createdAt: "asc" as const },
  select: {
    type: true,
    createdAt: true,
    gate: { select: { name: true } },
    securityUser: { select: { employeeId: true, profile: { select: { name: true } } } },
  },
};

type MovementRow = {
  type: string;
  createdAt: Date;
  gate: { name: string } | null;
  securityUser: { employeeId: string | null; profile: { name: string } } | null;
};

function movementInfo(m?: MovementRow | null) {
  if (!m) return null;
  return {
    at: m.createdAt.toISOString(),
    gate: m.gate?.name ?? null,
    guard: m.securityUser?.profile?.name ?? null,
    guardEmployeeId: m.securityUser?.employeeId ?? null,
  };
}

export async function getFacultyBook(params: { date?: string; q?: string; page?: number }) {
  await requireRole(...VIEW_ROLES);
  const page = parsePageParam(String(params?.page ?? 1));
  const range = dayFilter(params?.date);
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 100) : "";

  const where: Prisma.PermissionWhereInput = {
    AND: [
      { facultyId: { not: null }, approvedAt: { not: null } },
      ...(range ? [passOnDay(range)] : []),
      ...(q
        ? [{
            faculty: {
              OR: [
                { profile: { name: { contains: q, mode: "insensitive" as const } } },
                { department: { contains: q, mode: "insensitive" as const } },
                { employeeId: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }]
        : []),
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.permission.findMany({
      where,
      orderBy: [{ exitDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, createdAt: true, approvedAt: true, status: true, type: true,
        requestType: true, exitDate: true, endDate: true, numberOfDays: true, purpose: true, remarks: true,
        approvalMode: true, approverType: true, hodApprovedAt: true, deanApprovedAt: true,
        approval: { select: { approverType: true, faculty: { select: { profile: { select: { name: true } } } } } },
        faculty: { select: { designation: true, department: true, employeeId: true, profile: { select: { name: true } } } },
        movements: movementSelect,
      },
    }),
    prisma.permission.count({ where }),
  ]);

  return {
    success: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    rows: rows.map((p) => {
      const out = p.movements.find((m) => m.type === "EXIT");
      const back = p.movements.find((m) => m.type === "ENTRY");
      return {
        id: p.id,
        requestDate: iso(p.createdAt),
        facultyName: p.faculty?.profile.name ?? "",
        employeeId: p.faculty?.employeeId ?? null,
        designation: p.faculty?.designation ?? null,
        department: p.faculty?.department ?? null,
        requestType: facultyRequestTypeLabel(p.requestType) || (p.type === "ENTRY" ? "Entry pass" : "Gate pass"),
        startDate: iso(p.exitDate),
        endDate: iso(p.endDate ?? p.exitDate),
        numberOfDays: p.numberOfDays,
        reason: p.purpose,
        note: p.remarks,
        status: p.status,
        approvedAt: iso(p.approvedAt),
        approvedBy:
          p.approvalMode === "BOTH"
            ? "HOD & Dean"
            : p.approval?.faculty?.profile?.name ?? (p.approverType === "DEAN" ? "Dean" : "HOD"),
        actualOut: movementInfo(out),
        actualIn: movementInfo(back),
        canMarkIn: p.status === "EXITED" && !back,
      };
    }),
  };
}

/** Security marks a faculty member back on campus on the same pass (no photo needed). */
export async function markFacultyReturn(permissionId: string, gateId?: string) {
  const user = await requireRole("SECURITY");
  if (typeof permissionId !== "string" || !permissionId) return { error: "Pass not found" };

  const staff = await prisma.securityStaff.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, gateId: true },
  });
  if (!staff) return { error: "Your security staff record was not found. Contact the administrator." };

  const gate =
    (typeof gateId === "string" && gateId
      ? await prisma.gate.findFirst({ where: { id: gateId, active: true }, select: { id: true } })
      : null) ??
    (staff.gateId ? await prisma.gate.findFirst({ where: { id: staff.gateId, active: true }, select: { id: true } }) : null) ??
    (await prisma.gate.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!gate) return { error: "No active gate is set up" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"faculty-return:" + permissionId}))`;
      const p = await tx.permission.findUnique({
        where: { id: permissionId },
        select: { id: true, facultyId: true, status: true, qr: { select: { id: true } }, movements: { select: { type: true } } },
      });
      if (!p || !p.facultyId) throw new Error("Faculty pass not found");
      if (p.status !== "EXITED") throw new Error("This pass has no recorded exit to return from");
      if (p.movements.some((m) => m.type === "ENTRY")) throw new Error("Return already recorded");

      await tx.movement.create({
        data: {
          permissionId: p.id,
          facultyId: p.facultyId,
          gateId: gate.id,
          securityUserId: staff.id,
          type: "ENTRY",
          notes: "Faculty return marked in Faculty Book",
        },
      });
      await tx.permission.update({ where: { id: p.id }, data: { status: "COMPLETED" } });
      if (p.qr) await tx.qrCredential.update({ where: { id: p.qr.id }, data: { usedForEntry: true, active: false } });
    });
  } catch (err: any) {
    return { error: err?.message || "Could not record the return" };
  }

  revalidateRegisters();
  revalidatePath("/security");
  revalidatePath("/security/log");
  return { success: true };
}

// ──────────────────────────────────────────────────────────────
// Form 2 — Visitors Book (the Outsiders records)
// ──────────────────────────────────────────────────────────────

export async function getVisitorsBook(params: { date?: string; q?: string; page?: number }) {
  await requireRole(...VIEW_ROLES);
  const page = parsePageParam(String(params?.page ?? 1));
  const range = dayFilter(params?.date);
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 100) : "";

  const where: Prisma.OutsiderWhereInput = {
    ...(range ? { entryTime: { gte: range.start, lt: range.end } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { visitingStudent: { contains: q, mode: "insensitive" } },
            { purpose: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.outsider.findMany({ where, orderBy: { entryTime: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.outsider.count({ where }),
  ]);

  return {
    success: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    rows: rows.map((o) => ({
      id: o.id,
      name: o.name,
      address: o.address,
      phone: o.phone,
      personToVisit: o.visitingStudent,
      purpose: o.purpose,
      department: o.department,
      category: o.category,
      vehicleNumber: o.vehicleNumber,
      gate: o.gate,
      inTime: iso(o.entryTime),
      outTime: iso(o.exitTime),
      status: o.status,
      remarks: o.remarks,
      recordedByName: o.recordedByName,
    })),
  };
}

// ──────────────────────────────────────────────────────────────
// Forms 12 & 13 — Boys / Ladies hostel outing books
// ──────────────────────────────────────────────────────────────

export async function getHostelOutingBook(params: { hostel: "BOYS" | "LADIES"; date?: string; q?: string; page?: number }) {
  await requireRole(...VIEW_ROLES);
  const hostel = params?.hostel === "LADIES" ? "LADIES" : "BOYS";
  const page = parsePageParam(String(params?.page ?? 1));
  const range = dayFilter(params?.date);
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 100) : "";

  const where: Prisma.PermissionWhereInput = {
    AND: [
      { type: "EXIT", approvedAt: { not: null }, student: { studentType: "HOSTELLER", hostelType: hostel } },
      ...(range ? [passOnDay(range)] : []),
      ...(q
        ? [{
            student: {
              OR: [
                { studentRoll: { contains: q, mode: "insensitive" as const } },
                { roomNumber: { contains: q, mode: "insensitive" as const } },
                { profile: { name: { contains: q, mode: "insensitive" as const } } },
              ],
            },
          }]
        : []),
    ],
  };

  const [rows, total, unassignedHostellers] = await Promise.all([
    prisma.permission.findMany({
      where,
      orderBy: [{ exitDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, status: true, purpose: true, destination: true, remarks: true, contactNumber: true,
        exitDate: true, endDate: true, expectedExit: true, expectedReturn: true, createdAt: true, approvedAt: true,
        parentInformed: true, videoCallNumber: true, guardianName: true, guardianRelation: true,
        hostelInchargeDetails: true, wardenDetails: true, studentId: true,
        student: {
          select: {
            studentRoll: true, roomNumber: true, hostelBlock: true, department: true, year: true, semester: true,
            profile: { select: { name: true, phone: true } },
          },
        },
        movements: movementSelect,
      },
    }),
    prisma.permission.count({ where }),
    prisma.student.count({ where: { studentType: "HOSTELLER", hostelType: null } }),
  ]);

  // The return is the student's first gate ENTRY after the exit (their Entry pass)
  const exits = rows
    .map((p) => ({ studentId: p.studentId!, at: p.movements.find((m) => m.type === "EXIT")?.createdAt }))
    .filter((e): e is { studentId: string; at: Date } => !!e.at);
  const returns = exits.length
    ? await prisma.movement.findMany({
        where: {
          type: "ENTRY",
          studentId: { in: [...new Set(exits.map((e) => e.studentId))] },
          createdAt: { gte: new Date(Math.min(...exits.map((e) => e.at.getTime()))) },
        },
        orderBy: { createdAt: "asc" },
        select: { studentId: true, ...movementSelect.select },
      })
    : [];

  return {
    success: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    unassignedHostellers,
    rows: rows.map((p) => {
      const out = p.movements.find((m) => m.type === "EXIT");
      const back =
        p.movements.find((m) => m.type === "ENTRY") ??
        (out ? returns.find((r) => r.studentId === p.studentId && r.createdAt > out.createdAt) : undefined);
      return {
        id: p.id,
        studentName: p.student?.profile.name ?? "",
        roll: p.student?.studentRoll ?? "",
        room: p.student?.roomNumber ?? null,
        hostelBlock: p.student?.hostelBlock ?? null,
        mobile: p.contactNumber || p.student?.profile.phone || null,
        branch: p.student?.department ?? null,
        year: p.student?.year ?? null,
        semester: p.student?.semester ?? null,
        guardianName: p.guardianName,
        guardianRelation: p.guardianRelation,
        parentInformed: p.parentInformed,
        videoCallNumber: p.videoCallNumber,
        hostelInchargeDetails: p.hostelInchargeDetails,
        wardenDetails: p.wardenDetails,
        purpose: p.purpose,
        destination: p.destination,
        remarks: p.remarks,
        status: p.status,
        requestedFrom: iso(p.exitDate),
        requestedTo: iso(p.endDate ?? p.exitDate),
        plannedOut: iso(p.expectedExit),
        plannedIn: iso(p.expectedReturn),
        actualOut: movementInfo(out),
        actualReturn: movementInfo(back),
      };
    }),
  };
}

// ──────────────────────────────────────────────────────────────
// Form 16 — Home outing passbook (date-wise totals)
// ──────────────────────────────────────────────────────────────

export async function getHomeOutingSummary(params: { from?: string; to?: string }) {
  await requireRole(...VIEW_ROLES);
  const today = istDateString();
  const to = parseDateParam(params?.to) ?? today;
  const defaultFrom = istDateString(new Date(istDateToInstant(to).getTime() - 13 * 86_400_000));
  let from = parseDateParam(params?.from) ?? defaultFrom;
  if (from > to) from = to;
  const start = istDateToInstant(from);
  const end = new Date(istDateToInstant(to).getTime() + 86_400_000);
  if (end.getTime() - start.getTime() > 62 * 86_400_000) return { error: "Choose a range of at most 62 days" };

  const [hostelPasses, facultyPasses, exits] = await Promise.all([
    prisma.permission.findMany({
      where: {
        type: "EXIT",
        approvedAt: { not: null },
        exitDate: { gte: start, lt: end },
        student: { studentType: "HOSTELLER", hostelType: { not: null } },
      },
      select: { exitDate: true, student: { select: { hostelType: true } } },
    }),
    prisma.permission.findMany({
      where: { facultyId: { not: null }, approvedAt: { not: null }, exitDate: { gte: start, lt: end } },
      select: { exitDate: true },
    }),
    prisma.movement.findMany({
      where: {
        type: "EXIT",
        createdAt: { gte: start, lt: end },
        OR: [{ facultyId: { not: null } }, { student: { studentType: "HOSTELLER", hostelType: { not: null } } }],
      },
      select: { createdAt: true, facultyId: true, student: { select: { hostelType: true } } },
    }),
  ]);

  type Day = { date: string; boysPasses: number; boysOut: number; ladiesPasses: number; ladiesOut: number; facultyPasses: number; facultyOut: number };
  const days = new Map<string, Day>();
  for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
    const d = istDateString(new Date(t));
    days.set(d, { date: d, boysPasses: 0, boysOut: 0, ladiesPasses: 0, ladiesOut: 0, facultyPasses: 0, facultyOut: 0 });
  }
  for (const p of hostelPasses) {
    const day = days.get(istDateString(p.exitDate));
    if (!day) continue;
    if (p.student?.hostelType === "BOYS") day.boysPasses++;
    else if (p.student?.hostelType === "LADIES") day.ladiesPasses++;
  }
  for (const p of facultyPasses) {
    const day = days.get(istDateString(p.exitDate));
    if (day) day.facultyPasses++;
  }
  for (const m of exits) {
    const day = days.get(istDateString(m.createdAt));
    if (!day) continue;
    if (m.facultyId) day.facultyOut++;
    else if (m.student?.hostelType === "BOYS") day.boysOut++;
    else if (m.student?.hostelType === "LADIES") day.ladiesOut++;
  }

  const list = [...days.values()].reverse();
  const totals = list.reduce(
    (acc, d) => {
      for (const k of ["boysPasses", "boysOut", "ladiesPasses", "ladiesOut", "facultyPasses", "facultyOut"] as const) acc[k] += d[k];
      return acc;
    },
    { boysPasses: 0, boysOut: 0, ladiesPasses: 0, ladiesOut: 0, facultyPasses: 0, facultyOut: 0 }
  );
  return { success: true, from, to, days: list, totals };
}

// ──────────────────────────────────────────────────────────────
// Overview counts for the registers hub
// ──────────────────────────────────────────────────────────────

export async function getRegisterCountsToday() {
  const user = await requireRole(...VIEW_ROLES);
  const { hidden } = await getRegisterAccess(user);
  const { start, end } = istDayRangeFromParam(istDateString());
  const grouped = await prisma.registerEntry.groupBy({
    by: ["register"],
    where: { kind: "ORIGINAL", entryDate: { gte: start, lt: end }, register: { notIn: hidden } },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.register] = g._count._all;
  return counts;
}

// ──────────────────────────────────────────────────────────────
// Row details (all viewer roles)
// ──────────────────────────────────────────────────────────────

async function signedPhoto(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("data:image/")) return path;
  return createSignedPhotoUrl(path);
}

/** Full Visitors Book record, with the visitor photo if one was taken. */
export async function getVisitorDetails(id: string) {
  await requireRole(...VIEW_ROLES);
  if (typeof id !== "string" || !id) return { error: "Visitor not found" };
  const o = await prisma.outsider.findUnique({ where: { id } });
  if (!o) return { error: "Visitor not found" };
  return {
    success: true,
    visitor: {
      id: o.id,
      name: o.name,
      address: o.address,
      phone: o.phone,
      personToVisit: o.visitingStudent,
      purpose: o.purpose,
      department: o.department,
      category: o.category,
      vehicleNumber: o.vehicleNumber,
      gate: o.gate,
      status: o.status,
      inTime: iso(o.entryTime),
      outTime: iso(o.exitTime),
      remarks: o.remarks,
      recordedByName: o.recordedByName,
      createdAt: iso(o.createdAt),
      photoUrl: await signedPhoto(o.photoUrl),
    },
  };
}

/** Gate photos (exit / entry) for one pass. Student gate photos are permanent. */
export async function getPassGatePhotos(permissionId: string) {
  await requireRole(...VIEW_ROLES);
  if (typeof permissionId !== "string" || !permissionId) return { photos: [] };
  const movements = await prisma.movement.findMany({
    where: { permissionId, imagePath: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { type: true, createdAt: true, imagePath: true },
  });
  const photos = await Promise.all(
    movements.map(async (m) => ({ type: m.type, at: m.createdAt.toISOString(), url: await signedPhoto(m.imagePath) }))
  );
  return { photos: photos.filter((p) => p.url) };
}

/** Form 16: the passes behind one day's totals. */
export async function getHomeOutingDay(date: string) {
  await requireRole(...VIEW_ROLES);
  const d = parseDateParam(date);
  if (!d) return { error: "Invalid date" };
  const { start, end } = istDayRangeFromParam(d);

  const [hostel, faculty] = await Promise.all([
    prisma.permission.findMany({
      where: {
        type: "EXIT",
        approvedAt: { not: null },
        student: { studentType: "HOSTELLER", hostelType: { not: null } },
        OR: [{ exitDate: { gte: start, lt: end } }, { movements: { some: { type: "EXIT", createdAt: { gte: start, lt: end } } } }],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true, purpose: true, status: true, exitDate: true, endDate: true,
        student: { select: { studentRoll: true, roomNumber: true, hostelType: true, profile: { select: { name: true } } } },
        movements: { where: { type: "EXIT" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.permission.findMany({
      where: {
        facultyId: { not: null },
        approvedAt: { not: null },
        OR: [{ exitDate: { gte: start, lt: end } }, { movements: { some: { type: "EXIT", createdAt: { gte: start, lt: end } } } }],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true, purpose: true, status: true, requestType: true, exitDate: true, endDate: true,
        faculty: { select: { department: true, designation: true, profile: { select: { name: true } } } },
        movements: { where: { type: "EXIT" }, take: 1, select: { createdAt: true } },
      },
    }),
  ]);

  const student = (p: (typeof hostel)[number]) => ({
    id: p.id,
    name: p.student?.profile.name ?? "",
    roll: p.student?.studentRoll ?? "",
    room: p.student?.roomNumber ?? null,
    purpose: p.purpose,
    status: p.status,
    from: iso(p.exitDate),
    to: iso(p.endDate ?? p.exitDate),
    exitedAt: iso(p.movements[0]?.createdAt),
  });
  return {
    success: true,
    date: d,
    boys: hostel.filter((p) => p.student?.hostelType === "BOYS").map(student),
    ladies: hostel.filter((p) => p.student?.hostelType === "LADIES").map(student),
    faculty: faculty.map((p) => ({
      id: p.id,
      name: p.faculty?.profile.name ?? "",
      department: p.faculty?.department ?? null,
      designation: p.faculty?.designation ?? null,
      requestType: facultyRequestTypeLabel(p.requestType) || "Gate pass",
      purpose: p.purpose,
      status: p.status,
      from: iso(p.exitDate),
      to: iso(p.endDate ?? p.exitDate),
      exitedAt: iso(p.movements[0]?.createdAt),
    })),
  };
}

// ──────────────────────────────────────────────────────────────
// Main Admin: edit / delete register records
// ──────────────────────────────────────────────────────────────

/**
 * Main Admin overwrites a register record with corrected values. Any later
 * recordings (In / Out, workers marked out) are folded into the record.
 * The previous values are not kept.
 */
export async function adminUpdateRegisterEntry(entryId: string, payload: RawPayload) {
  await requireRole("ADMIN");
  if (typeof entryId !== "string" || !entryId) return { error: "Record not found" };

  try {
    const res = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"register-entry:" + entryId}))`;
      const original = await tx.registerEntry.findFirst({
        where: { id: entryId, kind: "ORIGINAL" },
        select: { id: true, register: true, data: true, supplements: { select: { kind: true, data: true, createdAt: true } } },
      });
      if (!original) return { error: "Record not found" };
      const def = entryRegister(original.register);
      if (!def) return { error: "Unknown register" };

      const current = effectiveData(def, original.data as RegisterData, original.supplements);
      const checked = await validateAdminEdit(def, current, payload, resolveStaff);
      if ("error" in checked) return { error: checked.error };

      await tx.registerEntry.deleteMany({ where: { parentId: original.id } });
      await tx.registerEntry.update({
        where: { id: original.id },
        data: {
          data: checked.data as Prisma.InputJsonValue,
          searchText: buildSearchText(def, checked.data),
          ...(checked.entryDateStr ? { entryDate: istDateToInstant(checked.entryDateStr) } : {}),
        },
      });
      return { success: true as const };
    });
    if ("success" in res) revalidateRegisters();
    return res;
  } catch (err: any) {
    console.error("[adminUpdateRegisterEntry] failed:", err?.message);
    return { error: "Could not save the changes. Please try again." };
  }
}

/** Main Admin permanently deletes a register record (and its later recordings). */
export async function adminDeleteRegisterEntry(entryId: string) {
  await requireRole("ADMIN");
  if (typeof entryId !== "string" || !entryId) return { error: "Record not found" };
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const original = await tx.registerEntry.findFirst({ where: { id: entryId, kind: "ORIGINAL" }, select: { id: true } });
      if (!original) return 0;
      await tx.registerEntry.deleteMany({ where: { parentId: original.id } });
      await tx.registerEntry.delete({ where: { id: original.id } });
      return 1;
    });
    if (!deleted) return { error: "Record not found or already deleted" };
  } catch (err: any) {
    console.error("[adminDeleteRegisterEntry] failed:", err?.message);
    return { error: "Could not delete the record. Please try again." };
  }
  revalidateRegisters();
  return { success: true };
}

/** Full details of one gate movement (exit / entry) for the details popup. */
export async function getMovementDetails(movementId: string) {
  await requireRole(...VIEW_ROLES);
  if (typeof movementId !== "string" || !movementId) return { error: "Record not found" };
  const m = await prisma.movement.findUnique({
    where: { id: movementId },
    select: {
      id: true, type: true, createdAt: true, notes: true, imagePath: true,
      gate: { select: { name: true, location: true } },
      securityUser: { select: { employeeId: true, profile: { select: { name: true } } } },
      student: {
        select: {
          studentRoll: true, department: true, year: true, semester: true, section: true, studentType: true, hostelType: true,
          roomNumber: true, hostelBlock: true, profile: { select: { name: true, phone: true } },
        },
      },
      faculty: { select: { employeeId: true, department: true, designation: true, profile: { select: { name: true, phone: true } } } },
      permission: {
        select: {
          id: true, type: true, purpose: true, destination: true, requestType: true, passKind: true,
          exitDate: true, endDate: true, expectedExit: true, expectedReturn: true, contactNumber: true, remarks: true,
          createdAt: true, approvedAt: true, approverType: true, approvalMode: true,
          approval: { select: { faculty: { select: { profile: { select: { name: true } } } }, warden: { select: { profile: { select: { name: true } } } } } },
        },
      },
    },
  });
  if (!m) return { error: "Record not found" };
  const person = m.student
    ? {
        kind: "Student",
        name: m.student.profile.name,
        phone: m.student.profile.phone,
        id: m.student.studentRoll,
        department: m.student.department,
        detail: [
          m.student.year && `Year ${m.student.year}`,
          m.student.semester && `Sem ${m.student.semester}`,
          m.student.section && `Section ${m.student.section}`,
        ].filter(Boolean).join(" • "),
        type:
          m.student.studentType === "HOSTELLER"
            ? `Hosteller${m.student.hostelType ? ` (${m.student.hostelType === "BOYS" ? "Boys" : "Ladies"})` : ""}${m.student.roomNumber ? ` • Room ${m.student.roomNumber}` : ""}`
            : "Day Scholar",
      }
    : m.faculty
    ? {
        kind: "Faculty",
        name: m.faculty.profile.name,
        phone: m.faculty.profile.phone,
        id: m.faculty.employeeId,
        department: m.faculty.department,
        detail: m.faculty.designation,
        type: "Faculty",
      }
    : null;
  const p = m.permission;
  return {
    success: true,
    movement: {
      id: m.id,
      type: m.type,
      at: m.createdAt.toISOString(),
      gate: [m.gate?.name, m.gate?.location].filter(Boolean).join(" • "),
      guard: [m.securityUser?.profile?.name, m.securityUser?.employeeId].filter(Boolean).join(" • "),
      notes: m.notes,
      photoUrl: await signedPhoto(m.imagePath),
      person,
      pass: p
        ? {
            type: p.type,
            requestType: facultyRequestTypeLabel(p.requestType) || null,
            hostelPass: p.passKind === "HOSTEL",
            purpose: p.purpose,
            destination: p.destination,
            dates: { from: iso(p.exitDate), to: iso(p.endDate ?? p.exitDate) },
            expectedExit: iso(p.expectedExit),
            expectedReturn: iso(p.expectedReturn),
            contactNumber: p.contactNumber,
            remarks: p.remarks,
            requestedAt: iso(p.createdAt),
            approvedAt: iso(p.approvedAt),
            approvedBy:
              p.approvalMode === "BOTH"
                ? "HOD & Dean"
                : p.approval?.faculty?.profile?.name ?? p.approval?.warden?.profile?.name ?? (p.approverType === "WARDEN" ? "Warden" : p.approverType === "DEAN" ? "Dean" : "HOD"),
          }
        : null,
    },
  };
}

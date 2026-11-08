"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, type AuthUser } from "@/lib/auth/helpers";
import { revalidatePath } from "next/cache";
import { createSignedPhotoUrl } from "@/lib/storage/storage-admin";
import { getRegisterAccess } from "@/lib/registers/access";
import {
  REGISTER_BY_KEY,
  REGISTERS,
  pendingActions,
  SECURITY_EDITABLE_REGISTERS,
  facultyRequestTypeLabel,
  isEntryRegister,
  updatableFields,
  yesNoWords,
  type EntryRegister,
  type RegisterKey,
  ESTATE_BOOKS,
  ADD_LATER_ROLES,
} from "@/lib/registers/definitions";
import {
  buildSearchText,
  effectiveData,
  validateCompletion,
  validateAdminEdit,
  validateNewRecord,
  validateFieldUpdate,
  type CompletionPayload,
  type RawPayload,
  type RegisterData,
  type StaffResolver,
} from "@/lib/registers/validate";
import { istDateString, istDateToInstant, istDayRangeFromParam, parseDateParam, parsePageParam } from "@/lib/time/ist";
import { delayMinutes, formatDelay, returnDueAt } from "@/lib/passes/return-scan";
import { closeSupersededTrips } from "@/lib/passes/close-trips";

/**
 * Delayed return for a pass's row: minutes late of the recorded return, or of
 * someone still out past their planned return. Null when on time.
 */
function delayOf(p: { status: string; expectedReturn?: Date | null; endDate?: Date | null; exitDate?: Date | null }, back?: { createdAt: Date } | null) {
  if (!back && p.status !== "EXITED") return null;
  const minutes = delayMinutes(returnDueAt(p), back ? back.createdAt : null);
  return minutes > 0 ? { minutes, returned: !!back } : null;
}
import { invalidateSecurityCache } from "./security";
import { sirosAlreadyInside, sirosInside } from "@/lib/registers/siros-inside";
import { getEntryRegister } from "@/lib/registers/catalog";
import { checkRateLimit } from "@/lib/auth/rate-limiter";
import { notifyLive, notifyPassHolder } from "@/lib/realtime/notify";
import { canOverrideVisitExit, checkVisitExit, closeVisitPass, newVisitCode, notifyHost, resolveHost } from "@/lib/visits/passes";
import {
  REGISTER_PAGE_SIZE,
  REGISTER_VIEW_ROLES,
  countStillInside,
  hasInsideChoice,
  queryInsideRegisterEntries,
  queryRegisterEntries,
  registerDayFilter,
  type RegisterListParams,
} from "@/lib/registers/list-entries";

const PAGE_SIZE = REGISTER_PAGE_SIZE;
// Pass books, counts and options: gate staff only (the Estate Manager reads its 7 books through the
// book lists, which check each book: list-entries.ts)
const VIEW_ROLES = ["SECURITY", "ADMIN", "SECURITY_SUPERVISOR"] as const;
const TOKEN_RE = /^[A-Za-z0-9-]{8,100}$/;

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────


// A guard's employee ID and gate rarely change: remembered for 5 minutes (one query less per save)
const staffSnapshotCache = new Map<string, { at: number; staff: { employeeId: string | null; gate: { name: string } | null } | null }>();

/** Who is recording, taken from the signed-in session — never from the form. */
async function recorderSnapshot(user: AuthUser) {
  const hit = staffSnapshotCache.get(user.profileId);
  let staff = hit && Date.now() - hit.at < 5 * 60_000 ? hit.staff : undefined;
  if (staff === undefined) {
    staff = await prisma.securityStaff.findUnique({
      where: { profileId: user.profileId },
      select: { employeeId: true, gate: { select: { name: true } } },
    });
    if (staffSnapshotCache.size > 500) staffSnapshotCache.clear();
    staffSnapshotCache.set(user.profileId, { at: Date.now(), staff });
  }
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
const dayFilter = registerDayFilter;

/**
 * After a register change: tell open screens of that register (live). No page
 * revalidation: register pages load their records in the browser (and reload
 * after a save), so re-rendering the page inside every save response only
 * made saving slower.
 */
function revalidateRegisters(register?: string) {
  if (register) notifyLive(`reg:${register}`);
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

const ROLE_DESIGNATION: Record<string, string> = {
  FACULTY: "Faculty",
  FACULTY_ADMIN: "Head of Department",
  DEAN: "Dean",
  DIRECTOR: "Director",
};

/** Job titles of the other logins (Estate Manager, Supervisor…) when none is saved */
const OTHER_ROLE_DESIGNATION: Record<string, string> = {
  ADMIN: "Admin",
  SECURITY_SUPERVISOR: "Security Supervisor",
  ESTATE_MANAGER: "Estate Manager",
};

/**
 * Faculty, HODs, Deans, Directors, Wardens and the other staff logins (Estate
 * Manager, Supervisors… and any added later; not students or guards) for the
 * "Faculty / Staff" pickers in register forms: name, employee ID, designation,
 * department.
 */
export async function getRegisterPeopleOptions() {
  await requireRole(...VIEW_ROLES);
  const [faculty, wardens, others] = await Promise.all([
    prisma.faculty.findMany({
      where: { profile: { active: true } },
      select: { employeeId: true, designation: true, department: true, profile: { select: { name: true, role: true } } },
      orderBy: { profile: { name: "asc" } },
      take: 2000,
    }),
    prisma.warden.findMany({
      where: { profile: { active: true } },
      select: { employeeId: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
      take: 300,
    }),
    prisma.profile.findMany({
      where: { active: true, role: { notIn: ["STUDENT", "SECURITY"] }, faculty: { is: null }, warden: { is: null } },
      select: { name: true, designation: true, role: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);
  return [
    ...faculty.map((p) => ({
      name: p.profile.name,
      employeeId: p.employeeId,
      // No designation saved (common for faculty accounts): use their role
      designation: p.designation?.trim() || ROLE_DESIGNATION[p.profile.role] || "Faculty",
      department: p.department,
    })),
    ...wardens.map((w) => ({ name: w.profile.name, employeeId: w.employeeId, designation: "Warden", department: null })),
    ...others.map((p) => ({
      name: p.name,
      employeeId: null,
      designation: p.designation?.trim() || OTHER_ROLE_DESIGNATION[p.role] || "Staff",
      department: null,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/** A student for the Keys Book "Key taken by" box (no phone: the server adds it on save) */
export type KeyStudent = { roll: string; name: string; department: string | null; year: number | null; section: string | null };

/**
 * Keys Book: students by roll number ("starts with", from 2 characters) or
 * name ("contains", from 3 letters); at most 8.
 */
export async function searchKeyStudents(query: string): Promise<KeyStudent[]> {
  const user = await requireRole("SECURITY", "ADMIN");
  const q = typeof query === "string" ? query.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  const byRoll = /\d/.test(q);
  if (q.length < (byRoll ? 2 : 3)) return [];
  const limit = checkRateLimit(`key-student:${user.profileId}`, { maxAttempts: 300, windowMs: 10 * 60_000, blockDurationMs: 10 * 60_000 });
  if (!limit.allowed) return [];
  const rows = await prisma.student.findMany({
    where: byRoll
      ? { studentRoll: { startsWith: q.replace(/\s+/g, "").toUpperCase() }, profile: { active: true } }
      : { profile: { active: true, name: { contains: q, mode: "insensitive" } } },
    select: { studentRoll: true, department: true, year: true, section: true, profile: { select: { name: true } } },
    orderBy: { studentRoll: "asc" },
    take: 8,
  });
  return rows.map((s) => ({ roll: s.studentRoll, name: s.profile.name, department: s.department, year: s.year, section: s.section }));
}

/**
 * Keys Book: fills the phone number and details of the person picked in "Key
 * taken by" (holderId: employee ID or roll number) from their account. A name
 * typed that is not in the list is kept as typed, without them.
 */
async function fillKeyHolder(data: RegisterData) {
  const id = typeof data.holderId === "string" ? data.holderId.trim() : "";
  data.phone = null;
  data.holderDetails = null;
  data.holderId = null;
  if (!id) return;
  const join = (parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(" · ") || null;
  if (data.holderType === "Student") {
    const s = await prisma.student.findFirst({
      where: { studentRoll: id.toUpperCase(), profile: { active: true } },
      select: { studentRoll: true, department: true, year: true, section: true, profile: { select: { name: true, phone: true } } },
    });
    if (!s) return;
    data.personName = s.profile.name;
    data.holderId = s.studentRoll;
    data.phone = s.profile.phone?.trim() || null;
    data.holderDetails = join([s.department, s.year ? `Year ${s.year}` : null, s.section ? `Section ${s.section}` : null]);
    return;
  }
  const [f, w] = await Promise.all([
    prisma.faculty.findFirst({
      where: { employeeId: id, profile: { active: true } },
      select: { employeeId: true, designation: true, department: true, profile: { select: { name: true, phone: true, role: true } } },
    }),
    prisma.warden.findFirst({
      where: { employeeId: id, profile: { active: true } },
      select: { employeeId: true, profile: { select: { name: true, phone: true } } },
    }),
  ]);
  if (f) {
    data.personName = `${f.profile.name} (${f.employeeId})`;
    data.holderId = f.employeeId;
    data.phone = f.profile.phone?.trim() || null;
    data.holderDetails = join([f.designation?.trim() || ROLE_DESIGNATION[f.profile.role] || "Faculty", f.department]);
  } else if (w) {
    data.personName = `${w.profile.name} (${w.employeeId})`;
    data.holderId = w.employeeId;
    data.phone = w.profile.phone?.trim() || null;
    data.holderDetails = "Warden";
  }
}

/** Security records a new register entry. Saved records can never be edited or deleted. */
export async function createRegisterEntry(registerKey: string, payload: RawPayload, clientToken: string) {
  const user = await requireRole("SECURITY", "ADMIN");
  const def = await getEntryRegister(registerKey);
  if (!def) return { error: "Unknown register" };
  if (!(await getRegisterAccess(user)).canCreate(def.key)) return { error: "You are not allowed to add to this register" };
  if (typeof clientToken !== "string" || !TOKEN_RE.test(clientToken)) return { error: "Invalid form. Reload the page." };

  // "Meeting (faculty / staff)": kept outside the record's own fields (see VisitPass)
  const { visitHost, ...fields } = (payload ?? {}) as RawPayload & { visitHost?: unknown };
  const recorderLookup = recorderSnapshot(user);
  recorderLookup.catch(() => {});
  // Siros labour: who is inside, read while the entry is checked (not after)
  const insideLookup = def.key === "SIROS_DAILY_LABOUR" ? sirosInside() : undefined;
  insideLookup?.catch(() => {});
  const result = await validateNewRecord(def, fields as RawPayload, resolveStaff);
  if ("error" in result) return { error: result.error };
  // Siros labour: a coolie / contractor still inside on another entry can't be added again until it is marked Out
  if (def.key === "SIROS_DAILY_LABOUR") {
    const busy = await sirosAlreadyInside(result.data as Record<string, unknown>, insideLookup);
    if (busy) return { error: busy };
  }
  // Keys Book: the picked faculty / student's phone number and details, from their account
  if (def.key === "KEYS") await fillKeyHolder(result.data);
  const host = def.visitHost && visitHost ? await resolveHost(visitHost) : null;
  if (def.visitHost && visitHost && !host) return { error: "Choose the faculty / staff member from the list" };
  // A meeting code only for someone coming in (not a record that starts with Out)
  const meeting = host && result.data.direction !== "OUT" ? host : null;

  try {
    const recorder = await recorderLookup;
    const record = {
      register: def.key,
      kind: "ORIGINAL",
      entryDate: istDateToInstant(result.entryDateStr),
      data: result.data as Prisma.InputJsonValue,
      searchText: buildSearchText(def, result.data),
      clientToken,
      ...recorder,
    };
    // Most records: one insert (a transaction costs extra round trips to the
    // database on every save). With a meeting code, both are saved together.
    const entry = !(meeting && def.visitHost)
      ? await prisma.registerEntry.create({ data: record, select: { id: true } })
      : await prisma.$transaction(async (tx) => {
      const created = await tx.registerEntry.create({ data: record, select: { id: true } });
      if (meeting && def.visitHost) {
        const v = def.visitHost;
        const text = (k?: string) => (k && typeof result.data[k] === "string" ? String(result.data[k]).trim() : "") || null;
        await tx.visitPass.create({
          data: {
            registerEntryId: created.id,
            register: def.key,
            hostProfileId: meeting.id,
            hostName: meeting.name,
            visitorName: text(v.visitorField) ?? "Visitor",
            visitorPhone: text(v.phoneField),
            purpose: text(v.purposeField),
            code: newVisitCode(),
          },
        });
      }
      return created;
    });
    revalidateRegisters(def.key);
    if (meeting) void notifyHost(meeting.id);
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
  if (typeof entryId !== "string" || !entryId) return { error: "Record not found" };
  if (typeof clientToken !== "string" || !TOKEN_RE.test(clientToken)) return { error: "Invalid form. Reload the page." };
  // Both answers kept in memory for a minute; looked up together when not
  const [access, canOverride] = await Promise.all([getRegisterAccess(user), canOverrideVisitExit(user)]);
  let metHost: string | null = null;

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
      const def = await getEntryRegister(original.register, tx);
      if (!def) return { error: "Unknown register" };
      if (!access.canCreate(def.key)) return { error: "You are not allowed to update this register" };

      const current = effectiveData(def, original.data as RegisterData, original.supplements);
      const checked = await validateCompletion(def, current, payload);
      if ("error" in checked) return { error: checked.error };

      // Leaving (Out, or closing the record) after meeting a faculty / staff member: the meeting code
      const next = pendingActions(def, current).next;
      const leaving = (!!payload?.markMovement && next?.direction === "OUT") || !!payload?.close;
      let visitCheck: Awaited<ReturnType<typeof checkVisitExit>> | null = null;
      if (leaving) {
        const pass = await tx.visitPass.findUnique({
          where: { registerEntryId: original.id },
          select: { id: true, code: true, status: true, attempts: true, hostName: true, hostProfileId: true },
        });
        visitCheck = await checkVisitExit(pass, { code: payload?.visitCode, overrideReason: payload?.visitOverride }, canOverride, tx);
        if (!visitCheck.ok) {
          return { error: visitCheck.error, needsCode: true as const, locked: visitCheck.locked, triesLeft: visitCheck.triesLeft, canOverride };
        }
        if (visitCheck.passId) metHost = pass?.hostProfileId ?? null;
      }

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
      if (visitCheck?.ok) await closeVisitPass(tx, visitCheck, user);
      return { success: true as const, register: def.key };
    });
    if ("success" in res) {
      revalidateRegisters(res.register);
      void notifyHost(metHost);
    }
    return res;
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true, duplicate: true };
    console.error("[completeRegisterEntry] failed:", err?.message);
    return { error: "Could not save. Please try again." };
  }
}

export async function listRegisterEntries(params: RegisterListParams) {
  const user = await requireRole(...REGISTER_VIEW_ROLES);
  return queryRegisterEntries(user, params);
}

/** "Inside now" (Admission Book): one page of today's and yesterday's records still waiting for Out */
export async function listInsideRegisterEntries(params: { register: string; page?: number }) {
  const user = await requireRole(...REGISTER_VIEW_ROLES);
  return queryInsideRegisterEntries(user, params);
}

// ──────────────────────────────────────────────────────────────
// Form 1 — Faculty Book (from faculty passes + gate movements)
// ──────────────────────────────────────────────────────────────

/** Passes whose date range covers the day, or that had a gate movement that day. */
function passOnDay(range: { start: Date; end: Date }): Prisma.PermissionWhereInput {
  return {
    OR: [
      { exitDate: { gte: range.start, lt: range.end } },
      // A pass whose dates cover the day shows only while it is not finished (approved, or out and not back yet);
      // a finished one (came back, expired…) shows on the days it went out / came back (its gate scans), not every later day
      { exitDate: { lt: range.end }, endDate: { gte: range.start }, status: { in: ["APPROVED", "EXITED"] } },
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
        /** Out past the planned return, or came back late: { minutes, returned } */
        delay: delayOf(p, back),
      };
    }),
  };
}

/**
 * Students Book & Pass: approved day-scholar gate passes (exit and entry) with
 * the actual out / in scanned at the gate. Hostellers' outings have their own
 * hostel books, and hostel passes (college → hostel) never go through the gate.
 */
export async function getStudentBook(params: { date?: string; q?: string; page?: number }) {
  await requireRole(...VIEW_ROLES);
  const page = parsePageParam(String(params?.page ?? 1));
  const range = dayFilter(params?.date);
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 100) : "";

  const where: Prisma.PermissionWhereInput = {
    AND: [
      { studentId: { not: null }, approvedAt: { not: null } },
      // Day-scholar passes: outings are warden-approved, hostel passes are one-way to the hostel
      { NOT: { approverType: "WARDEN" } },
      { OR: [{ passKind: null }, { passKind: { not: "HOSTEL" } }] },
      ...(range ? [passOnDay(range)] : []),
      ...(q
        ? [{
            student: {
              OR: [
                { studentRoll: { contains: q, mode: "insensitive" as const } },
                { department: { contains: q, mode: "insensitive" as const } },
                { profile: { name: { contains: q, mode: "insensitive" as const } } },
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
        exitDate: true, expectedExit: true, purpose: true, destination: true,
        approval: { select: { faculty: { select: { profile: { select: { name: true } } } } } },
        student: { select: { studentRoll: true, department: true, year: true, section: true, profile: { select: { name: true, phone: true } } } },
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
    rows: rows.map((p) => ({
      id: p.id,
      requestDate: iso(p.createdAt),
      studentName: p.student?.profile.name ?? "",
      roll: p.student?.studentRoll ?? "",
      department: p.student?.department ?? null,
      year: p.student?.year ?? null,
      section: p.student?.section ?? null,
      phone: p.student?.profile.phone ?? null,
      passType: p.type === "ENTRY" ? "Entry pass" : "Exit pass",
      date: iso(p.exitDate),
      plannedTime: iso(p.expectedExit),
      purpose: p.purpose,
      destination: p.destination,
      status: p.status,
      approvedAt: iso(p.approvedAt),
      approvedBy: p.approval?.faculty?.profile?.name ?? "HOD",
      actualOut: movementInfo(p.movements.find((m) => m.type === "EXIT")),
      actualIn: movementInfo(p.movements.find((m) => m.type === "ENTRY")),
    })),
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
        select: {
          id: true, facultyId: true, status: true, exitDate: true, endDate: true, expectedReturn: true,
          qr: { select: { id: true } }, movements: { select: { type: true } },
        },
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
          notes: [
            "Faculty return marked in Faculty Book",
            delayMinutes(returnDueAt(p)) > 0 ? `Delayed return: ${formatDelay(delayMinutes(returnDueAt(p)))} late` : null,
          ].filter(Boolean).join(" · "),
        },
      });
      await tx.permission.update({ where: { id: p.id }, data: { status: "COMPLETED" } });
      if (p.qr) await tx.qrCredential.update({ where: { id: p.qr.id }, data: { usedForEntry: true, active: false } });
      // Back on campus: any other trip they never returned on is over
      await closeSupersededTrips(tx, { facultyId: p.facultyId }, p.id);
    });
  } catch (err: any) {
    if (err?.code === "P2002") return { error: "Return already recorded" };
    return { error: err?.message || "Could not record the return" };
  }

  // The gate log shows this return straight away (not after its 15 s cache)
  await invalidateSecurityCache();
  revalidateRegisters();
  notifyLive("gate");
  notifyPassHolder(permissionId);
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
      photoUrl: o.photoUrl,
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
        /** Out past the planned return, or came back late: { minutes, returned } */
        delay: delayOf(p, back),
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

// Information notes on the home outing passbook ("Dasara holidays — hostel
// closed", "Parents' meeting"): for one date or a set of dates. Stored as
// register entries under their own key, with who wrote them and when.
const OUTING_NOTE_KEY = "OUTING_NOTE";
const MAX_NOTE_DAYS = 62;

export async function addOutingNote(input: { from: string; to?: string; note: string }, clientToken: string) {
  const user = await requireRole("SECURITY", "ADMIN");
  if (typeof clientToken !== "string" || !TOKEN_RE.test(clientToken)) return { error: "Invalid form. Reload the page." };
  const from = parseDateParam(input?.from);
  const to = parseDateParam(input?.to || input?.from);
  if (!from || !to) return { error: "Choose the date" };
  if (to < from) return { error: "The end date can't be before the start date" };
  const days = Math.round((istDateToInstant(to).getTime() - istDateToInstant(from).getTime()) / 86_400_000) + 1;
  if (days > MAX_NOTE_DAYS) return { error: "A note can cover at most 62 days" };
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  if (!note) return { error: "Write the information" };
  if (note.length > 500) return { error: "Keep the information under 500 characters" };

  try {
    await prisma.registerEntry.create({
      data: {
        register: OUTING_NOTE_KEY,
        kind: "ORIGINAL",
        entryDate: istDateToInstant(from),
        data: { from, to, note },
        searchText: note.toLowerCase().slice(0, 500),
        clientToken,
        ...(await recorderSnapshot(user)),
      },
    });
    return { success: true };
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true, duplicate: true };
    console.error("[addOutingNote] failed:", err?.message);
    return { error: "Could not save. Please try again." };
  }
}

/** Notes touching the chosen dates (newest first). */
export async function listOutingNotes(params: { from?: string; to?: string }) {
  const user = await requireRole(...VIEW_ROLES);
  const to = parseDateParam(params?.to) ?? istDateString();
  const from = parseDateParam(params?.from) ?? to;
  // A note starts at most MAX_NOTE_DAYS before the range and still covers it
  const earliest = new Date(istDateToInstant(from).getTime() - MAX_NOTE_DAYS * 86_400_000);
  const end = new Date(istDateToInstant(to).getTime() + 86_400_000);
  const rows = await prisma.registerEntry.findMany({
    where: { register: OUTING_NOTE_KEY, kind: "ORIGINAL", entryDate: { gte: earliest, lt: end } },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: { id: true, data: true, recordedById: true, recordedByName: true, recordedByEmployeeId: true, recordedAtGate: true, createdAt: true },
  });
  return {
    success: true,
    notes: rows
      .map((r) => {
        const d = (r.data ?? {}) as { from?: string; to?: string; note?: string };
        return {
          id: r.id,
          from: d.from ?? "",
          to: d.to ?? d.from ?? "",
          note: d.note ?? "",
          by: [r.recordedByName, r.recordedByEmployeeId, r.recordedAtGate].filter(Boolean).join(" • "),
          createdAt: r.createdAt.toISOString(),
          canDelete: user.role === "ADMIN" || r.recordedById === user.profileId,
        };
      })
      .filter((n) => n.from && n.to >= from && n.from <= to),
  };
}

const NOTES_PAGE_SIZE = 20;

/**
 * Information notes, newest first, one page (20) at a time: all of them, or
 * only those touching the chosen dates (from / to). Small reads on the free plan.
 */
export async function listOutingNotesPage(params: { from?: string; to?: string; page?: number }) {
  await requireRole(...VIEW_ROLES);
  const from = parseDateParam(params?.from);
  const to = parseDateParam(params?.to);
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(params?.page) || 1)));
  const where: Prisma.RegisterEntryWhereInput = { register: OUTING_NOTE_KEY, kind: "ORIGINAL" };
  if (from && to) {
    // Starts on or before "to", ends on or after "from" (dates are YYYY-MM-DD, so text order is date order)
    where.entryDate = { lt: new Date(istDateToInstant(to).getTime() + 86_400_000) };
    where.data = { path: ["to"], gte: from };
  }
  const [rows, total] = await Promise.all([
    prisma.registerEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * NOTES_PAGE_SIZE,
      take: NOTES_PAGE_SIZE,
      select: { id: true, data: true, recordedByName: true, recordedByEmployeeId: true, recordedAtGate: true, createdAt: true },
    }),
    prisma.registerEntry.count({ where }),
  ]);
  return {
    success: true,
    total,
    pageSize: NOTES_PAGE_SIZE,
    notes: rows.map((r) => {
      const d = (r.data ?? {}) as { from?: string; to?: string; note?: string };
      return {
        id: r.id,
        from: d.from ?? "",
        to: d.to ?? d.from ?? "",
        note: d.note ?? "",
        by: [r.recordedByName, r.recordedByEmployeeId, r.recordedAtGate].filter(Boolean).join(" • "),
        createdAt: r.createdAt.toISOString(),
        canDelete: false,
      };
    }),
  };
}

/** The writer, or the Main Admin, can remove a note. */
export async function deleteOutingNote(id: string) {
  const user = await requireRole("SECURITY", "ADMIN");
  if (typeof id !== "string" || !id) return { error: "Note not found" };
  const row = await prisma.registerEntry.findFirst({ where: { id, register: OUTING_NOTE_KEY }, select: { recordedById: true } });
  if (!row) return { error: "Note not found" };
  if (user.role !== "ADMIN" && row.recordedById !== user.profileId) return { error: "Only the person who wrote this note, or the Main Admin, can remove it" };
  await prisma.registerEntry.delete({ where: { id } });
  return { success: true };
}

// ──────────────────────────────────────────────────────────────
// Overview counts for the registers hub
// ──────────────────────────────────────────────────────────────

export async function getRegisterCountsToday() {
  const user = await requireRole(...VIEW_ROLES);
  const { hidden } = await getRegisterAccess(user);
  const { start, end } = istDayRangeFromParam(istDateString());
  // In / Out books with someone still inside (not marked Out yet, any day lately):
  // the Registers list then asks "Still inside" or "All records" when one is opened.
  // The Admission Book has its own Inside now; the Car / Auto books their boards.
  const openBooks = REGISTERS.filter(isEntryRegister).filter((d) => hasInsideChoice(d) && !hidden.includes(d.key));
  const [grouped, open] = await Promise.all([
    prisma.registerEntry.groupBy({
      by: ["register"],
      where: { kind: "ORIGINAL", entryDate: { gte: start, lt: end }, register: { notIn: hidden } },
      _count: { _all: true },
    }),
    countStillInside(openBooks, end),
  ]);
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.register] = g._count._all;
  // "open:<register>": how many are still inside
  for (const [k, n] of Object.entries(open)) if (n > 0) counts[`open:${k}`] = n;
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
      const def = await getEntryRegister(original.register, tx);
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
      return { success: true as const, register: def.key };
    });
    if ("success" in res) revalidateRegisters(res.register);
    return res;
  } catch (err: any) {
    console.error("[adminUpdateRegisterEntry] failed:", err?.message);
    return { error: "Could not save the changes. Please try again." };
  }
}

/**
 * Security edits a record of a register they may edit (the Cooli Book). The
 * change is saved as a correction on top of the original, so the history of
 * what was first written, and who changed it, stays.
 */
export async function securityEditRegisterEntry(entryId: string, payload: RawPayload, clientToken: string) {
  const user = await requireRole("SECURITY");
  if (typeof entryId !== "string" || !entryId) return { error: "Record not found" };
  if (typeof clientToken !== "string" || !TOKEN_RE.test(clientToken)) return { error: "Invalid form. Reload the page." };

  try {
    const res = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"register-entry:" + entryId}))`;
      const original = await tx.registerEntry.findFirst({
        where: { id: entryId, kind: "ORIGINAL" },
        select: { id: true, register: true, entryDate: true, data: true, supplements: { select: { kind: true, data: true, createdAt: true } } },
      });
      if (!original) return { error: "Record not found" };
      if (!SECURITY_EDITABLE_REGISTERS.includes(original.register)) return { error: "You are not allowed to update this register" };
      const def = await getEntryRegister(original.register, tx);
      if (!def) return { error: "Unknown register" };

      const current = effectiveData(def, original.data as RegisterData, original.supplements);
      const checked = await validateAdminEdit(def, current, payload, resolveStaff);
      if ("error" in checked) return { error: checked.error };

      await tx.registerEntry.create({
        data: {
          register: def.key,
          kind: "CORRECTION",
          parentId: original.id,
          entryDate: checked.entryDateStr ? istDateToInstant(checked.entryDateStr) : original.entryDate,
          data: checked.data as Prisma.InputJsonValue,
          searchText: buildSearchText(def, checked.data),
          reason: "Edited by Security",
          clientToken,
          ...(await recorderSnapshot(user)),
        },
      });
      return { success: true as const, register: def.key };
    });
    if ("success" in res) revalidateRegisters(res.register);
    return res;
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true, duplicate: true };
    console.error("[securityEditRegisterEntry] failed:", err?.message);
    return { error: "Could not save the changes. Please try again." };
  }
}

/**
 * Changes one updatable field of a saved record — a Yes / No status such as
 * "Payment completed", or Remarks — from the record's own section. Saved as a
 * correction, so the history shows who changed it and when.
 * Security (on registers they record in) and Main Admin.
 */
export async function updateRegisterField(entryId: string, fieldKey: string, value: unknown, clientToken: string) {
  const user = await requireRole("SECURITY", "ADMIN", "ESTATE_MANAGER");
  if (typeof entryId !== "string" || !entryId) return { error: "Record not found" };
  if (typeof fieldKey !== "string" || !fieldKey) return { error: "Unknown field" };
  if (typeof clientToken !== "string" || !TOKEN_RE.test(clientToken)) return { error: "Invalid form. Reload the page." };

  try {
    const access = await getRegisterAccess(user);
    const res = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"register-entry:" + entryId}))`;
      const original = await tx.registerEntry.findFirst({
        where: { id: entryId, kind: "ORIGINAL" },
        select: { id: true, register: true, entryDate: true, data: true, supplements: { select: { kind: true, data: true, createdAt: true } } },
      });
      if (!original) return { error: "Record not found" };
      const def = await getEntryRegister(original.register, tx);
      if (!def) return { error: "Unknown register" };
      if (user.role === "SECURITY" && !access.canCreate(def.key)) return { error: "You are not allowed to update this register" };
      const field = updatableFields(def).find((f) => f.key === fieldKey);
      if (!field) return { error: "This field cannot be changed" };
      // Estate Manager (and later a Civil Engineer): only a photo added later on their books (e.g. the bill photos)
      if (user.role !== "SECURITY" && user.role !== "ADMIN") {
        const allowed = ADD_LATER_ROLES.includes(user.role) && ESTATE_BOOKS.includes(def.key) && field.type === "photo" && !!field.addLaterWhen;
        if (!allowed) return { error: "You are not allowed to update this register" };
      }

      const checked = await validateFieldUpdate(field, value);
      if ("error" in checked) return { error: checked.error };
      const next = field.type === "yesno" ? checked.value === true : checked.value;

      const current = effectiveData(def, original.data as RegisterData, original.supplements);
      // Added later (e.g. the bill after "No bill"): only on those records, and a photo only once
      if (field.addLaterWhen && current[field.addLaterWhen] !== true) return { error: "This field cannot be changed" };
      const had = current[field.key];
      if (field.type === "photo" && ((typeof had === "string" && had) || (Array.isArray(had) && had.length > 0))) return { error: "The photo is already added" };
      // Locked: e.g. "Bill taken by" once the bill is marked taken
      if (field.lockedBy && current[field.lockedBy] === true) {
        const flag = def.fields.find((x) => x.key === field.lockedBy);
        return { error: `${field.label} can't be changed after "${flag ? yesNoWords(flag)[0] : field.lockedBy}"` };
      }
      // Marking it (e.g. "Bill taken") needs the fields it locks to be filled first
      if (field.type === "yesno" && next === true) {
        const needs = def.fields.find((x) => x.lockedBy === field.key && (current[x.key] === null || current[x.key] === undefined || current[x.key] === ""));
        if (needs) return { error: `Fill "${needs.label}" first` };
      }
      const before = field.type === "yesno" ? current[field.key] === true : current[field.key] ?? null;
      if (before === next) return { success: true as const, register: "" };

      const data: RegisterData = { ...current, [field.key]: next };
      await tx.registerEntry.create({
        data: {
          register: def.key,
          kind: "CORRECTION",
          parentId: original.id,
          entryDate: original.entryDate,
          data: data as Prisma.InputJsonValue,
          searchText: buildSearchText(def, data),
          reason: field.type === "yesno" ? `${field.label}: ${yesNoWords(field)[next ? 0 : 1]}` : `${field.label} updated`,
          clientToken,
          ...(await recorderSnapshot(user)),
        },
      });
      return { success: true as const, register: def.key };
    });
    if ("success" in res) revalidateRegisters(res.register);
    return res;
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true };
    console.error("[updateRegisterField] failed:", err?.message);
    return { error: "Could not save the changes. Please try again." };
  }
}

/** Main Admin permanently deletes a register record (and its later recordings). */
export async function adminDeleteRegisterEntry(entryId: string) {
  await requireRole("ADMIN");
  if (typeof entryId !== "string" || !entryId) return { error: "Record not found" };
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const original = await tx.registerEntry.findFirst({ where: { id: entryId, kind: "ORIGINAL" }, select: { id: true, register: true } });
      if (!original) return null;
      await tx.registerEntry.deleteMany({ where: { parentId: original.id } });
      await tx.registerEntry.delete({ where: { id: original.id } });
      return original.register;
    });
    if (!deleted) return { error: "Record not found or already deleted" };
    revalidateRegisters(deleted);
    return { success: true };
  } catch (err: any) {
    console.error("[adminDeleteRegisterEntry] failed:", err?.message);
    return { error: "Could not delete the record. Please try again." };
  }
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

// ──────────────────────────────────────────────────────────────
// Car Book / Auto Book: suggestions learned from the book own entries
// ──────────────────────────────────────────────────────────────

export type VehicleOptions = {
  drivers: { name: string; phone: string | null }[];
  vehicles: { name: string; number: string }[];
  /** Purposes typed before (Auto Book) */
  purposes: string[];
  /** Not used any more (kept so older callers still type-check) */
  people: string[];
};

const VEHICLE_BOOKS: Record<string, { numberKey: string }> = {
  CAR_BOOK: { numberKey: "vehicleNumber" },
  AUTO_IN_OUT: { numberKey: "autoNumber" },
};
const VEHICLE_OPTION_CAP = 100;
const VEHICLE_LEARN_DAYS = 90;

/**
 * One request when a Car Book / Auto Book form opens: the distinct car names +
 * numbers, driver names and purposes typed in the book's own entries of the
 * last ~90 days (newest first, about 100 each). Read only; nothing to register.
 */
/**
 * Values typed before in one box of a register (e.g. Work Area), newest first,
 * for a type-or-select box: the last 6 months, at most 40 different values.
 */
export async function getFieldSuggestions(
  registerKey: string,
  fieldKeys: string[]
): Promise<{ values: Record<string, string[]>; fills?: Record<string, Record<string, Record<string, string>>> } | { error: string }> {
  await requireRole("SECURITY", "ADMIN", "SECURITY_SUPERVISOR");
  const def = await getEntryRegister(registerKey);
  const keys = Array.isArray(fieldKeys) ? fieldKeys.filter((k) => typeof k === "string").slice(0, 5) : [];
  const suggestable = (k: string) => {
    const combo = def?.fields.find((x) => x.key === k)?.combo;
    return combo === "suggest" || combo === "sirosContractor";
  };
  if (!def || !keys.length || keys.some((k) => !suggestable(k))) return { error: "Unknown register" };
  const rows = await prisma.registerEntry.findMany({
    where: { register: def.key, kind: "ORIGINAL", createdAt: { gte: new Date(Date.now() - 180 * 86_400_000) } },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: { data: true },
  });
  // Every suggested box from the same read
  const values: Record<string, string[]> = {};
  const fills: Record<string, Record<string, Record<string, string>>> = {};
  for (const fieldKey of keys) {
    const also = def.fields.find((x) => x.key === fieldKey)?.suggestFills ?? [];
    const seen = new Map<string, string>();
    for (const r of rows) {
      const d = (r.data as Record<string, unknown> | null) ?? {};
      const v = d[fieldKey];
      if (typeof v !== "string") continue;
      const text = v.trim().replace(/\s+/g, " ");
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.set(key, text);
      // The newest entry with this value: its other boxes (e.g. designation, department)
      if (also.length) {
        const pick: Record<string, string> = {};
        for (const k of also) if (typeof d[k] === "string" && (d[k] as string).trim()) pick[k] = (d[k] as string).trim();
        if (Object.keys(pick).length) (fills[fieldKey] ??= {})[key] = pick;
      }
      if (seen.size >= 40) break;
    }
    values[fieldKey] = [...seen.values()];
  }
  return { values, fills };
}

export type CarOnBoard = {
  /** Number (or name) the car is known by */
  key: string;
  name: string;
  number: string;
  /** "out": left and not back yet; "in": on campus */
  state: "in" | "out";
  /** When it went out / came in (last move), ISO */
  since: string | null;
  /** The record waiting for its other side (Mark In after Out, or Mark Out after an In-first record) */
  openId: string | null;
  openNext: "IN" | "OUT" | null;
  /** Boxes copied into a new record when it moves again (e.g. car name + number, or auto driver + purpose) */
  fill: Record<string, string>;
};

/** Which boxes name a vehicle on the board: title, the smaller line, and what a new record copies */
const BOARDS: Record<string, { title: string; sub: string[]; fill: string[] }> = {
  CAR_BOOK: { title: "vehicleName", sub: ["vehicleNumber"], fill: ["vehicleName", "vehicleNumber"] },
  AUTO_IN_OUT: { title: "driverName", sub: ["autoNumber", "purpose"], fill: ["driverName", "purpose"] },
};

/**
 * Car Book board: every car seen in the book (name + number), with where it is now —
 * out (since when) or on campus — and the record waiting for its other side.
 * One small read (the latest 400 records with their later In / Out).
 */
export async function getCarBoard(registerKey: string = "CAR_BOOK"): Promise<{ success: true; cars: CarOnBoard[] } | { error: string }> {
  await requireRole(...VIEW_ROLES);
  const board = BOARDS[registerKey];
  const def = board ? await getEntryRegister(registerKey) : null;
  if (!board || !def || !def.movement) return { error: "Unknown register" };
  const rows = await prisma.registerEntry.findMany({
    where: { register: registerKey, kind: "ORIGINAL" },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: { id: true, data: true, createdAt: true, supplements: { select: { kind: true, data: true, createdAt: true } } },
  });
  const seen = new Map<string, CarOnBoard>();
  for (const r of rows) {
    const d = effectiveData(def, r.data as RegisterData, r.supplements);
    const text = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
    const name = text(board.title);
    const number = board.sub.map(text).find(Boolean) ?? "";
    // Cars: by number (or name); autos: by driver
    const key = (registerKey === "CAR_BOOK" ? number || name : name || number).toUpperCase().replace(/[\s-]/g, "");
    if (!key || seen.has(key)) continue; // the newest record of each vehicle decides where it is
    const next = pendingActions(def, d).next;
    const lastMove = r.supplements.filter((x) => x.kind === "COMPLETION").map((x) => x.createdAt).sort((x, y) => y.getTime() - x.getTime())[0] ?? r.createdAt;
    // Waiting for In = out now; waiting for Out = inside. Both sides done: where the last side left it
    // (went out then came back = inside; came in then went out = out)
    const out = next ? next.direction === "IN" : d.direction === "IN";
    const fill: Record<string, string> = {};
    for (const k of board.fill) if (text(k)) fill[k] = text(k);
    seen.set(key, {
      key,
      name,
      number,
      state: out ? "out" : "in",
      since: lastMove.toISOString(),
      openId: next ? r.id : null,
      openNext: next?.direction ?? null,
      fill,
    });
  }
  // Cars that are out first, then by name
  const cars = [...seen.values()].sort((x, y) => (x.state === y.state ? (x.name || x.number).localeCompare(y.name || y.number) : x.state === "out" ? -1 : 1));
  return { success: true, cars };
}

// ─── Estate Manager: verifying the stock, labour and work-vehicle books ───

const VERIFY_DAYS = 60;

/** "Verified" on a saved entry (Estate Manager): a permanent record linked to it, with who and when. Once only. */
export async function verifyRegisterEntry(entryId: string) {
  const user = await requireRole("ESTATE_MANAGER", "ADMIN");
  if (typeof entryId !== "string" || !/^[0-9a-f-]{36}$/i.test(entryId)) return { error: "Record not found" };
  const entry = await prisma.registerEntry.findFirst({
    where: { id: entryId, kind: "ORIGINAL" },
    select: { id: true, register: true, entryDate: true },
  });
  if (!entry || !ESTATE_BOOKS.includes(entry.register)) return { error: "Record not found" };
  try {
    await prisma.registerEntry.create({
      data: {
        register: entry.register,
        kind: "VERIFICATION",
        parentId: entry.id,
        entryDate: entry.entryDate,
        data: { verified: true },
        reason: "Verified by Estate Manager",
        // One verification per entry: a second tap is refused by the database
        clientToken: `verify-${entry.id}`,
        recordedById: user.profileId,
        recordedByName: user.name,
        recordedByRole: user.role,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true, already: true };
    console.error("[verifyRegisterEntry] failed:", err?.message);
    return { error: "Could not save. Please try again." };
  }
  notifyLive(`reg:${entry.register}`, "estate");
  return { success: true };
}

/** Estate Manager home: entries not verified yet in each of the 7 books (last 60 days). */
export async function getEstateCounts(): Promise<{ success: true; counts: Record<string, number> } | { error: string }> {
  await requireRole("ESTATE_MANAGER", "ADMIN");
  const since = new Date(Date.now() - VERIFY_DAYS * 86_400_000);
  const grouped = await prisma.registerEntry.groupBy({
    by: ["register"],
    where: {
      register: { in: [...ESTATE_BOOKS] },
      kind: "ORIGINAL",
      createdAt: { gte: since },
      supplements: { none: { kind: "VERIFICATION" } },
    },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.register] = g._count._all;
  return { success: true, counts };
}

export async function getVehicleOptions(registerKey: string): Promise<VehicleOptions | { error: string }> {
  await requireRole("SECURITY", "ADMIN", "SECURITY_SUPERVISOR");
  const book = VEHICLE_BOOKS[registerKey];
  if (!book) return { error: "Unknown register" };
  const since = new Date(Date.now() - VEHICLE_LEARN_DAYS * 86_400_000);
  const learned = await prisma.registerEntry.findMany({
    where: { register: registerKey, kind: "ORIGINAL", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { data: true },
    take: 600,
  });

  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  const drivers = new Map<string, { name: string; phone: string | null }>();
  const vehicles = new Map<string, { name: string; number: string }>();
  const purposes = new Map<string, string>();
  const squash = (v: string) => v.toLowerCase().replace(/\s+/g, " ");
  for (const row of learned) {
    const d = (row.data ?? {}) as Record<string, unknown>;
    const driver = text(d.driverName);
    if (driver && !drivers.has(squash(driver))) drivers.set(squash(driver), { name: driver, phone: null });
    const purpose = text(d.purpose);
    if (registerKey === "AUTO_IN_OUT" && purpose && !purposes.has(squash(purpose))) purposes.set(squash(purpose), purpose);
    if (registerKey === "CAR_BOOK") {
      const name = text(d.vehicleName);
      const number = text(d[book.numberKey]);
      const k = (number || name).toUpperCase().replace(/\s+/g, "");
      if (!k) continue;
      const have = vehicles.get(k);
      if (!have) vehicles.set(k, { name, number });
      else if (!have.name && name) have.name = name;
    }
  }
  return {
    drivers: registerKey === "AUTO_IN_OUT" ? [...drivers.values()].slice(0, VEHICLE_OPTION_CAP) : [],
    vehicles: [...vehicles.values()].slice(0, VEHICLE_OPTION_CAP),
    purposes: [...purposes.values()].slice(0, VEHICLE_OPTION_CAP),
    people: [],
  };
}

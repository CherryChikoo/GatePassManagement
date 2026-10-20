"use server";

/**
 * Security Attendance Register as a monthly sheet (like the paper book):
 * staff × days, one mark per cell, plus a remarks note for each day.
 *
 * Rules
 * - Head Security (and the Main Admin) take attendance; the Security
 *   Supervisor and Main Admin can view; other Security accounts can't see it.
 * - Head Security marks and changes attendance for 2 days: today and
 *   yesterday. Older days are locked (only the Main Admin can correct
 *   them). Future days can't be marked.
 * - A day's remarks can be written / changed for the same 2 days, by anyone
 *   who takes attendance. After that they are read-only for everyone.
 * - Nothing is overwritten: a change is saved as a correction on the day's
 *   record, so the history of who marked what stays.
 *
 * Stored as register entries (no extra tables): marks under the attendance
 * register, day remarks and staff ranks under their own keys.
 */

import { randomUUID } from "crypto";
import { notifyLive } from "@/lib/realtime/notify";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, type AuthUser } from "@/lib/auth/helpers";
import { REGISTER_BY_KEY, type EntryRegister } from "@/lib/registers/definitions";
import { buildSearchText, effectiveData, type RegisterData } from "@/lib/registers/validate";
import { istDateString, istDateToInstant } from "@/lib/time/ist";

const ATTENDANCE = "SECURITY_ATTENDANCE";
const REMARK_KEY = "ATTENDANCE_REMARK";
const RANK_KEY = "SECURITY_RANK";
const DAY_MS = 86_400_000;

/** Marks on the sheet (stored as the register's Attendance Status values) */
const STATUSES = ["Present", "Absent", "On Leave", "Half Day", "Double Duty", "Late"] as const;
type Status = (typeof STATUSES)[number];

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const attendanceDef = () => REGISTER_BY_KEY[ATTENDANCE as keyof typeof REGISTER_BY_KEY] as EntryRegister;

/**
 * Who is asking, what they may do, and the "recorded by" details — from one
 * lookup (same rules as lib/registers/access.ts: Head Security and the Main
 * Admin take attendance; the Supervisor views; other Security can't see it).
 */
async function access() {
  const user = await requireRole("SECURITY", "ADMIN", "SECURITY_SUPERVISOR");
  const me =
    user.role === "SECURITY"
      ? await prisma.securityStaff.findUnique({
          where: { profileId: user.profileId },
          select: { isHead: true, employeeId: true, gate: { select: { name: true } } },
        })
      : null;
  const isHead = !!me?.isHead;
  return {
    user,
    canView: user.role === "ADMIN" || user.role === "SECURITY_SUPERVISOR" || isHead,
    canMark: user.role === "ADMIN" || isHead,
    who: {
      recordedById: user.profileId,
      recordedByName: user.name,
      recordedByRole: user.role,
      recordedByEmployeeId: me?.employeeId ?? null,
      recordedAtGate: me?.gate?.name ?? null,
    },
  };
}

// No revalidatePath here: the sheet loads its own data, so rebuilding the
// registers pages on the server after every tap would only slow marking down.

/** Can this user change marks on `date`? (today only; past days for the Main Admin) */
/** First day Head Security may still change: yesterday (a 2-day window) */
function editableFrom(): string {
  return istDateString(new Date(Date.now() - DAY_MS));
}

/** Can this user change marks on `date`? (today and yesterday; any past day for the Main Admin) */
function markableDay(user: AuthUser, date: string): string | null {
  const today = istDateString();
  if (date > today) return "Future days can't be marked";
  if (date < editableFrom() && user.role !== "ADMIN") {
    return "Only today and yesterday can be changed. Older days are locked; only the Main Admin can correct them.";
  }
  return null;
}

// ─── Read ──────────────────────────────────────────────────────

export async function getAttendanceMonth(month?: string) {
  const { user, canView, canMark } = await access();
  if (!canView) return { error: "You do not have access to this register" };

  const today = istDateString();
  const m = MONTH_RE.exec(month ?? "") ?? MONTH_RE.exec(today.slice(0, 7))!;
  const year = +m[1];
  const mon = +m[2];
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const first = `${m[1]}-${m[2]}-01`;
  const start = istDateToInstant(first);
  const end = new Date(start.getTime() + daysInMonth * DAY_MS);

  const recorderSel = { recordedByName: true, createdAt: true } as const;
  const [staff, entries, remarks, ranks] = await Promise.all([
    prisma.securityStaff.findMany({
      select: { id: true, employeeId: true, isHead: true, profile: { select: { name: true, active: true } } },
    }),
    prisma.registerEntry.findMany({
      where: { register: ATTENDANCE, kind: "ORIGINAL", entryDate: { gte: start, lt: end } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, entryDate: true, data: true, ...recorderSel,
        supplements: { orderBy: { createdAt: "asc" }, select: { kind: true, data: true, ...recorderSel } },
      },
    }),
    prisma.registerEntry.findMany({
      where: { register: REMARK_KEY, kind: "ORIGINAL", entryDate: { gte: start, lt: end } },
      select: {
        entryDate: true, data: true, ...recorderSel,
        supplements: { orderBy: { createdAt: "asc" }, select: { kind: true, data: true, ...recorderSel } },
      },
    }),
    prisma.registerEntry.findMany({
      where: { register: RANK_KEY, kind: "ORIGINAL" },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { data: true },
    }),
  ]);

  // Latest rank per staff member
  const rankOf = new Map<string, string>();
  for (const r of ranks) {
    const d = (r.data ?? {}) as { staffId?: string; rank?: string };
    if (d.staffId && !rankOf.has(d.staffId)) rankOf.set(d.staffId, d.rank ?? "");
  }

  // Cells: staffId → day → mark (latest record of the day wins)
  const def = attendanceDef();
  const cells: Record<string, Record<number, { mark: string | null; by: string; at: string }>> = {};
  const seenStaff = new Set<string>();
  for (const e of entries) {
    const current = effectiveData(def, e.data as RegisterData, e.supplements);
    const s = current.staff as { id?: string } | null;
    if (!s?.id) continue;
    seenStaff.add(s.id);
    const last = e.supplements[e.supplements.length - 1] ?? e;
    const day = +istDateString(e.entryDate).slice(8, 10);
    (cells[s.id] ??= {})[day] = {
      mark: typeof current.attendanceStatus === "string" ? current.attendanceStatus : null,
      by: last.recordedByName,
      at: last.createdAt.toISOString(),
    };
    // A rank typed on an old form entry, if none is set on the sheet
    if (!rankOf.has(s.id) && typeof current.rank === "string" && current.rank) rankOf.set(s.id, current.rank);
  }

  const dayRemarks: Record<number, { text: string; by: string; at: string }> = {};
  for (const r of remarks) {
    const last = r.supplements[r.supplements.length - 1] ?? r;
    const d = (last.data ?? r.data ?? {}) as { remarks?: string };
    if (!d.remarks) continue;
    dayRemarks[+istDateString(r.entryDate).slice(8, 10)] = { text: d.remarks, by: last.recordedByName, at: last.createdAt.toISOString() };
  }

  // Rows: active staff, plus anyone marked this month (even if disabled since)
  const RANK_ORDER = ["SUP", "H.G", "S.G"];
  const rows = staff
    .filter((s) => s.profile.active || seenStaff.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.profile.name,
      employeeId: s.employeeId,
      rank: rankOf.get(s.id) || (s.isHead ? "H.G" : "S.G"),
    }))
    .sort((a, b) => {
      const ra = RANK_ORDER.indexOf(a.rank);
      const rb = RANK_ORDER.indexOf(b.rank);
      return (ra === -1 ? 9 : ra) - (rb === -1 ? 9 : rb) || a.name.localeCompare(b.name);
    });

  return {
    success: true,
    month: `${m[1]}-${m[2]}`,
    daysInMonth,
    today,
    /** Head Security can change marks and remarks from this day (yesterday) */
    editableFrom: editableFrom(),
    rows,
    cells,
    remarks: dayRemarks,
    canMark,
    isAdmin: user.role === "ADMIN",
  };
}

// ─── Marks ─────────────────────────────────────────────────────

/**
 * Set (or clear, with null) one staff member's mark for a day. Returns the
 * saved cell so the sheet can show it without reloading the month.
 *
 * Fast path (2 database trips after sign-in): the checks and lookups run
 * together, then one insert. The day's first record has a fixed token per
 * person and day, so two taps at once can't create two records (the second
 * becomes a correction instead).
 */
export async function setAttendanceMark(staffId: string, date: string, status: string | null) {
  if (typeof staffId !== "string" || !/^[0-9a-f-]{36}$/i.test(staffId)) return { error: "Staff member not found" };
  if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "Choose a valid date" };
  if (status !== null && !STATUSES.includes(status as Status)) return { error: "Choose a valid mark" };

  const dayStart = istDateToInstant(date);
  const findExisting = () =>
    prisma.registerEntry.findFirst({
      where: {
        register: ATTENDANCE,
        kind: "ORIGINAL",
        entryDate: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) },
        data: { path: ["staff", "id"], equals: staffId },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, data: true, supplements: { select: { kind: true, data: true, createdAt: true } } },
    });

  const [ctx, staff, existing] = await Promise.all([
    access(),
    prisma.securityStaff.findUnique({
      where: { id: staffId },
      select: { id: true, employeeId: true, profile: { select: { name: true } } },
    }),
    findExisting(),
  ]);
  const { user, canMark, who } = ctx;
  if (!canMark) return { error: "Only Head Security or the Main Admin can take attendance" };
  const locked = markableDay(user, date);
  if (locked) return { error: locked };
  if (!staff) return { error: "Staff member not found" };

  const def = attendanceDef();
  const saved = { mark: status, by: user.name, at: new Date().toISOString() };


  const addCorrection = async (entry: NonNullable<Awaited<ReturnType<typeof findExisting>>>) => {
    const current = effectiveData(def, entry.data as RegisterData, entry.supplements);
    if ((current.attendanceStatus ?? null) === status) return;
    const data: RegisterData = { ...current, attendanceStatus: status };
    await prisma.registerEntry.create({
      data: {
        register: ATTENDANCE,
        kind: "CORRECTION",
        parentId: entry.id,
        entryDate: dayStart,
        data: data as Prisma.InputJsonValue,
        searchText: buildSearchText(def, data),
        reason: date >= editableFrom() ? "Changed within 2 days" : "Corrected by the Main Admin",
        clientToken: randomUUID(),
        ...who,
      },
    });
  };

  try {
    if (existing) {
      await addCorrection(existing);
      notifyLive("attendance");
      return { success: true, cell: saved };
    }
    if (status === null) {
      notifyLive("attendance");
      return { success: true, cell: saved };
    }
    const data: RegisterData = {
      date,
      staff: { id: staff.id, name: staff.profile.name, employeeId: staff.employeeId },
      attendanceStatus: status,
    };
    try {
      await prisma.registerEntry.create({
        data: {
          register: ATTENDANCE,
          kind: "ORIGINAL",
          entryDate: dayStart,
          data: data as Prisma.InputJsonValue,
          searchText: buildSearchText(def, data),
          // One first record per person per day (shared with "Mark all present")
          clientToken: `att-${staffId}-${date}`,
          ...who,
        },
      });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
      // Someone marked this person a moment ago: record this as a change
      const now = await findExisting();
      if (now) await addCorrection(now);
    }
    notifyLive("attendance");
    return { success: true, cell: saved };
  } catch (err: any) {
    console.error("[setAttendanceMark] failed:", err?.message);
    return { error: "Could not save. Please try again." };
  }
}

/** Today: mark every active staff member who has no mark yet as Present. */
export async function markAllPresent(date: string) {
  const { user, canMark, who } = await access();
  if (!canMark) return { error: "Only Head Security or the Main Admin can take attendance" };
  if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "Choose a valid date" };
  const locked = markableDay(user, date);
  if (locked) return { error: locked };

  const dayStart = istDateToInstant(date);
  const [staff, existing] = await Promise.all([
    prisma.securityStaff.findMany({
      where: { profile: { active: true } },
      select: { id: true, employeeId: true, profile: { select: { name: true } } },
    }),
    prisma.registerEntry.findMany({
      where: { register: ATTENDANCE, kind: "ORIGINAL", entryDate: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) } },
      select: { data: true },
    }),
  ]);
  const marked = new Set(existing.map((e) => ((e.data ?? {}) as { staff?: { id?: string } }).staff?.id).filter(Boolean));
  const todo = staff.filter((s) => !marked.has(s.id));
  if (todo.length === 0) return { success: true, marked: 0 };

  const def = attendanceDef();
  await prisma.registerEntry.createMany({
    data: todo.map((s) => {
      const data: RegisterData = { date, staff: { id: s.id, name: s.profile.name, employeeId: s.employeeId }, attendanceStatus: "Present" };
      return {
        register: ATTENDANCE,
        kind: "ORIGINAL",
        entryDate: dayStart,
        data: data as Prisma.InputJsonValue,
        searchText: buildSearchText(def, data),
        // One "all present" per person per day: a double tap can't add twice
        clientToken: `att-${s.id}-${date}`,
        ...who,
      };
    }),
    skipDuplicates: true,
  });
  notifyLive("attendance");
  return { success: true, marked: todo.length };
}

// ─── Day remarks ───────────────────────────────────────────────

/** Remarks for a day: written or changed only on that day; read-only afterwards. */
export async function saveAttendanceRemark(date: string, remarks: string) {
  const { user, canMark, who } = await access();
  if (!canMark) return { error: "Only Head Security or the Main Admin can write remarks" };
  if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "Choose a valid date" };
  if (date > istDateString()) return { error: "Future days can't be marked" };
  // Head Security: today and yesterday. The Main Admin: any day.
  if (date < editableFrom() && user.role !== "ADMIN") {
    return { error: "Remarks can be written only for today and yesterday. Older days are locked." };
  }
  const text = typeof remarks === "string" ? remarks.trim().slice(0, 1000) : "";

  const dayStart = istDateToInstant(date);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attendance-remark:${date}`}))`;
    const existing = await tx.registerEntry.findFirst({
      where: { register: REMARK_KEY, kind: "ORIGINAL", entryDate: dayStart },
      select: { id: true },
    });
    const data = { date, remarks: text } as Prisma.InputJsonValue;
    if (!existing) {
      if (!text) return;
      await tx.registerEntry.create({
        data: { register: REMARK_KEY, kind: "ORIGINAL", entryDate: dayStart, data, searchText: text.toLowerCase(), clientToken: randomUUID(), ...who },
      });
    } else {
      await tx.registerEntry.create({
        data: {
          register: REMARK_KEY, kind: "CORRECTION", parentId: existing.id, entryDate: dayStart, data,
          searchText: text.toLowerCase(), clientToken: randomUUID(), ...who,
        },
      });
    }
  });
  notifyLive("attendance");
  return { success: true };
}

// ─── Rank ──────────────────────────────────────────────────────

/** Rank shown on the sheet (SUP / H.G / S.G or any other). */
export async function setStaffRank(staffId: string, rank: string) {
  const { canMark, who } = await access();
  if (!canMark) return { error: "Only Head Security or the Main Admin can change ranks" };
  if (typeof staffId !== "string" || !/^[0-9a-f-]{36}$/i.test(staffId)) return { error: "Staff member not found" };
  const value = typeof rank === "string" ? rank.trim().slice(0, 20) : "";
  if (!value) return { error: "Enter the rank" };
  const staff = await prisma.securityStaff.findUnique({ where: { id: staffId }, select: { id: true } });
  if (!staff) return { error: "Staff member not found" };
  await prisma.registerEntry.create({
    data: {
      register: RANK_KEY,
      kind: "ORIGINAL",
      entryDate: istDateToInstant(istDateString()),
      data: { staffId, rank: value },
      searchText: value.toLowerCase(),
      clientToken: randomUUID(),
      ...who,
    },
  });
  notifyLive("attendance");
  return { success: true };
}

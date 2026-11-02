"use server";

/**
 * Security Daily Book as a duty plan: which security staff work shift A, B
 * or C on a date (today or later), set by Head Security.
 *
 * Rules
 * - Head Security and the Main Admin plan duties; the Supervisor views;
 *   other Security accounts can't see it (same as Staff Attendance).
 * - Only today and later dates can be changed; past days are read-only.
 * - One person can be in more than one shift on a day (overtime).
 * - Each assignment is one small register entry (date + shift + person).
 *   Removing one deletes it and leaves a line in the duty log (who / when).
 *
 * Free plan: opening a date is one small read (that day's rows, the staff
 * list and their ranks); adding / removing is one tiny write plus a live ping.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { notifyLive } from "@/lib/realtime/notify";
import { istDateString, istDateToInstant } from "@/lib/time/ist";

const DUTY_KEY = "SECURITY_DUTY";
const DUTY_LOG_KEY = "SECURITY_DUTY_LOG";
/** A remarks note for a day (each save is kept; the newest is shown) */
const DUTY_REMARK_KEY = "SECURITY_DUTY_REMARK";
const RANK_KEY = "SECURITY_RANK";
const LIVE_TOPIC = "reg:SECURITY_DAILY";
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[0-9a-f-]{36}$/i;
const SHIFTS = ["A", "B", "C"] as const;
type Shift = (typeof SHIFTS)[number];

/** Start / End taps are saved as records linked to the duty (never changed) */
type Tap = { data: unknown; createdAt: Date };
function dutyTimes(taps: Tap[]) {
  const at = (action: string) => taps.find((x) => (x.data as { action?: string } | null)?.action === action)?.createdAt.toISOString() ?? null;
  return { startedAt: at("start"), endedAt: at("end") };
}
const tapSelect = { where: { kind: "COMPLETION" }, orderBy: { createdAt: "asc" as const }, select: { data: true, createdAt: true } };
/** Ranks first in this order, then the rest by name */
const RANK_ORDER = ["SUP", "H.G", "S.G"];

/** Who is asking and what they may do (same rules as Staff Attendance). */
async function dutyAccess() {
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
    canView: user.role === "ADMIN" || user.role === "SECURITY_SUPERVISOR" || isHead,
    canPlan: user.role === "ADMIN" || isHead,
    who: {
      recordedById: user.profileId,
      recordedByName: user.name,
      recordedByRole: user.role,
      recordedByEmployeeId: me?.employeeId ?? null,
      recordedAtGate: me?.gate?.name ?? null,
    },
  };
}

const dayStart = (date: string) => istDateToInstant(date);

/** One date: the people in each shift, plus every active staff member (with rank) for "Add security". */
export async function getSecurityDutyDay(date?: string) {
  const today = istDateString();
  const day = typeof date === "string" && DATE_RE.test(date) ? date : today;
  const start = dayStart(day);

  // Who is asking and the three reads at the same time (one wait); nothing is returned unless allowed
  const [{ canView, canPlan }, rows, staff, ranks, remark] = await Promise.all([
    dutyAccess(),
    prisma.registerEntry.findMany({
      where: { register: DUTY_KEY, kind: "ORIGINAL", entryDate: { gte: start, lt: new Date(start.getTime() + DAY_MS) } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { id: true, data: true, supplements: tapSelect },
    }),
    prisma.securityStaff.findMany({
      select: { id: true, isHead: true, profile: { select: { name: true, active: true } } },
      take: 1000,
    }),
    prisma.registerEntry.findMany({
      where: { register: RANK_KEY, kind: "ORIGINAL" },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { data: true },
    }),
    prisma.registerEntry.findFirst({
      where: { register: DUTY_REMARK_KEY, kind: "ORIGINAL", entryDate: { gte: start, lt: new Date(start.getTime() + DAY_MS) } },
      orderBy: { createdAt: "desc" },
      select: { data: true, recordedByName: true, createdAt: true },
    }),
  ]);
  if (!canView) return { error: "Only Head Security can see the duty plan" };

  // Latest rank per staff member (set on the Staff Attendance sheet)
  const rankOf = new Map<string, string>();
  for (const r of ranks) {
    const d = (r.data ?? {}) as { staffId?: string; rank?: string };
    if (d.staffId && !rankOf.has(d.staffId)) rankOf.set(d.staffId, d.rank ?? "");
  }
  const byId = new Map(staff.map((s) => [s.id, s]));
  const rank = (id: string) => rankOf.get(id) || (byId.get(id)?.isHead ? "H.G" : "S.G");
  const order = (a: { name: string; rank: string }, b: { name: string; rank: string }) => {
    const ra = RANK_ORDER.indexOf(a.rank);
    const rb = RANK_ORDER.indexOf(b.rank);
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || a.name.localeCompare(b.name);
  };

  const duties = rows
    .map((r) => {
      const d = (r.data ?? {}) as { shift?: string; staffId?: string; staffName?: string };
      if (!d.staffId || !SHIFTS.includes(d.shift as Shift)) return null;
      return {
        id: r.id,
        shift: d.shift as Shift,
        staffId: d.staffId,
        name: byId.get(d.staffId)?.profile.name ?? d.staffName ?? "—",
        rank: rank(d.staffId),
        ...dutyTimes(r.supplements),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort(order);

  return {
    success: true,
    date: day,
    today,
    editable: canPlan && day >= today,
    duties,
    remark: remark
      ? { text: String((remark.data as { text?: string } | null)?.text ?? ""), by: remark.recordedByName ?? "", at: remark.createdAt.toISOString() }
      : null,
    staff: staff
      .filter((s) => s.profile.active)
      .map((s) => ({ id: s.id, name: s.profile.name, rank: rank(s.id) }))
      .sort(order),
  };
}

/** Put a person in a shift on a date (today or later). */
export async function addSecurityDuty(input: { date: string; shift: string; staffId: string }, _clientToken?: string) {
  const date = typeof input?.date === "string" && DATE_RE.test(input.date) ? input.date : null;
  if (!date) return { error: "Choose the date" };
  if (date < istDateString()) return { error: "Past days can't be changed" };
  const shift = SHIFTS.includes(input?.shift as Shift) ? (input.shift as Shift) : null;
  if (!shift) return { error: "Choose the shift" };
  if (typeof input?.staffId !== "string" || !ID_RE.test(input.staffId)) return { error: "Staff member not found" };

  // Two lookups at the same time (one wait instead of two)
  const [{ canPlan, who }, staff] = await Promise.all([
    dutyAccess(),
    prisma.securityStaff.findUnique({
      where: { id: input.staffId },
      select: { id: true, profile: { select: { name: true, active: true } } },
    }),
  ]);
  if (!canPlan) return { error: "Only Head Security or the Main Admin can change the duty plan" };
  if (!staff || !staff.profile.active) return { error: "Staff member not found" };

  try {
    await prisma.registerEntry.create({
      data: {
        register: DUTY_KEY,
        kind: "ORIGINAL",
        entryDate: dayStart(date),
        data: { shift, staffId: staff.id, staffName: staff.profile.name },
        searchText: `${staff.profile.name} ${shift}`.toLowerCase().slice(0, 500),
        // One record per date + shift + person: a second add is refused by the database
        clientToken: `duty-${date}-${shift}-${staff.id}`,
        ...who,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true, duplicate: true };
    console.error("[addSecurityDuty] failed:", err?.message);
    return { error: "Could not save. Please try again." };
  }
  notifyLive(LIVE_TOPIC);
  return { success: true };
}

/** Take a person off a shift (today or later); the removal is kept in the duty log. */
export async function removeSecurityDuty(id: string) {
  if (typeof id !== "string" || !ID_RE.test(id)) return { error: "Not found" };
  const [{ canPlan, who }, row] = await Promise.all([
    dutyAccess(),
    prisma.registerEntry.findFirst({
      where: { id, register: DUTY_KEY },
      select: { id: true, entryDate: true, data: true, _count: { select: { supplements: true } } },
    }),
  ]);
  if (!canPlan) return { error: "Only Head Security or the Main Admin can change the duty plan" };
  if (!row) return { success: true };
  if (row._count.supplements > 0) return { error: "This person has already started this duty, so it can't be removed" };
  if (istDateString(row.entryDate) < istDateString()) return { error: "Past days can't be changed" };

  await prisma.$transaction([
    prisma.registerEntry.create({
      data: {
        register: DUTY_LOG_KEY,
        kind: "ORIGINAL",
        entryDate: row.entryDate,
        data: { action: "removed", ...((row.data ?? {}) as object) },
        searchText: "removed",
        clientToken: randomUUID(),
        ...who,
      },
    }),
    prisma.registerEntry.delete({ where: { id: row.id } }),
  ]);
  notifyLive(LIVE_TOPIC);
  return { success: true };
}

/** Write / change the remarks for a day (today or later); an empty text clears them. */
export async function saveSecurityDutyRemark(date: string, text: string) {
  const day = typeof date === "string" && DATE_RE.test(date) ? date : null;
  if (!day) return { error: "Choose the date" };
  if (day < istDateString()) return { error: "Past days can't be changed" };
  const value = typeof text === "string" ? text.trim() : "";
  if (value.length > 1000) return { error: "Keep the remarks under 1000 characters" };
  const { canPlan, who } = await dutyAccess();
  if (!canPlan) return { error: "Only Head Security or the Main Admin can change the duty plan" };
  await prisma.registerEntry.create({
    data: {
      register: DUTY_REMARK_KEY,
      kind: "ORIGINAL",
      entryDate: dayStart(day),
      data: { text: value },
      searchText: value.toLowerCase().slice(0, 500),
      clientToken: randomUUID(),
      ...who,
    },
  });
  notifyLive(LIVE_TOPIC);
  return { success: true };
}

// ─── My shift details (every security guard) ────────────────────────

/** profile → security staff id (never changes for an account): saves one database wait per open */
const staffIdCache = new Map<string, { id: string | null; at: number }>();
async function myStaffId(profileId: string): Promise<string | null> {
  const hit = staffIdCache.get(profileId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.id;
  const me = await prisma.securityStaff.findUnique({ where: { profileId }, select: { id: true } });
  if (staffIdCache.size > 500) staffIdCache.clear();
  staffIdCache.set(profileId, { id: me?.id ?? null, at: Date.now() });
  return me?.id ?? null;
}

/** This guard's duties: yesterday (a night shift may still be open) to 7 days ahead, with the day's remarks. */
export async function getMyDuties() {
  const user = await requireRole("SECURITY");
  const today = istDateString();
  const from = istDateString(new Date(dayStart(today).getTime() - DAY_MS + 12 * 3_600_000));
  const start = dayStart(from);
  const end = new Date(dayStart(today).getTime() + 8 * DAY_MS);

  // My staff id (usually remembered) and the remarks at the same time; then my duties
  const [meId, remarks] = await Promise.all([
    myStaffId(user.profileId),
    prisma.registerEntry.findMany({
      where: { register: DUTY_REMARK_KEY, kind: "ORIGINAL", entryDate: { gte: start, lt: end } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { entryDate: true, data: true },
    }),
  ]);
  if (!meId) return { error: "Your security staff record was not found" };
  const rows = await prisma.registerEntry.findMany({
    where: { register: DUTY_KEY, kind: "ORIGINAL", entryDate: { gte: start, lt: end }, data: { path: ["staffId"], equals: meId } },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
    take: 50,
    select: { id: true, entryDate: true, data: true, supplements: tapSelect },
  });

  const remarkOn = new Map<string, string>();
  for (const r of remarks) {
    const d = istDateString(r.entryDate);
    if (!remarkOn.has(d)) remarkOn.set(d, String((r.data as { text?: string } | null)?.text ?? ""));
  }
  const duties = rows
    .map((r) => {
      const date = istDateString(r.entryDate);
      const shift = String((r.data as { shift?: string } | null)?.shift ?? "");
      const times = dutyTimes(r.supplements);
      return { id: r.id, date, shift, ...times, remark: remarkOn.get(date) || null };
    })
    // Yesterday's only while it is still open (started, not ended)
    .filter((d) => d.date >= today || (d.startedAt && !d.endedAt))
    .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift));
  return { success: true, today, duties };
}

/** Start or end my own duty. Start: on its date only. End: after Start. Times are the server's clock. */
export async function tapMyDuty(id: string, action: "start" | "end") {
  if (typeof id !== "string" || !ID_RE.test(id)) return { error: "Duty not found" };
  if (action !== "start" && action !== "end") return { error: "Duty not found" };
  const user = await requireRole("SECURITY");
  const [me, row] = await Promise.all([
    prisma.securityStaff.findUnique({
      where: { profileId: user.profileId },
      select: { id: true, employeeId: true, gate: { select: { name: true } } },
    }),
    prisma.registerEntry.findFirst({
      where: { id, register: DUTY_KEY, kind: "ORIGINAL" },
      select: { id: true, entryDate: true, data: true, supplements: tapSelect },
    }),
  ]);
  if (!me || !row || (row.data as { staffId?: string } | null)?.staffId !== me.id) return { error: "Duty not found" };
  const { startedAt, endedAt } = dutyTimes(row.supplements);
  if (action === "start") {
    if (startedAt) return { success: true, duplicate: true };
    if (istDateString(row.entryDate) !== istDateString()) return { error: "You can start this duty only on its date" };
  } else {
    if (!startedAt) return { error: "Start the duty first" };
    if (endedAt) return { success: true, duplicate: true };
  }
  try {
    await prisma.registerEntry.create({
      data: {
        register: DUTY_KEY,
        kind: "COMPLETION",
        parentId: row.id,
        entryDate: row.entryDate,
        data: { action },
        searchText: action,
        // One Start and one End per duty: a double tap is refused by the database
        clientToken: `duty-${action}-${row.id}`,
        recordedById: user.profileId,
        recordedByName: user.name,
        recordedByRole: user.role,
        recordedByEmployeeId: me.employeeId ?? null,
        recordedAtGate: me.gate?.name ?? null,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") return { success: true, duplicate: true };
    console.error("[tapMyDuty] failed:", err?.message);
    return { error: "Could not save. Please try again." };
  }
  notifyLive(LIVE_TOPIC);
  return { success: true };
}

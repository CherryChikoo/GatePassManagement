/**
 * One page of an entry register's records (server-side only).
 *
 * Shared by the `listRegisterEntries` server action and the GET route
 * /api/registers/entries. The screens load lists through the route: server
 * actions are queued one at a time in the browser, so a list fetched that way
 * waits behind every other action (staff list, a save…), while plain GET
 * requests run in parallel and can be prefetched.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth/helpers";
import { getRegisterAccess } from "./access";
import { MAX_CODE_TRIES, canOverrideVisitExit } from "@/lib/visits/passes";
import { getEntryRegister } from "./catalog";
import { pendingActions, type EntryRegister } from "./definitions";
import { effectiveData, type RegisterData } from "./validate";
import { istDateString, istDayRangeFromParam, parseDateParam, parsePageParam } from "@/lib/time/ist";

export const REGISTER_PAGE_SIZE = 25;
const PAGE_SIZE = REGISTER_PAGE_SIZE;

/** Roles that can open the registers */
export const REGISTER_VIEW_ROLES = ["SECURITY", "ADMIN", "SECURITY_SUPERVISOR", "ESTATE_MANAGER"] as const;

/** IST day range for a "YYYY-MM-DD" filter; null for "all" (no date filter). */
export function registerDayFilter(date?: string | null) {
  if (!date || date === "all") return null;
  const d = parseDateParam(date);
  return d ? istDayRangeFromParam(d) : istDayRangeFromParam(istDateString());
}

/** Value of the "Shift" filter: one of the register's shifts, or "OTHER" (any typed shift). */
const SHIFT_FILTER_OTHER = "OTHER";

export type RegisterListParams = { register: string; date?: string; q?: string; page?: number; shift?: string };

export async function queryRegisterEntries(user: AuthUser, params: RegisterListParams) {
  // Register lookup and access check run together (one database trip, not two)
  const [def, access] = await Promise.all([getEntryRegister(params?.register), getRegisterAccess(user)]);
  if (!def) return { error: "Unknown register" };
  if (!access.canView(def.key)) return { error: "You do not have access to this register" };

  const page = parsePageParam(String(params.page ?? 1));
  const range = registerDayFilter(params.date);
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase().slice(0, 100) : "";

  // Shift filter (registers with a Shift field): matches the saved value, or an admin correction of it
  const shiftField = def.fields.find((f) => f.key === "shift" && f.type === "select");
  const shiftOptions = (shiftField?.options ?? []) as readonly string[];
  const shift = typeof params.shift === "string" ? params.shift : "";
  const shiftIs = (v: string): Prisma.RegisterEntryWhereInput => ({
    OR: [
      { data: { path: ["shift"], equals: v } },
      { supplements: { some: { kind: "CORRECTION", data: { path: ["shift"], equals: v } } } },
    ],
  });
  const shiftWhere: Prisma.RegisterEntryWhereInput | null = !shiftField
    ? null
    : shiftOptions.includes(shift)
    ? shiftIs(shift)
    : shift === SHIFT_FILTER_OTHER
    ? { AND: shiftOptions.map((o) => ({ NOT: { data: { path: ["shift"], equals: o } } })) }
    : null;

  const where: Prisma.RegisterEntryWhereInput = {
    register: def.key,
    kind: "ORIGINAL",
    ...(range ? { entryDate: { gte: range.start, lt: range.end } } : {}),
    ...(shiftWhere ? { AND: [shiftWhere] } : {}),
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

  const select = entrySelect(def);

  const findRows = () =>
    prisma.registerEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select,
    });
  // Rows, total and the override check together: one wait (a busy day no longer waits for the count after the rows)
  const [rows, total, canOverrideVisit] = await Promise.all([
    findRows(),
    prisma.registerEntry.count({ where }),
    def.visitHost ? canOverrideVisitExit(user) : Promise.resolve(false),
  ]);

  return {
    success: true as const,
    page,
    pageSize: PAGE_SIZE,
    total,
    /** May this user let a visitor out without the meeting code (Head Security / Main Admin) */
    canOverrideVisit,
    entries: rows.map((r) => toListEntry(def, r)),
  };
}

const RECORDER = {
  recordedByName: true, recordedByRole: true, recordedByEmployeeId: true, recordedAtGate: true, createdAt: true,
} as const;

/** What a register list sends for each record */
function entrySelect(def: EntryRegister) {
  return {
    id: true, data: true, entryDate: true, ...RECORDER,
    supplements: {
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, data: true, reason: true, ...RECORDER },
    },
    // Meeting a faculty / staff member (never the code itself)
    ...(def.visitHost
      ? { visitPass: { select: { hostName: true, status: true, attempts: true, exitMethod: true, overrideReason: true, exitedByName: true } } }
      : {}),
  } satisfies Prisma.RegisterEntrySelect;
}

type Recorded = { recordedByName: string; recordedByRole: string; recordedByEmployeeId: string | null; recordedAtGate: string | null; createdAt: Date };
type ListRow = Recorded & {
  id: string;
  data: Prisma.JsonValue;
  entryDate: Date;
  supplements: (Recorded & { id: string; kind: string; data: Prisma.JsonValue; reason: string | null })[];
  visitPass?: { hostName: string; status: string; attempts: number; exitMethod: string | null; overrideReason: string | null; exitedByName: string | null } | null;
};

/** One record as the register screens show it */
function toListEntry(def: EntryRegister, r: ListRow) {
  const v = r.visitPass;
  return {
    id: r.id,
    entryDate: istDateString(r.entryDate),
    createdAt: r.createdAt.toISOString(),
    recordedByName: r.recordedByName,
    recordedByRole: r.recordedByRole,
    recordedByEmployeeId: r.recordedByEmployeeId,
    recordedAtGate: r.recordedAtGate,
    original: r.data as RegisterData,
    visit: v
      ? { hostName: v.hostName, open: v.status !== "EXITED", met: v.status === "MET", locked: v.attempts >= MAX_CODE_TRIES, exitMethod: v.exitMethod, overrideReason: v.overrideReason, exitedByName: v.exitedByName }
      : null,
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
  };
}

// ─── "Inside now" (Admission Book buttons) ───────────────────────────────────

/** Records per page on the Inside now screen */
export const INSIDE_PAGE_SIZE = 20;
/** Safety limit on the records checked (two days of one register) */
const INSIDE_MAX_CHECKED = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Came in and Out is still to be recorded (the register's own Record Out rule) */
export function isStillInside(def: EntryRegister, current: Record<string, unknown>) {
  return pendingActions(def, current).next?.direction === "OUT";
}

/**
 * One page (newest first) of an In / Out register's records from today and
 * yesterday whose Out is not recorded yet (someone let in late in the evening
 * must not vanish at midnight), with how many there are in all. Only the page
 * is sent to the phone.
 */
export async function queryInsideRegisterEntries(user: AuthUser, params: { register: string; page?: number }) {
  const [def, access] = await Promise.all([getEntryRegister(params?.register), getRegisterAccess(user)]);
  if (!def) return { error: "Unknown register" };
  if (!access.canView(def.key)) return { error: "You do not have access to this register" };
  const m = def.movement;
  const requested = parsePageParam(String(params?.page ?? 1));
  const empty = { success: true as const, page: 1, pageSize: INSIDE_PAGE_SIZE, total: 0, canOverrideVisit: false, entries: [] as ReturnType<typeof toListEntry>[] };
  if (!m || m.single) return empty;

  const today = istDayRangeFromParam(istDateString());
  const outKey = m.out.timeKey;
  // Step 1 (light): every record of the two days that may still be inside —
  // records whose Out (or "close") was saved later are left out by the database
  const [candidates, canOverrideVisit] = await Promise.all([
    prisma.registerEntry.findMany({
      where: {
        register: def.key,
        kind: "ORIGINAL",
        entryDate: { gte: new Date(today.start.getTime() - DAY_MS), lt: today.end },
        NOT: {
          supplements: {
            some: {
              kind: "COMPLETION",
              OR: [{ data: { path: [outKey], string_contains: ":" } }, { data: { path: ["oneWay"], equals: true } }],
            },
          },
        },
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: INSIDE_MAX_CHECKED,
      select: { id: true, data: true, supplements: { select: { kind: true, data: true, createdAt: true } } },
    }),
    def.visitHost ? canOverrideVisitExit(user) : Promise.resolve(false),
  ]);
  // The exact rule, on what is left (corrections, Out typed in with the record…)
  const insideIds = candidates
    .filter((r) => isStillInside(def, effectiveData(def, r.data as RegisterData, r.supplements)))
    .map((r) => r.id);

  const total = insideIds.length;
  // A page past the end (its last records just went out): the last page instead
  const page = Math.min(requested, Math.max(1, Math.ceil(total / INSIDE_PAGE_SIZE)));
  const ids = insideIds.slice((page - 1) * INSIDE_PAGE_SIZE, page * INSIDE_PAGE_SIZE);
  if (!ids.length) return { ...empty, canOverrideVisit };

  // Step 2: the full records of this page only
  const rows = await prisma.registerEntry.findMany({ where: { id: { in: ids } }, select: entrySelect(def) });
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return {
    success: true as const,
    page,
    pageSize: INSIDE_PAGE_SIZE,
    total,
    canOverrideVisit,
    entries: rows.map((r) => toListEntry(def, r)),
  };
}

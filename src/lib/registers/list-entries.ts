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
import { getEntryRegister } from "./catalog";
import { effectiveData, type RegisterData } from "./validate";
import { istDateString, istDayRangeFromParam, parseDateParam, parsePageParam } from "@/lib/time/ist";

export const REGISTER_PAGE_SIZE = 25;
const PAGE_SIZE = REGISTER_PAGE_SIZE;

/** Roles that can open the registers */
export const REGISTER_VIEW_ROLES = ["SECURITY", "ADMIN", "SECURITY_SUPERVISOR"] as const;

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

  const recorder = {
    recordedByName: true, recordedByRole: true, recordedByEmployeeId: true, recordedAtGate: true, createdAt: true,
  } as const;

  const select = {
    id: true, data: true, entryDate: true, ...recorder,
    supplements: {
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, data: true, reason: true, ...recorder },
    },
  } satisfies Prisma.RegisterEntrySelect;

  const findRows = () =>
    prisma.registerEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select,
    });
  let rows: Awaited<ReturnType<typeof findRows>>;
  let total: number;
  if (page === 1 && range) {
    // One day usually fits on the first page: then the rows give the total and
    // the count query is skipped (one query instead of two)
    rows = await findRows();
    total = rows.length < PAGE_SIZE ? rows.length : await prisma.registerEntry.count({ where });
  } else {
    [rows, total] = await Promise.all([findRows(), prisma.registerEntry.count({ where })]);
  }

  return {
    success: true as const,
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

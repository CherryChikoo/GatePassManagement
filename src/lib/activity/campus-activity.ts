import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { istDateString, istDayRangeFromParam } from "@/lib/time/ist";
import { ACTIVITY_PAGE_SIZE, NEWEST_FIRST, containsText, pageMerged, pageOf, pageSizeOf, textOf, type MergeSource } from "./paged";

/** What the activity screen asks for (all optional; bad values fall back to the defaults) */
export type ActivityPageParams = {
  page?: number;
  pageSize?: number;
  /** Search text (name, roll / ID, department, purpose, destination, gate) */
  q?: string;
  /** "STUDENTS" (default) | "FACULTY" | "ALL" */
  who?: string;
  /** "ALL" (default) | "PENDING" | "ENTRIES" | "EXITS" */
  filter?: string;
};

export type ActivityKind = "student-permission" | "student-movement" | "faculty-permission" | "faculty-movement";
export type ActivityCounts = { all: number; pending: number; entries: number; exits: number };

const ZERO: ActivityCounts = { all: 0, pending: 0, entries: 0, exits: 0 };
const add = (a: ActivityCounts, b: ActivityCounts): ActivityCounts => ({
  all: a.all + b.all,
  pending: a.pending + b.pending,
  entries: a.entries + b.entries,
  exits: a.exits + b.exits,
});

type Group = { type: string; status?: string; _count: { _all: number } };
const countsOf = (groups: Group[]): ActivityCounts =>
  groups.reduce<ActivityCounts>(
    (c, g) => ({
      all: c.all + g._count._all,
      pending: c.pending + (g.status === "PENDING" ? g._count._all : 0),
      entries: c.entries + (g.type === "ENTRY" ? g._count._all : 0),
      exits: c.exits + (g.type === "EXIT" ? g._count._all : 0),
    }),
    ZERO
  );

const movementSelect = {
  id: true,
  type: true,
  createdAt: true,
  notes: true,
  gate: { select: { name: true, location: true } },
} as const;

const permissionFields = {
  id: true, purpose: true, destination: true, exitDate: true, expectedExit: true,
  expectedReturn: true, endDate: true, status: true, createdAt: true, type: true, approverType: true,
  remarks: true, contactNumber: true,
  movements: { select: movementSelect, orderBy: { createdAt: "desc" as const } },
} as const;

const STUDENT_PERMISSION_SELECT = {
  ...permissionFields,
  student: {
    select: {
      studentRoll: true,
      department: true,
      profile: { select: { name: true, email: true, phone: true } },
    },
  },
} as const;

const FACULTY_PERMISSION_SELECT = {
  ...permissionFields,
  faculty: {
    select: {
      id: true, department: true, designation: true, employeeId: true,
      profile: { select: { name: true, email: true, phone: true, role: true } },
    },
  },
} as const;

const FACULTY_MOVEMENT_SELECT = {
  ...movementSelect,
  permissionId: true,
  faculty: { select: { department: true, designation: true, employeeId: true, profile: { select: { name: true } } } },
} as const;

const STUDENT_MOVEMENT_SELECT = {
  ...movementSelect,
  permissionId: true,
  student: { select: { studentRoll: true, department: true, profile: { select: { name: true } } } },
} as const;

/**
 * One page of one IST day's activity: student and faculty passes (created or
 * scheduled that day, plus pending ones when the day is today) and gate scans
 * that are not already shown with their pass — merged newest first, with the
 * day's counts per tab. Search and filters run in the database.
 *
 * - `departments`: only these departments (an HOD); null = the whole campus.
 * - `studentMovements`: also list students' standalone gate scans (campus view).
 *
 * Callers must authorize the user first.
 */
export async function loadActivityPage(
  dateParam: string | undefined,
  params: ActivityPageParams | undefined,
  scope: { departments: string[] | null; studentMovements: boolean }
) {
  // IST calendar day; invalid ?date falls back to today
  const { start: startDate, end: dayEnd, dateStr } = istDayRangeFromParam(dateParam);
  const endDate = new Date(dayEnd.getTime() - 1);
  const isToday = dateStr === istDateString();

  const page = pageOf(params?.page);
  const pageSize = pageSizeOf(params?.pageSize, ACTIVITY_PAGE_SIZE);
  const q = textOf(params?.q);
  const who = params?.who === "FACULTY" || params?.who === "ALL" ? params.who : "STUDENTS";
  const filter = params?.filter === "PENDING" || params?.filter === "ENTRIES" || params?.filter === "EXITS" ? params.filter : "ALL";

  const dateFilter: Prisma.PermissionWhereInput = {
    OR: [
      { createdAt: { gte: startDate, lte: endDate } },
      { exitDate: { gte: startDate, lte: endDate } },
      ...(isToday ? [{ status: "PENDING" as const }] : []),
    ],
  };
  const inDepts = scope.departments ? { department: { in: scope.departments } } : null;
  const has = containsText(q);

  // Base filters (the day + scope) and the search, per kind
  const studentPermWhere: Prisma.PermissionWhereInput = {
    AND: [
      { studentId: { not: null } },
      inDepts ? { student: inDepts } : {},
      dateFilter,
      q
        ? {
            OR: [
              { student: { profile: { name: has } } },
              { student: { studentRoll: has } },
              { student: { department: has } },
              { purpose: has },
              { destination: has },
            ],
          }
        : {},
    ],
  };
  const facultyPermWhere: Prisma.PermissionWhereInput = {
    AND: [
      { facultyId: { not: null } },
      inDepts ? { faculty: inDepts } : {},
      dateFilter,
      q
        ? {
            OR: [
              { faculty: { profile: { name: has } } },
              { faculty: { employeeId: has } },
              { faculty: { department: has } },
              { faculty: { designation: has } },
              { purpose: has },
              { destination: has },
            ],
          }
        : {},
    ],
  };
  // Gate scans whose pass is already listed (it shows its scans) are left out
  const facultyMovWhere: Prisma.MovementWhereInput = {
    AND: [
      { facultyId: { not: null } },
      { createdAt: { gte: startDate, lte: endDate } },
      inDepts ? { faculty: inDepts } : {},
      { permission: { isNot: dateFilter } },
      q
        ? {
            OR: [
              { faculty: { profile: { name: has } } },
              { faculty: { employeeId: has } },
              { faculty: { department: has } },
              { faculty: { designation: has } },
              { gate: { name: has } },
            ],
          }
        : {},
    ],
  };
  const studentMovWhere: Prisma.MovementWhereInput = {
    AND: [
      { studentId: { not: null } },
      { createdAt: { gte: startDate, lte: endDate } },
      inDepts ? { student: inDepts } : {},
      { permission: { isNot: dateFilter } },
      q
        ? {
            OR: [
              { student: { profile: { name: has } } },
              { student: { studentRoll: has } },
              { student: { department: has } },
              { gate: { name: has } },
            ],
          }
        : {},
    ],
  };

  // The tab's filter on top (scans are never "pending")
  const permFilter: Prisma.PermissionWhereInput =
    filter === "PENDING" ? { status: "PENDING" } : filter === "ENTRIES" ? { type: "ENTRY" } : filter === "EXITS" ? { type: "EXIT" } : {};
  const movFilter: Prisma.MovementWhereInput = filter === "ENTRIES" ? { type: "ENTRY" } : filter === "EXITS" ? { type: "EXIT" } : {};

  // Counts per tab (with the search), in one grouped query per kind
  const [spGroups, fpGroups, fmGroups, smGroups] = await Promise.all([
    prisma.permission.groupBy({ by: ["type", "status"], where: studentPermWhere, _count: { _all: true } }),
    prisma.permission.groupBy({ by: ["type", "status"], where: facultyPermWhere, _count: { _all: true } }),
    prisma.movement.groupBy({ by: ["type"], where: facultyMovWhere, _count: { _all: true } }),
    scope.studentMovements
      ? prisma.movement.groupBy({ by: ["type"], where: studentMovWhere, _count: { _all: true } })
      : Promise.resolve([] as Group[]),
  ]);
  const sp = countsOf(spGroups as Group[]);
  const fp = countsOf(fpGroups as Group[]);
  const fm = countsOf(fmGroups as Group[]);
  const sm = countsOf(smGroups as Group[]);
  const permTotal = (c: ActivityCounts) =>
    filter === "PENDING" ? c.pending : filter === "ENTRIES" ? c.entries : filter === "EXITS" ? c.exits : c.all;
  const movTotal = (c: ActivityCounts) => (filter === "PENDING" ? 0 : permTotal(c));

  const permSource = (kind: ActivityKind, where: Prisma.PermissionWhereInput, select: Prisma.PermissionSelect, total: number): MergeSource<ActivityKind> => ({
    kind,
    total,
    heads: (take) =>
      prisma.permission.findMany({ where: { AND: [where, permFilter] }, orderBy: NEWEST_FIRST, take, select: { id: true, createdAt: true } }),
    rows: (ids) => prisma.permission.findMany({ where: { id: { in: ids } }, select }) as Promise<{ id: string }[]>,
  });
  const movSource = (kind: ActivityKind, where: Prisma.MovementWhereInput, select: Prisma.MovementSelect, total: number): MergeSource<ActivityKind> => ({
    kind,
    total,
    heads: (take) =>
      prisma.movement.findMany({ where: { AND: [where, movFilter] }, orderBy: NEWEST_FIRST, take, select: { id: true, createdAt: true } }),
    rows: (ids) => prisma.movement.findMany({ where: { id: { in: ids } }, select }) as Promise<{ id: string }[]>,
  });

  const sources: MergeSource<ActivityKind>[] = [];
  if (who !== "FACULTY") {
    sources.push(permSource("student-permission", studentPermWhere, STUDENT_PERMISSION_SELECT, permTotal(sp)));
    if (scope.studentMovements) sources.push(movSource("student-movement", studentMovWhere, STUDENT_MOVEMENT_SELECT, movTotal(sm)));
  }
  if (who !== "STUDENTS") {
    sources.push(permSource("faculty-permission", facultyPermWhere, FACULTY_PERMISSION_SELECT, permTotal(fp)));
    sources.push(movSource("faculty-movement", facultyMovWhere, FACULTY_MOVEMENT_SELECT, movTotal(fm)));
  }
  const result = await pageMerged(sources, page, pageSize);

  return {
    selectedDate: dateStr,
    counts: {
      students: add(sp, { ...sm, pending: 0 }),
      faculty: add(fp, { ...fm, pending: 0 }),
    },
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize,
  };
}

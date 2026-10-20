import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { istDayRangeFromParam, parsePageParam } from "@/lib/time/ist";
import { FacultyActivityClient } from "./client";
import { getStaffScope, studentWhereForScope } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FacultyActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string; q?: string; tab?: string; view?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = parsePageParam(resolvedParams.page);
  const pageSize = 25;
  // Search and the Entries / Exits tab are applied on the server, so they cover every page
  const q = typeof resolvedParams.q === "string" ? resolvedParams.q.trim().slice(0, 100) : "";
  const tab = resolvedParams.tab === "ENTRIES" || resolvedParams.tab === "EXITS" ? resolvedParams.tab : "ALL";
  // Which list: the students' passes (default) or the faculty member's own
  const view = resolvedParams.view === "mine" ? "mine" : "students";

  // IST calendar day; invalid ?date falls back to today
  const { start: startDate, end: dayEnd, dateStr } = istDayRangeFromParam(resolvedParams.date);
  const endDate = new Date(dayEnd.getTime() - 1);

  const user = await requireRole("FACULTY");
  
  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!faculty) {
    return <p className="mx-auto max-w-5xl py-12 text-center text-sm text-zinc-500">Faculty not found</p>;
  }

  // ?date=all: every date (newest first); otherwise the chosen IST day
  const allDates = resolvedParams.date === "all";
  const dateCondition = allDates
    ? {}
    : {
        OR: [
          { createdAt: { gte: startDate, lte: endDate } },
          { exitDate: { gte: startDate, lte: endDate } },
        ],
      };

  // Same rule as "My Students": only the students assigned to this faculty member
  const scopeWhere = studentWhereForScope(await getStaffScope(user)) ?? { facultyId: faculty.id };
  const studentsWhere = {
    AND: [
      { student: scopeWhere },
      dateCondition,
      ...(tab === "ENTRIES" ? [{ type: "ENTRY" as const }] : tab === "EXITS" ? [{ type: "EXIT" as const }] : []),
      ...(q
        ? [{
            student: {
              OR: [
                { studentRoll: { contains: q, mode: "insensitive" as const } },
                { profile: { name: { contains: q, mode: "insensitive" as const } } },
              ],
            },
          }]
        : []),
    ],
  };

  const typeFilter = tab === "ENTRIES" ? [{ type: "ENTRY" as const }] : tab === "EXITS" ? [{ type: "EXIT" as const }] : [];
  const mineWhere = {
    AND: [
      { facultyId: faculty.id },
      dateCondition,
      ...typeFilter,
      ...(q
        ? [{
            OR: [
              { purpose: { contains: q, mode: "insensitive" as const } },
              { destination: { contains: q, mode: "insensitive" as const } },
            ],
          }]
        : []),
    ],
  };

  // Only the open tab's list is loaded; the other tab just gets its count
  const [permissions, studentsTotal, ownPasses, mineTotal] = await Promise.all([
    view !== "students" ? Promise.resolve([]) : prisma.permission.findMany({
      where: studentsWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, purpose: true, destination: true, exitDate: true, expectedExit: true, expectedReturn: true, status: true, createdAt: true, type: true,
        student: { select: { studentRoll: true, profile: { select: { name: true } } } },
        movements: {
          select: { type: true, createdAt: true, notes: true, gate: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        }
      },
    }),
    prisma.permission.count({ where: studentsWhere }),
    // The faculty member's own passes on this date, paged like the students' list
    view !== "mine" ? Promise.resolve([]) : prisma.permission.findMany({
      where: mineWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, type: true, purpose: true, destination: true, status: true, createdAt: true, exitDate: true,
        expectedExit: true, approvedAt: true, rejectedAt: true, rejectionReason: true,
        approverType: true, approvalMode: true,
        movements: {
          select: { type: true, createdAt: true, gate: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.permission.count({ where: mineWhere }),
  ]);

  return (
    <FacultyActivityClient
      user={user}
      permissions={permissions}
      ownPasses={ownPasses}
      total={view === "mine" ? mineTotal : studentsTotal}
      studentsTotal={studentsTotal}
      mineTotal={mineTotal}
      view={view}
      currentPage={page}
      pageSize={pageSize}
      selectedDate={dateStr}
      allDates={allDates}
      search={q}
      tab={tab}
    />
  );
}

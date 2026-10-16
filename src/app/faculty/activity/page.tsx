import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { istDayRangeFromParam, parsePageParam } from "@/lib/time/ist";
import { FacultyActivityClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FacultyActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string; q?: string; tab?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = parsePageParam(resolvedParams.page);
  const pageSize = 25;
  // Search and the Entries / Exits tab are applied on the server, so they cover every page
  const q = typeof resolvedParams.q === "string" ? resolvedParams.q.trim().slice(0, 100) : "";
  const tab = resolvedParams.tab === "ENTRIES" || resolvedParams.tab === "EXITS" ? resolvedParams.tab : "ALL";

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

  const dateCondition = {
    OR: [
      { createdAt: { gte: startDate, lte: endDate } },
      { exitDate: { gte: startDate, lte: endDate } },
    ],
  };

  const studentsWhere = {
    AND: [
      { student: { facultyId: faculty.id } },
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

  const [permissions, total, ownPasses] = await Promise.all([
    prisma.permission.findMany({
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
    // The faculty member's own passes on this date (My Passes shows only today)
    prisma.permission.findMany({
      where: { facultyId: faculty.id, ...dateCondition },
      orderBy: { createdAt: "desc" },
      take: 50,
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
  ]);

  return (
    <FacultyActivityClient
      user={user}
      permissions={permissions}
      ownPasses={ownPasses}
      total={total}
      currentPage={page}
      pageSize={pageSize}
      selectedDate={dateStr}
      search={q}
      tab={tab}
    />
  );
}

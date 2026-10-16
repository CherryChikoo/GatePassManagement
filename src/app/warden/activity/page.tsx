import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { istDayRangeFromParam, parsePageParam } from "@/lib/time/ist";
import { WardenActivityClient } from "./client";

export default async function WardenActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = parsePageParam(resolvedParams.page);
  const pageSize = 25;

  // IST calendar day; invalid ?date falls back to today
  const { start: startDate, end: dayEnd, dateStr } = istDayRangeFromParam(resolvedParams.date);
  const endDate = new Date(dayEnd.getTime() - 1);

  const user = await requireRole("WARDEN");
  
  const warden = await prisma.warden.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!warden) {
    return <p className="py-12 text-center text-sm text-zinc-500">Warden not found</p>;
  }

  // A pass belongs to a day if it was requested OR scheduled on that day
  // (same rule as every other Activity page)
  const dayWhere = {
    student: { wardenId: warden.id },
    OR: [
      { createdAt: { gte: startDate, lte: endDate } },
      { exitDate: { gte: startDate, lte: endDate } },
    ],
  };

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({
      where: dayWhere,
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
    prisma.permission.count({ where: dayWhere }),
  ]);

  return (
    <WardenActivityClient 
      user={user} 
      permissions={permissions} 
      total={total}
      currentPage={page}
      selectedDate={dateStr}
    />
  );
}

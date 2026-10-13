import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { FacultyActivityClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FacultyActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = parseInt(resolvedParams.page || "1");
  const pageSize = 25;
  
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  const dateStr = resolvedParams.date || todayStr;
  
  const [y, m, d] = dateStr.split("-").map(Number);
  const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);

  const user = await requireRole("FACULTY");
  
  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!faculty) {
    return <div>Faculty not found</div>;
  }

  const dateCondition = {
    OR: [
      { createdAt: { gte: startDate, lte: endDate } },
      { exitDate: { gte: startDate, lte: endDate } },
    ],
  };

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({
      where: {
        student: { facultyId: faculty.id },
        ...dateCondition,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, purpose: true, destination: true, expectedExit: true, expectedReturn: true, status: true, createdAt: true, type: true,
        student: { select: { studentRoll: true, profile: { select: { name: true } } } },
        movements: {
          select: { type: true, createdAt: true, notes: true, gate: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        }
      },
    }),
    prisma.permission.count({
      where: {
        student: { facultyId: faculty.id },
        ...dateCondition,
      }
    }),
  ]);

  return (
    <FacultyActivityClient 
      user={user} 
      permissions={permissions} 
      total={total}
      currentPage={page}
      selectedDate={dateStr}
    />
  );
}

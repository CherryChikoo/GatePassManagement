import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { WardenActivityClient } from "./client";

export default async function WardenActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = parseInt(resolvedParams.page || "1");
  const pageSize = 25;
  
  // Get today's date in local timezone
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  const dateStr = resolvedParams.date || todayStr;
  
  const startDate = new Date(dateStr);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(dateStr);
  endDate.setHours(23, 59, 59, 999);

  const user = await requireRole("WARDEN");
  
  const warden = await prisma.warden.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!warden) {
    return <div>Warden not found</div>;
  }

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({
      where: {
        student: { wardenId: warden.id },
        createdAt: { gte: startDate, lte: endDate }
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
        student: { wardenId: warden.id },
        createdAt: { gte: startDate, lte: endDate }
      }
    }),
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

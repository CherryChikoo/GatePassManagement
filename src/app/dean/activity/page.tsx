import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { istDateString, istDayRangeFromParam } from "@/lib/time/ist";
import { DeanActivityClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DeanActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const resolvedParams = await searchParams;

  // IST calendar day; invalid ?date falls back to today
  const { start: startDate, end: dayEnd, dateStr } = istDayRangeFromParam(resolvedParams.date);
  const endDate = new Date(dayEnd.getTime() - 1);
  const isToday = dateStr === istDateString();

  const user = await requireRole("DEAN");

  // Date filter: passes created on this date, scheduled to exit on this date,
  // or if today is selected, any passes currently in PENDING status
  const dateFilter = {
    OR: [
      { createdAt: { gte: startDate, lte: endDate } },
      { exitDate: { gte: startDate, lte: endDate } },
      ...(isToday ? [{ status: "PENDING" as const }] : []),
    ],
  };

  // Fetch academic division student permissions, faculty permissions, and gate movements
  const [studentPermissions, facultyPermissions, facultyMovements, studentMovements] = await Promise.all([
    // Student permissions campus-wide
    prisma.permission.findMany({
      where: {
        studentId: { not: null },
        ...dateFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 500, // bound the payload for busy days
      select: {
        id: true,
        purpose: true,
        destination: true,
        exitDate: true,
        expectedExit: true,
        expectedReturn: true,
        status: true,
        createdAt: true,
        type: true,
        approverType: true,
        remarks: true,
        contactNumber: true,
        student: {
          select: {
            studentRoll: true,
            department: true,
            profile: { select: { name: true, email: true, phone: true } },
          },
        },
        movements: {
          select: {
            id: true,
            type: true,
            createdAt: true,
            notes: true,
            gate: { select: { name: true, location: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),

    // Faculty permissions campus-wide
    prisma.permission.findMany({
      where: {
        facultyId: { not: null },
        ...dateFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 500, // bound the payload for busy days
      select: {
        id: true,
        purpose: true,
        destination: true,
        exitDate: true,
        expectedExit: true,
        expectedReturn: true,
        status: true,
        createdAt: true,
        type: true,
        approverType: true,
        remarks: true,
        contactNumber: true,
        faculty: {
          select: {
            id: true,
            department: true,
            designation: true,
            employeeId: true,
            profile: { select: { name: true, email: true, phone: true, role: true } },
          },
        },
        movements: {
          select: {
            id: true,
            type: true,
            createdAt: true,
            notes: true,
            gate: { select: { name: true, location: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),

    // Faculty gate scans / movements for the selected day
    prisma.movement.findMany({
      where: {
        facultyId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "desc" },
      take: 500, // bound the payload for busy days
      select: {
        id: true,
        permissionId: true,
        type: true,
        createdAt: true,
        notes: true,
        gate: { select: { name: true, location: true } },
        faculty: {
          select: {
            department: true,
            designation: true,
            employeeId: true,
            profile: { select: { name: true } },
          },
        },
      },
    }),

    // Student gate scans / movements for the selected day
    prisma.movement.findMany({
      where: {
        studentId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "desc" },
      take: 500, // bound the payload for busy days
      select: {
        id: true,
        permissionId: true,
        type: true,
        createdAt: true,
        notes: true,
        gate: { select: { name: true, location: true } },
        student: {
          select: {
            studentRoll: true,
            department: true,
            profile: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  // Avoid duplicating gate movements if their permission is already loaded
  const facultyPermIds = new Set(facultyPermissions.map((fp) => fp.id));
  const standaloneFacultyMovements = facultyMovements.filter(
    (m) => !m.permissionId || !facultyPermIds.has(m.permissionId)
  );

  const studentPermIds = new Set(studentPermissions.map((sp) => sp.id));
  const standaloneStudentMovements = studentMovements.filter(
    (m) => !m.permissionId || !studentPermIds.has(m.permissionId)
  );

  // Serialize dates to ISO strings for client component
  const serializedStudentPermissions = studentPermissions.map((p) => ({
    ...p,
    createdAt: p.createdAt ? p.createdAt.toISOString() : null,
    exitDate: p.exitDate ? p.exitDate.toISOString() : null,
    expectedExit: p.expectedExit ? p.expectedExit.toISOString() : null,
    expectedReturn: p.expectedReturn ? p.expectedReturn.toISOString() : null,
    movements: p.movements.map((m) => ({
      ...m,
      createdAt: m.createdAt ? m.createdAt.toISOString() : null,
    })),
  }));

  const serializedFacultyPermissions = facultyPermissions.map((p) => ({
    ...p,
    createdAt: p.createdAt ? p.createdAt.toISOString() : null,
    exitDate: p.exitDate ? p.exitDate.toISOString() : null,
    expectedExit: p.expectedExit ? p.expectedExit.toISOString() : null,
    expectedReturn: p.expectedReturn ? p.expectedReturn.toISOString() : null,
    movements: p.movements.map((m) => ({
      ...m,
      createdAt: m.createdAt ? m.createdAt.toISOString() : null,
    })),
  }));

  const serializedFacultyMovements = standaloneFacultyMovements.map((m) => ({
    ...m,
    createdAt: m.createdAt ? m.createdAt.toISOString() : null,
  }));

  const serializedStudentMovements = standaloneStudentMovements.map((m) => ({
    ...m,
    createdAt: m.createdAt ? m.createdAt.toISOString() : null,
  }));

  return (
    <DeanActivityClient
      user={user}
      permissions={serializedStudentPermissions}
      facultyPermissions={serializedFacultyPermissions}
      facultyMovements={serializedFacultyMovements}
      studentMovements={serializedStudentMovements}
      selectedDate={dateStr}
    />
  );
}

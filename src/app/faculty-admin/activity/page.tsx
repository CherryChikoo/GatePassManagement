import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";
import { HodActivityClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FacultyAdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const resolvedParams = await searchParams;

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;

  const dateStr = resolvedParams.date || todayStr;
  const isToday = dateStr === todayStr;

  const [y, m, d] = dateStr.split("-").map(Number);
  const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);

  const user = await requireRole("FACULTY_ADMIN");

  // Get the HOD's faculty record to find their department
  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, department: true },
  });

  if (!faculty) {
    return (
      <div className="p-8 text-center text-zinc-400">
        Faculty record not found for HOD account.
      </div>
    );
  }

  const dept = faculty.department || "";
  const deptVariants = getDepartmentVariants(dept);
  const deptFilter = deptVariants.length > 0 ? { in: deptVariants } : undefined;

  // Date filter: passes created on this date, scheduled to exit on this date,
  // or if today is selected, any passes currently in PENDING status for the department
  const dateFilter = {
    OR: [
      { createdAt: { gte: startDate, lte: endDate } },
      { exitDate: { gte: startDate, lte: endDate } },
      ...(isToday ? [{ status: "PENDING" as const }] : []),
    ],
  };

  // Fetch both student permissions AND faculty permissions for the department,
  // plus any standalone gate movements
  const [studentPermissions, facultyPermissions, facultyMovements] = await Promise.all([
    // Student permissions (including PENDING)
    prisma.permission.findMany({
      where: {
        studentId: { not: null },
        ...(deptFilter ? { student: { department: deptFilter } } : {}),
        ...dateFilter,
      },
      orderBy: { createdAt: "desc" },
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

    // Faculty permissions (including PENDING and APPROVED)
    prisma.permission.findMany({
      where: {
        facultyId: { not: null },
        ...(deptFilter ? { faculty: { department: deptFilter } } : {}),
        ...dateFilter,
      },
      orderBy: { createdAt: "desc" },
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

    // Faculty gate scans / movements for the department
    prisma.movement.findMany({
      where: {
        facultyId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
        ...(deptFilter ? { faculty: { department: deptFilter } } : {}),
      },
      orderBy: { createdAt: "desc" },
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
  ]);

  // Avoid duplicating gate movements if their permission is already in facultyPermissions
  const facultyPermIds = new Set(facultyPermissions.map((fp) => fp.id));
  const standaloneFacultyMovements = facultyMovements.filter(
    (m) => !facultyPermIds.has(m.permissionId)
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

  return (
    <HodActivityClient
      user={user}
      permissions={serializedStudentPermissions}
      facultyPermissions={serializedFacultyPermissions}
      facultyMovements={serializedFacultyMovements}
      selectedDate={dateStr}
      department={dept}
    />
  );
}

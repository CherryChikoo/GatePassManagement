"use server";

import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";
import { istDateString, istDayRangeFromParam } from "@/lib/time/ist";

/**
 * One IST day of the HOD's department activity (student and faculty passes,
 * faculty gate scans). Loaded by the Activity screen in the browser (cached per
 * day), so the page opens at once.
 */
export async function getHodActivity(dateParam?: string) {
  // IST calendar day; invalid ?date falls back to today
  const { start: startDate, end: dayEnd, dateStr } = istDayRangeFromParam(typeof dateParam === "string" ? dateParam : undefined);
  const endDate = new Date(dayEnd.getTime() - 1);
  const isToday = dateStr === istDateString();

  const user = await requireRole("FACULTY_ADMIN");

  // Get the HOD's faculty record to find their department
  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, department: true },
  });

  if (!faculty) return { error: "Faculty record not found for HOD account." };

  const dept = faculty.department || "";
  const deptVariants = getDepartmentVariants(dept);
  // No department configured → show nothing rather than every department
  const deptFilter = { in: deptVariants.length > 0 ? deptVariants : ["__no_department__"] };

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

    // Faculty permissions (including PENDING and APPROVED)
    prisma.permission.findMany({
      where: {
        facultyId: { not: null },
        ...(deptFilter ? { faculty: { department: deptFilter } } : {}),
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


  return {
    selectedDate: dateStr,
    department: dept,
    permissions: serializedStudentPermissions,
    facultyPermissions: serializedFacultyPermissions,
    facultyMovements: serializedFacultyMovements,
  };
}

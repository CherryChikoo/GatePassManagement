import { prisma } from "@/lib/db/prisma";
import { istDateString, istDayRangeFromParam } from "@/lib/time/ist";

/**
 * Campus-wide, read-only activity for one IST day: student and faculty passes
 * (created or scheduled that day, plus pending ones when the day is today) and
 * gate movements. Used by the Director, Dean and Security Supervisor activity
 * pages. Callers must authorize the user first.
 */
export async function loadCampusActivity(dateParam?: string) {
  // IST calendar day; invalid ?date falls back to today
  const { start: startDate, end: dayEnd, dateStr } = istDayRangeFromParam(dateParam);
  const endDate = new Date(dayEnd.getTime() - 1);
  const isToday = dateStr === istDateString();

  const dateFilter = {
    OR: [
      { createdAt: { gte: startDate, lte: endDate } },
      { exitDate: { gte: startDate, lte: endDate } },
      ...(isToday ? [{ status: "PENDING" as const }] : []),
    ],
  };

  const movementSelect = {
    id: true,
    type: true,
    createdAt: true,
    notes: true,
    gate: { select: { name: true, location: true } },
  } as const;

  const [studentPermissions, facultyPermissions, facultyMovements, studentMovements] = await Promise.all([
    prisma.permission.findMany({
      where: { studentId: { not: null }, ...dateFilter },
      orderBy: { createdAt: "desc" },
      take: 500, // bound the payload for busy days
      select: {
        id: true, purpose: true, destination: true, exitDate: true, expectedExit: true,
        expectedReturn: true, status: true, createdAt: true, type: true, approverType: true,
        remarks: true, contactNumber: true,
        student: {
          select: {
            studentRoll: true,
            department: true,
            profile: { select: { name: true, email: true, phone: true } },
          },
        },
        movements: { select: movementSelect, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.permission.findMany({
      where: { facultyId: { not: null }, ...dateFilter },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, purpose: true, destination: true, exitDate: true, expectedExit: true,
        expectedReturn: true, status: true, createdAt: true, type: true, approverType: true,
        remarks: true, contactNumber: true,
        faculty: {
          select: {
            id: true, department: true, designation: true, employeeId: true,
            profile: { select: { name: true, email: true, phone: true, role: true } },
          },
        },
        movements: { select: movementSelect, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.movement.findMany({
      where: { facultyId: { not: null }, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        ...movementSelect,
        permissionId: true,
        faculty: {
          select: { department: true, designation: true, employeeId: true, profile: { select: { name: true } } },
        },
      },
    }),
    prisma.movement.findMany({
      where: { studentId: { not: null }, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        ...movementSelect,
        permissionId: true,
        student: { select: { studentRoll: true, department: true, profile: { select: { name: true } } } },
      },
    }),
  ]);

  // Avoid duplicating gate movements whose pass is already listed
  const facultyPermIds = new Set(facultyPermissions.map((p) => p.id));
  const studentPermIds = new Set(studentPermissions.map((p) => p.id));

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const serializePermission = <T extends { createdAt: Date; exitDate: Date; expectedExit: Date | null; expectedReturn: Date | null; movements: { createdAt: Date }[] }>(p: T) => ({
    ...p,
    createdAt: iso(p.createdAt),
    exitDate: iso(p.exitDate),
    expectedExit: iso(p.expectedExit),
    expectedReturn: iso(p.expectedReturn),
    movements: p.movements.map((m) => ({ ...m, createdAt: iso(m.createdAt) })),
  });

  return {
    selectedDate: dateStr,
    permissions: studentPermissions.map(serializePermission),
    facultyPermissions: facultyPermissions.map(serializePermission),
    facultyMovements: facultyMovements
      .filter((m) => !m.permissionId || !facultyPermIds.has(m.permissionId))
      .map((m) => ({ ...m, createdAt: iso(m.createdAt) })),
    studentMovements: studentMovements
      .filter((m) => !m.permissionId || !studentPermIds.has(m.permissionId))
      .map((m) => ({ ...m, createdAt: iso(m.createdAt) })),
  };
}

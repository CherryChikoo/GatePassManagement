/**
 * Admin dashboard monitoring counts (right now / today / people), shared by the
 * preload endpoint and getAdminDashboard so both always show the same numbers.
 * Grouped queries give many numbers per database trip. Server only.
 */
import { prisma } from "@/lib/db/prisma";

export async function getAdminMonitorCounts(todayStart: Date, todayEnd: Date) {
  const now = new Date();
  // Passes that expect a return (faculty, hostellers); a day scholar going home is never "overdue"
  const returnPass = { OR: [{ facultyId: { not: null } }, { student: { studentType: "HOSTELLER" as const } }] };

  const [studentGroups, profileGroups, facultyOut, overdue, visitorsInside, pending, approvedUnused, requestsToday, registerToday, attendanceMarked, activeSecurity] =
    await Promise.all([
      prisma.student.groupBy({ by: ["studentType", "hostelType", "status"], _count: { _all: true } }),
      prisma.profile.groupBy({ by: ["role", "active"], _count: { _all: true } }),
      prisma.permission.count({ where: { facultyId: { not: null }, status: "EXITED" } }),
      prisma.permission.count({
        where: {
          status: "EXITED",
          ...returnPass,
          AND: [{ OR: [{ expectedReturn: { lt: now } }, { expectedReturn: null, endDate: { lt: todayStart } }] }],
        },
      }),
      prisma.outsider.count({ where: { exitTime: null, entryTime: { gte: todayStart, lt: todayEnd } } }),
      prisma.permission.count({ where: { status: "PENDING" } }),
      prisma.permission.count({ where: { status: "APPROVED", OR: [{ endDate: { gte: todayStart } }, { endDate: null, exitDate: { gte: todayStart } }] } }),
      prisma.permission.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
      prisma.registerEntry.count({
        where: {
          kind: "ORIGINAL",
          entryDate: { gte: todayStart, lt: todayEnd },
          register: { notIn: ["SECURITY_ATTENDANCE", "ATTENDANCE_REMARK", "SECURITY_RANK", "OUTING_NOTE"] },
        },
      }),
      prisma.registerEntry.count({ where: { register: "SECURITY_ATTENDANCE", kind: "ORIGINAL", entryDate: { gte: todayStart, lt: todayEnd } } }),
      prisma.securityStaff.count({ where: { profile: { active: true } } }),
    ]);

  const students = (pred: (g: (typeof studentGroups)[number]) => boolean) =>
    studentGroups.filter(pred).reduce((n, g) => n + g._count._all, 0);
  const profiles = (pred: (g: (typeof profileGroups)[number]) => boolean) =>
    profileGroups.filter(pred).reduce((n, g) => n + g._count._all, 0);

  return {
    studentsOut: students((g) => g.status === "OUTSIDE"),
    hostellersOut: students((g) => g.status === "OUTSIDE" && g.studentType === "HOSTELLER"),
    dayScholarsOut: students((g) => g.status === "OUTSIDE" && g.studentType !== "HOSTELLER"),
    facultyOut,
    overdue,
    visitorsInside,
    pending,
    approvedUnused,
    requestsToday,
    registerToday,
    attendanceMarked,
    activeSecurity,
    boysHostellers: students((g) => g.studentType === "HOSTELLER" && g.hostelType === "BOYS"),
    ladiesHostellers: students((g) => g.studentType === "HOSTELLER" && g.hostelType === "LADIES"),
    dayScholars: students((g) => g.studentType !== "HOSTELLER"),
    facultyOnly: profiles((g) => g.role === "FACULTY"),
    hods: profiles((g) => g.role === "FACULTY_ADMIN"),
    deansDirectors: profiles((g) => g.role === "DEAN" || g.role === "DIRECTOR"),
    supervisors: profiles((g) => g.role === "SECURITY_SUPERVISOR"),
    disabledAccounts: profiles((g) => !g.active),
  };
}

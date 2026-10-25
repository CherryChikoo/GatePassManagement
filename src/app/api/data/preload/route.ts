import { generateLiveQrToken } from "@/server/actions/permissions";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";
import { autoExpireOutdatedPermissions } from "@/lib/permissions/auto-expire";
import { resolveStudentApprover, getFacultyApproverOptions } from "@/lib/permissions/approver";
import { istDateString, istStartOfDay } from "@/lib/time/ist";
import { fillMovementPeople } from "@/lib/people";
import { getAdminMonitorCounts } from "@/lib/dashboard/admin-monitor";
import { canScanReturn } from "@/lib/passes/return-scan";

/**
 * Unified preload endpoint — returns ALL data the logged-in user needs
 * in a single request, keyed by data type.
 *
 * This replaces dozens of individual server-side data-fetching calls
 * and allows the client to cache everything locally in Zustand.
 *
 * GET /api/data/preload
 */
export async function GET(req: Request) {
  // ?light=1: the regular refresh (every few minutes, after an approve / reject).
  // It skips the people directories (department students, hostellers, faculty
  // lists), which change rarely and are most of the payload; the browser keeps
  // the copy from the last full load. Requests, counts and passes always come.
  const light = new URL(req.url).searchParams.get("light") === "1";
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }

    // Proactively clean up any expired passes (time limit ended or previous days).
    // Not for Security: the scan re-checks every pass, and the gate screens stay light.
    if (user.role !== "SECURITY") await autoExpireOutdatedPermissions();

    const loaders: Record<string, () => Promise<unknown>> = {
      FACULTY: async () => ({
        ...(await preloadFaculty(user.profileId, light)),
        // Who this faculty member can send their own pass to (HOD / Dean / Both)
        approverOptions: await getFacultyApproverOptions(user),
      }),
      WARDEN: () => preloadWarden(user.profileId, light),
      STUDENT: () => preloadStudent(user.profileId),
      SECURITY: () => preloadSecurity(),
      FACULTY_ADMIN: () => preloadFacultyAdmin(user.profileId, light),
      ADMIN: () => preloadAdmin(light),
      DIRECTOR: () => preloadDirector(user.profileId, light),
      DEAN: () => preloadDean(user.profileId, light),
      SECURITY_SUPERVISOR: () => preloadSupervisor(light),
    };
    const loader = loaders[user.role];
    if (!loader) {
      return NextResponse.json({ error: "Unknown role" }, { status: 400, headers: NO_STORE });
    }
    // __profileId lets each tab detect that the browser's session now belongs to someone else
    const data = (await loader()) as Record<string, unknown>;
    // Faculty gate movements: show the faculty member, not "Unknown"
    fillMovementPeople(data);
    return NextResponse.json({ ...data, __profileId: user.profileId, __light: light }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[Preload] Error:", err?.message);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500, headers: NO_STORE });
  }
}

const NO_STORE = { "Cache-Control": "private, no-store" };

/** QR credential fields safe to send to the browser (never the stored token). */
const QR_PUBLIC_SELECT = {
  id: true,
  expiresAt: true,
  active: true,
  usedForExit: true,
  usedForEntry: true,
} as const;

// ──────────────────────────────────────────────────────────────
// HOD (FACULTY ADMIN) PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadFacultyAdmin(profileId: string, light = false) {
  const faculty = await prisma.faculty.findUnique({
    where: { profileId },
    select: { id: true, department: true, designation: true, maxApprovals: true, employeeId: true },
  });

  // An HOD's department decides what they can see and approve. Never guess it:
  // without a faculty record the account is not set up (the admin assigns it).
  if (!faculty) return { dashboard: null };

  const today = istStartOfDay();

  const deptVariants = getDepartmentVariants(faculty.department);
  const deptCondition = deptVariants.length > 0 ? [{ department: { in: deptVariants } }] : [];
  const studentDeptCondition = deptVariants.length > 0 ? [{ student: { department: { in: deptVariants } } }] : [];
  const facultyDeptCondition = deptVariants.length > 0 ? [{ faculty: { department: { in: deptVariants } } }] : [];

  // Requests this HOD is responsible for: routed to an HOD and belonging to
  // this department (students or faculty), never the HOD's own pass.
  const hodScope = {
    approverType: "FACULTY_ADMIN" as const,
    AND: [{ OR: [{ facultyId: null }, { facultyId: { not: faculty.id } }] }],
    OR: [
      { approverId: { in: [profileId, faculty.id] } },
      ...studentDeptCondition,
      ...facultyDeptCondition,
    ],
  };

  const [
    totalStudents,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    facultyPending,
    studentPending,
    allRequests,
    studentsData,
    departmentFaculty,
    wardens,
    allMovements,
  ] = await Promise.all([
    prisma.student.count({
      where: {
        OR: [
          { facultyId: faculty.id },
          ...deptCondition,
        ],
      },
    }),
    prisma.permission.count({
      where: { ...hodScope, status: { in: ["APPROVED", "EXITED", "COMPLETED"] }, approvedAt: { gte: today } },
    }),
    prisma.permission.count({
      where: { ...hodScope, status: "REJECTED", rejectedAt: { gte: today } },
    }),
    prisma.movement.count({
      where: {
        type: "EXIT",
        createdAt: { gte: today },
        OR: [...studentDeptCondition, ...facultyDeptCondition],
      },
    }),
    prisma.movement.count({
      where: {
        type: "ENTRY",
        createdAt: { gte: today },
        OR: [...studentDeptCondition, ...facultyDeptCondition],
      },
    }),
    prisma.permission.count({
      where: { ...hodScope, status: "PENDING", facultyId: { not: null } },
    }),
    prisma.permission.count({
      where: { ...hodScope, status: "PENDING", studentId: { not: null } },
    }),
    // Requests tab = today's work only (resets every IST day). Older requests are
    // in the Activity tab. Still-pending ones stay until decided or expired.
    prisma.permission.findMany({
      where: {
        ...hodScope,
        AND: [
          ...hodScope.AND,
          {
            OR: [
              { createdAt: { gte: today } },
              { approvedAt: { gte: today } },
              { rejectedAt: { gte: today } },
              { status: "PENDING" },
              // Faculty still out on an earlier pass (shown as delayed when late)
              { status: "EXITED", facultyId: { not: null }, type: { not: "ENTRY" }, movements: { none: { type: "ENTRY" } } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        student: {
          select: {
            studentRoll: true,
            department: true,
            year: true,
            section: true,
            profile: { select: { name: true, email: true, phone: true } },
          },
        },
        faculty: {
          select: {
            department: true,
            designation: true,
            employeeId: true,
            profile: { select: { name: true, email: true, phone: true } },
          },
        },
        qr: { select: { usedForExit: true, usedForEntry: true, expiresAt: true } },
      },
    }),
    // Department students (no department configured → none)
    light ? undefined : prisma.student.findMany({
      where: {
        OR: [
          { facultyId: faculty.id },
          ...deptCondition,
        ],
      },
      orderBy: { studentRoll: "asc" },
      include: {
        profile: {
          select: { id: true, name: true, email: true, phone: true, active: true },
        },
        faculty: {
          select: { id: true, profile: { select: { name: true } } },
        },
        warden: {
          select: { id: true, profile: { select: { name: true } } },
        },
      },
    }),
    // Department faculty members
    light ? undefined : prisma.profile.findMany({
      where: {
        role: { in: ["FACULTY", "FACULTY_ADMIN"] },
        ...(deptVariants.length > 0 ? { faculty: { department: { in: deptVariants } } } : {}),
      },
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        role: true,
        faculty: {
          select: { id: true, department: true, designation: true, employeeId: true },
        },
      },
    }),
    // Wardens
    light ? undefined : prisma.warden.findMany({
      select: { id: true, hostelBlock: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
    // Department movements (students + faculty)
    prisma.movement.findMany({
      where: {
        OR: [...studentDeptCondition, ...facultyDeptCondition],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        student: {
          select: {
            studentRoll: true,
            department: true,
            profile: { select: { name: true } },
          },
        },
        faculty: {
          select: {
            department: true,
            designation: true,
            profile: { select: { name: true } },
          },
        },
        gate: { select: { name: true } },
      },
    }),
  ]);

  const recentActivity = allRequests.slice(0, 10);

  return {
    dashboard: {
      faculty,
      stats: {
        totalStudents,
        approvedToday,
        rejectedToday,
        exitsToday,
        entriesToday,
        facultyPending,
        studentPending,
      },
      recentActivity,
    },
    requests: allRequests,
    allRequests,
    students: studentsData,
    allUsers: departmentFaculty,
    faculty: departmentFaculty,
    allMovements,
    wardens,
  };
}

// ──────────────────────────────────────────────────────────────
// FACULTY PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadFaculty(profileId: string, light = false) {
  const faculty = await prisma.faculty.findUnique({
    where: { profileId },
    select: { id: true, department: true, designation: true, maxApprovals: true },
  });

  if (!faculty) return { dashboard: null };

  const today = istStartOfDay();

  const [
    totalStudents,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    recentApprovals,
    studentsData,
    wardens,
    myPasses,
  ] = await Promise.all([
    prisma.student.count({ where: { facultyId: faculty.id } }),
    // Faculty do not approve passes (HOD / warden do); these are read-only
    // figures for the faculty member's assigned students.
    prisma.permission.count({
      where: {
        student: { facultyId: faculty.id },
        status: { in: ["APPROVED", "EXITED", "COMPLETED"] },
        approvedAt: { gte: today },
      },
    }),
    prisma.permission.count({
      where: {
        student: { facultyId: faculty.id },
        status: "REJECTED",
        rejectedAt: { gte: today },
      },
    }),
    prisma.movement.count({
      where: {
        student: { facultyId: faculty.id },
        type: "EXIT",
        createdAt: { gte: today },
      },
    }),
    prisma.movement.count({
      where: {
        student: { facultyId: faculty.id },
        type: "ENTRY",
        createdAt: { gte: today },
      },
    }),
    // Recent passes of the faculty member's assigned students (view only)
    prisma.permission.findMany({
      where: { student: { facultyId: faculty.id } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true, status: true, type: true, purpose: true, destination: true,
        expectedExit: true, expectedReturn: true, createdAt: true, updatedAt: true,
        rejectionReason: true, approverType: true,
        student: {
          select: {
            studentRoll: true, department: true, year: true, section: true,
            profile: { select: { name: true, phone: true } },
          },
        },
        qr: { select: { usedForExit: true, usedForEntry: true, expiresAt: true } },
      },
    }),
    // Students list: only the students assigned to this faculty member
    light ? undefined : prisma.student.findMany({
      where: { facultyId: faculty.id },
      orderBy: { studentRoll: "asc" },
      include: {
        profile: {
          select: { id: true, name: true, email: true, phone: true, active: true },
        },
        faculty: {
          select: { id: true, profile: { select: { name: true } } },
        },
        warden: {
          select: { id: true, profile: { select: { name: true } } },
        },
      },
    }),
    // Wardens list (for student assignment dropdowns)
    light ? undefined : prisma.warden.findMany({
      select: { id: true, hostelBlock: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
    // Faculty's own passes for today (IST): requested today, scheduled today or
    // later, a multi-day pass covering today, or still pending / approved.
    // A pass from an earlier day that was used to go out is history (Activity
    // tab) once they are back; while they are still out on it (no return yet,
    // even past its last day) it stays here, with its return QR.
    prisma.permission.findMany({
      where: {
        facultyId: faculty.id,
        OR: [
          { createdAt: { gte: today } },
          { exitDate: { gte: today } },
          { exitDate: { lt: today }, endDate: { gte: today } },
          { status: { in: ["PENDING", "APPROVED"] } },
          { status: "EXITED", type: { not: "ENTRY" }, movements: { none: { type: "ENTRY" } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        qr: { select: QR_PUBLIC_SELECT },
        movements: { include: { gate: true } }
      }
    }),
  ]);

  return {
    dashboard: {
      faculty,
      stats: { totalStudents, approvedToday, rejectedToday, exitsToday, entriesToday },
      recentActivity: recentApprovals,
    },
    students: studentsData,
    wardens,
    myPasses,
  };
}

// ──────────────────────────────────────────────────────────────
// WARDEN PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadWarden(profileId: string, light = false) {
  const warden = await prisma.warden.findUnique({
    where: { profileId },
    select: { id: true, hostelBlock: true },
  });

  if (!warden) return { dashboard: null };

  const today = istStartOfDay();

  const [
    totalHostellers,
    pendingCount,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    recentApprovals,
    allRequests,
    studentsRaw,
    wardens,
  ] = await Promise.all([
    prisma.student.count({ where: { wardenId: warden.id } }),
    prisma.permission.count({
      where: { approverId: warden.id, status: "PENDING", approverType: "WARDEN", createdAt: { gte: today } },
    }),
    prisma.permission.count({
      where: {
        approverId: warden.id,
        status: { in: ["APPROVED", "EXITED", "COMPLETED"] },
        approvedAt: { gte: today },
      },
    }),
    prisma.permission.count({
      where: { approverId: warden.id, status: "REJECTED", rejectedAt: { gte: today } },
    }),
    prisma.movement.count({
      where: { student: { wardenId: warden.id }, type: "EXIT", createdAt: { gte: today } },
    }),
    prisma.movement.count({
      where: { student: { wardenId: warden.id }, type: "ENTRY", createdAt: { gte: today } },
    }),
    prisma.permission.findMany({
      where: { approverId: warden.id, approverType: "WARDEN" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true, status: true, type: true, purpose: true, destination: true,
        expectedExit: true, expectedReturn: true, createdAt: true, updatedAt: true,
        rejectionReason: true,
        student: {
          select: {
            studentRoll: true, roomNumber: true,
            profile: { select: { name: true, phone: true } },
          },
        },
        qr: { select: { usedForExit: true, usedForEntry: true, expiresAt: true } },
      },
    }),
    prisma.permission.findMany({
      // Today's requests (resets daily), anything still pending, and hostellers
      // still out on a pass from an earlier day (shown as delayed when late);
      // history is in Activity
      where: {
        approverId: warden.id,
        approverType: "WARDEN",
        OR: [
          { createdAt: { gte: today } },
          { status: "PENDING" },
          { status: "EXITED", type: { not: "ENTRY" }, movements: { none: { type: "ENTRY" } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        student: {
          select: {
            studentRoll: true, department: true, year: true, roomNumber: true, hostelBlock: true,
            profile: { select: { name: true, email: true } },
          },
        },
        qr: { select: { usedForExit: true, usedForEntry: true } },
      },
    }),
    light ? undefined : prisma.student.findMany({
      where: { wardenId: warden.id },
      include: {
        profile: { select: { id: true, name: true, email: true, phone: true, active: true } },
        faculty: { select: { id: true, profile: { select: { name: true } } } },
        warden: { select: { id: true, profile: { select: { name: true } } } },
        permissions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, type: true, purpose: true, createdAt: true },
        },
      },
      orderBy: { studentRoll: "asc" },
    }),
    light ? undefined : prisma.warden.findMany({
      select: { id: true, hostelBlock: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
  ]);

  // Same shape as the faculty/HOD student lists (the warden client reads s.profile.*),
  // plus the latest pass for quick status display.
  const students = studentsRaw?.map(({ permissions, ...s }) => ({
    ...s,
    lastPermission: permissions[0] || null,
  }));

  return {
    dashboard: {
      warden,
      stats: { totalHostellers, pendingCount, approvedToday, rejectedToday, exitsToday, entriesToday },
      recentActivity: recentApprovals,
    },
    requests: allRequests,
    students,
    wardens,
    warden: warden,
  };
}

// ──────────────────────────────────────────────────────────────
// STUDENT PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadStudent(profileId: string) {
  const student = await prisma.student.findUnique({
    where: { profileId },
    select: {
      id: true, studentRoll: true, department: true, year: true, semester: true,
      section: true, studentType: true, hostelType: true, status: true,
      roomNumber: true, hostelBlock: true, wardenId: true,
    },
  });

  if (!student) return { dashboard: null };

  const isHosteller = student.studentType === "HOSTELLER";

  // Students do not choose an approver: day scholars → department HOD,
  // hostellers → assigned warden.
  // Only what the pass screen shows (students have one screen; no pass history
  // is sent — it was the biggest part of every load, for 5,000+ students)
  const [resolution, latestPermission] = await Promise.all([
    resolveStudentApprover(student),
    prisma.permission.findFirst({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, type: true, purpose: true, destination: true,
        exitDate: true, expectedExit: true, expectedReturn: true, endDate: true,
        contactNumber: true, remarks: true, rejectionReason: true,
        approverType: true, approverId: true, createdAt: true, rejectedAt: true,
        passKind: true,
        // The stored QR token is never sent to the browser; the pass screen
        // fetches rotating 60-second tokens instead.
        qr: { select: QR_PUBLIC_SELECT },
        // Recorded return (hostellers scan the same pass to come back)
        movements: { where: { type: "ENTRY" }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  const assignedApprover = resolution.ok
    ? { name: resolution.approver.name, label: resolution.approver.label, available: true }
    : { name: null, label: null, available: false, reason: resolution.error };

  // Hostellers going to the hostel: their department HOD approves
  let hostelPassApprover: typeof assignedApprover | null = null;
  if (isHosteller) {
    const hod = await resolveStudentApprover({ ...student, studentType: "DAY_SCHOLAR" });
    hostelPassApprover = hod.ok
      ? { name: hod.approver.name, label: hod.approver.label, available: true }
      : { name: null, label: null, available: false, reason: hod.error };
  }

  // Name of whoever the latest request was routed to
  let approverName: string | null = null;
  if (latestPermission) {
    if (latestPermission.approverType === "WARDEN") {
      const w = await prisma.warden.findUnique({
        where: { id: latestPermission.approverId },
        select: { profile: { select: { name: true } } },
      });
      approverName = w?.profile.name ?? null;
    } else if (latestPermission.approverType === "FACULTY_ADMIN") {
      const p = await prisma.profile.findUnique({
        where: { id: latestPermission.approverId },
        select: { name: true },
      });
      approverName = p?.name ?? null;
    } else {
      const f = await prisma.faculty.findUnique({
        where: { id: latestPermission.approverId },
        select: { profile: { select: { name: true } } },
      });
      approverName = f?.profile.name ?? null;
    }
  }

  // Determine state
  const now = new Date();
  const isQrValid =
    latestPermission &&
    latestPermission.status === "APPROVED" &&
    latestPermission.qr &&
    latestPermission.qr.active &&
    new Date(latestPermission.qr.expiresAt) > now;

  // Student flow: FORM → PENDING (locked) → QR_CODE (approved) or REJECTED (reason) → FORM
  const REJECTION_VISIBLE_MS = 24 * 60 * 60 * 1000;
  let state: "FORM" | "PENDING" | "QR_CODE" | "REJECTED" = "FORM";
  // Hosteller out on an outing pass: the same QR is shown again for the return scan
  const isOutOnPass =
    !!latestPermission &&
    canScanReturn(
      { ...latestPermission, facultyId: null, studentId: student.id, studentType: student.studentType },
      latestPermission.movements.length > 0
    );
  if (latestPermission && latestPermission.status === "PENDING") {
    state = "PENDING";
  } else if (isQrValid || isOutOnPass) {
    state = "QR_CODE";
  } else if (
    latestPermission?.status === "REJECTED" &&
    latestPermission.rejectedAt &&
    now.getTime() - latestPermission.rejectedAt.getTime() < REJECTION_VISIBLE_MS
  ) {
    state = "REJECTED";
  }

  // QR on screen: its first code comes with this data, so the QR shows the
  // moment the screen opens (no second request before it appears)
  const firstQr =
    state === "QR_CODE" && latestPermission ? await generateLiveQrToken(latestPermission.id).catch(() => null) : null;
  const liveQr =
    firstQr && "token" in firstQr && firstQr.token ? { permissionId: latestPermission!.id, token: firstQr.token } : null;

  // Serialize dates for JSON
  const serializedPermission = latestPermission
    ? {
        ...latestPermission,
        exitDate: latestPermission.exitDate?.toISOString?.() ?? latestPermission.exitDate,
        expectedExit: latestPermission.expectedExit?.toISOString?.() ?? latestPermission.expectedExit,
        expectedReturn: latestPermission.expectedReturn?.toISOString?.() ?? latestPermission.expectedReturn,
        endDate: latestPermission.endDate?.toISOString?.() ?? latestPermission.endDate,
        createdAt: latestPermission.createdAt?.toISOString?.() ?? latestPermission.createdAt,
        approverName,
        qr: latestPermission.qr
          ? {
              ...latestPermission.qr,
              expiresAt: latestPermission.qr.expiresAt?.toISOString?.() ?? latestPermission.qr.expiresAt,
            }
          : null,
      }
    : null;

  const { wardenId: _wardenId, ...studentPublic } = student;

  return {
    dashboard: {
      student: studentPublic,
      isHosteller,
      assignedApprover,
      hostelPassApprover,
      state,
      latestPermission: serializedPermission,
      liveQr,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// SECURITY PRELOAD
// ──────────────────────────────────────────────────────────────

// Security screens (registers, scan, visitors, log) load their own data when
// opened and do not read the store. The store still calls this endpoint every
// 5 minutes to confirm the session, so Security gets an empty payload instead of
// 11 queries (up to ~1,400 rows) that nothing uses.
async function preloadSecurity() {
  return {};
}

// ──────────────────────────────────────────────────────────────
// ADMIN PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadAdmin(light = false) {
  const today = istStartOfDay();

  const endOfDay = new Date(today);
  endOfDay.setDate(endOfDay.getDate() + 1);
  // Monitoring counts run alongside the queries below
  const monitorPromise = getAdminMonitorCounts(today, endOfDay).catch((err) => {
    console.error("[preload] admin counts failed:", err?.message);
    return {};
  });

  const [
    totalStudents, totalFaculty, totalWardens, totalSecurity,
    outsidersCount, approvedToday, rejectedToday, entryToday, exitToday,
    recentMovements, gatesList,
    // Sub-page data
    usersData, usersTotal,
    adminGates, faculty, wardens, allGates,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.faculty.count(),
    prisma.warden.count(),
    prisma.securityStaff.count(),
    prisma.outsider.count({ where: { entryTime: { gte: today, lt: endOfDay } } }),
    prisma.permission.count({
      where: { status: { in: ["APPROVED", "EXITED", "COMPLETED"] }, approvedAt: { gte: today, lt: endOfDay } },
    }),
    prisma.permission.count({
      where: { status: "REJECTED", rejectedAt: { gte: today, lt: endOfDay } },
    }),
    prisma.movement.count({ where: { type: "ENTRY", createdAt: { gte: today, lt: endOfDay } } }),
    prisma.movement.count({ where: { type: "EXIT", createdAt: { gte: today, lt: endOfDay } } }),
    prisma.movement.findMany({
      where: { createdAt: { gte: today, lt: endOfDay } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        permission: { select: { purpose: true, destination: true } },
        student: { include: { profile: { select: { name: true, email: true, phone: true } } } },
        faculty: { select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } } },
        gate: { select: { name: true } },
        securityUser: { include: { profile: { select: { name: true } } } },
      },
    }),
    prisma.gate.findMany({ select: { id: true, name: true, active: true } }),
    // Users page (first page, STUDENT filter — most common)
    prisma.profile.findMany({
      where: { role: "STUDENT" as any },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        student: {
          select: {
            id: true, studentRoll: true, department: true, year: true,
            section: true, studentType: true, status: true,
            roomNumber: true, hostelBlock: true, facultyId: true, wardenId: true,
            faculty: { select: { id: true, profile: { select: { name: true } } } },
            warden: { select: { id: true, profile: { select: { name: true } } } },
          },
        },
        faculty: {
          select: {
            id: true, employeeId: true, department: true, designation: true,
            _count: { select: { assignedStudents: true } },
          },
        },
        warden: {
          select: {
            id: true, employeeId: true, hostelBlock: true,
            _count: { select: { assignedHostellers: true } },
          },
        },
        securityStaff: {
          select: {
            id: true, employeeId: true,
            gate: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.profile.count({ where: { role: "STUDENT" as any } }),
    // Admin gates management
    prisma.gate.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, location: true, active: true, createdAt: true },
    }),
    // Reference data for forms
    light ? undefined : prisma.faculty.findMany({
      select: { id: true, department: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
    light ? undefined : prisma.warden.findMany({
      select: { id: true, hostelBlock: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
    prisma.gate.findMany({ select: { id: true, name: true, active: true } }),
  ]);

  return {
    dashboard: {
      stats: {
        totalStudents, totalFaculty, totalWardens, totalSecurity,
        outsidersCount, approvedToday, rejectedToday, entryToday, exitToday,
        ...(await monitorPromise),
      },
      recentMovements,
      gates: gatesList,
    },
    users: { users: usersData, total: usersTotal },
    adminGates,
    faculty,
    wardens,
    allGates,
  };
}

// ──────────────────────────────────────────────────────────────
// DIRECTOR PRELOAD — Full campus oversight (all departments, all data)
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// SECURITY SUPERVISOR PRELOAD — read-only oversight of student & faculty
// passes and people. The supervisor cannot approve or reject anything.
// ──────────────────────────────────────────────────────────────

/** { "CSE": 120, … } from a student.groupBy on department */
function toDeptCounts(rows: { department: string | null; _count: { _all: number } }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.department || "General"] = (out[r.department || "General"] || 0) + r._count._all;
  return out;
}

async function preloadSupervisor(light = false) {
  const today = istStartOfDay();

  // Requests view = today's work + anything still pending (history is in Activity)
  const requestsWhere = {
    OR: [
      { createdAt: { gte: today } },
      { approvedAt: { gte: today } },
      { rejectedAt: { gte: today } },
      { status: "PENDING" as const },
    ],
  };

  const [
    totalStudents,
    totalFaculty,
    requestsToday,
    pendingStudent,
    pendingFaculty,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    visitorsInside,
    requests,
    students,
    allFaculty,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.profile.count({ where: { role: { in: ["FACULTY", "FACULTY_ADMIN"] } } }),
    prisma.permission.count({ where: { createdAt: { gte: today } } }),
    prisma.permission.count({ where: { status: "PENDING", studentId: { not: null } } }),
    prisma.permission.count({ where: { status: "PENDING", facultyId: { not: null } } }),
    prisma.permission.count({
      where: { status: { in: ["APPROVED", "EXITED", "COMPLETED"] }, approvedAt: { gte: today } },
    }),
    prisma.permission.count({ where: { status: "REJECTED", rejectedAt: { gte: today } } }),
    prisma.movement.count({ where: { type: "EXIT", createdAt: { gte: today } } }),
    prisma.movement.count({ where: { type: "ENTRY", createdAt: { gte: today } } }),
    prisma.outsider.count({ where: { status: "INSIDE" } }),
    prisma.permission.findMany({
      where: requestsWhere,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, type: true, status: true, purpose: true, destination: true,
        exitDate: true, expectedExit: true, expectedReturn: true, contactNumber: true, remarks: true,
        requestType: true, endDate: true, numberOfDays: true, parentInformed: true, videoCallNumber: true,
        guardianName: true, guardianRelation: true, hostelInchargeDetails: true, wardenDetails: true,
        createdAt: true, approvedAt: true, rejectedAt: true, rejectionReason: true,
        approverType: true, approvalMode: true, hodApprovedAt: true, deanApprovedAt: true,
        studentId: true, facultyId: true,
        student: {
          select: {
            studentRoll: true, department: true, year: true, section: true, studentType: true,
            profile: { select: { name: true, phone: true } },
          },
        },
        faculty: {
          select: {
            employeeId: true, department: true, designation: true,
            profile: { select: { name: true, phone: true, role: true } },
          },
        },
        approval: {
          select: {
            approved: true,
            approverType: true,
            faculty: { select: { profile: { select: { name: true } } } },
            warden: { select: { profile: { select: { name: true } } } },
          },
        },
        movements: {
          select: { type: true, createdAt: true, gate: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    // Student directory (same shape as the Director/Dean directory)
    // Student counts per department; the student directory itself is paged on the
    // server (getExecutiveStudents), so the 45-second poll no longer ships every student.
    prisma.student.groupBy({ by: ["department"], _count: { _all: true } }),
    // Faculty & HOD directory
    light ? undefined : prisma.profile.findMany({
      where: { role: { in: ["FACULTY", "FACULTY_ADMIN"] } },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, email: true, phone: true, active: true, role: true,
        faculty: { select: { id: true, department: true, designation: true, employeeId: true, maxApprovals: true } },
      },
    }),
  ]);

  return {
    dashboard: {
      stats: {
        totalStudents,
        totalFaculty,
        requestsToday,
        pendingStudent,
        pendingFaculty,
        approvedToday,
        rejectedToday,
        exitsToday,
        entriesToday,
        visitorsInside,
      },
      recentRequests: requests.slice(0, 8),
    },
    requests,
    studentDeptCounts: toDeptCounts(students),
    allFaculty,
  };
}

async function preloadDirector(profileId: string, light = false) {
  // Director uses Faculty model for their own record (designation, department, employeeId)
  let faculty = await prisma.faculty.findUnique({
    where: { profileId },
    select: { id: true, department: true, designation: true, maxApprovals: true, employeeId: true },
  });

  if (!faculty) {
    faculty = await prisma.faculty.create({
      data: {
        profileId,
        department: "All Departments",
        designation: "Director",
        employeeId: `DIR-${Date.now().toString().slice(-4)}`,
        maxApprovals: 999,
      },
      select: { id: true, department: true, designation: true, maxApprovals: true, employeeId: true },
    });
  }

  const today = istStartOfDay();

  const [
    totalFaculty,
    totalHODs,
    totalStudents,
    totalWardens,
    totalSecurity,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    pendingFacultyPasses,
    allFacultyPasses,
    allFaculty,
    allHODs,
    recentMovements,
    campusStudents,
    recentStudentPasses,
  ] = await Promise.all([
    prisma.profile.count({ where: { role: "FACULTY" } }),
    prisma.profile.count({ where: { role: "FACULTY_ADMIN" } }),
    prisma.student.count(),
    prisma.warden.count(),
    prisma.securityStaff.count(),
    prisma.permission.count({
      where: {
        status: { in: ["APPROVED", "EXITED", "COMPLETED"] },
        approvedAt: { gte: today },
      },
    }),
    prisma.permission.count({
      where: {
        status: "REJECTED",
        rejectedAt: { gte: today },
      },
    }),
    prisma.movement.count({
      where: { type: "EXIT", createdAt: { gte: today } },
    }),
    prisma.movement.count({
      where: { type: "ENTRY", createdAt: { gte: today } },
    }),
    // Pending faculty gate passes (approverType = DIRECTOR or FACULTY_ADMIN faculty passes)
    prisma.permission.count({
      where: {
        status: "PENDING",
        facultyId: { not: null },
      },
    }),
    // All faculty passes for today only (or pending requests)
    prisma.permission.findMany({
      where: {
        facultyId: { not: null },
        OR: [
          { exitDate: { gte: today } },
          { createdAt: { gte: today } },
          { status: "PENDING" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        faculty: {
          select: {
            department: true,
            designation: true,
            employeeId: true,
            profile: { select: { name: true, email: true, phone: true, role: true } },
          },
        },
        qr: { select: { usedForExit: true, usedForEntry: true, expiresAt: true } },
      },
    }),
    // All faculty members
    light ? undefined : prisma.profile.findMany({
      where: { role: { in: ["FACULTY", "FACULTY_ADMIN"] } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        role: true,
        faculty: {
          select: { id: true, department: true, designation: true, employeeId: true, maxApprovals: true },
        },
      },
    }),
    // All HODs specifically
    light ? undefined : prisma.profile.findMany({
      where: { role: "FACULTY_ADMIN" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        role: true,
        faculty: {
          select: { id: true, department: true, designation: true, employeeId: true, maxApprovals: true },
        },
      },
    }),
    // Recent movements (all campus)
    prisma.movement.findMany({
      where: { createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        student: {
          select: {
            studentRoll: true,
            department: true,
            profile: { select: { name: true } },
          },
        },
        faculty: {
          select: {
            department: true,
            designation: true,
            profile: { select: { name: true } },
          },
        },
        gate: { select: { name: true } },
      },
    }),
    // All students campus-wide
    // Student counts per department; the student directory itself is paged on the
    // server (getExecutiveStudents), so the 45-second poll no longer ships every student.
    prisma.student.groupBy({ by: ["department"], _count: { _all: true } }),
    // Recent student passes campus-wide
    prisma.permission.findMany({
      where: { studentId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
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
        },
      },
    }),
  ]);

  const recentActivity = allFacultyPasses.slice(0, 10);

  return {
    dashboard: {
      faculty,
      stats: {
        totalFaculty,
        totalHODs,
        totalStudents,
        totalWardens,
        totalSecurity,
        approvedToday,
        rejectedToday,
        exitsToday,
        entriesToday,
        pendingFacultyPasses,
      },
      recentActivity,
      recentStudentPasses,
    },
    requests: allFacultyPasses,
    allFaculty,
    allHODs,
    allMovements: recentMovements,
    studentDeptCounts: toDeptCounts(campusStudents),
    recentStudentPasses,
  };
}

// ──────────────────────────────────────────────────────────────
// DEAN PRELOAD — All departments oversight, NO Security/Warden data
// ──────────────────────────────────────────────────────────────

async function preloadDean(profileId: string, light = false) {
  let faculty = await prisma.faculty.findUnique({
    where: { profileId },
    select: { id: true, department: true, designation: true, maxApprovals: true, employeeId: true },
  });

  if (!faculty) {
    faculty = await prisma.faculty.create({
      data: {
        profileId,
        department: "All Departments",
        designation: "Dean",
        employeeId: `DEAN-${Date.now().toString().slice(-4)}`,
        maxApprovals: 999,
      },
      select: { id: true, department: true, designation: true, maxApprovals: true, employeeId: true },
    });
  }

  const today = istStartOfDay();

  // Faculty / HOD passes routed to the Dean, or requiring BOTH HOD and Dean
  // (matches the approval scope in server/actions/approvals.ts). Never the Dean's own.
  const deanScope = {
    facultyId: { not: null },
    AND: [
      { facultyId: { not: faculty.id } },
      { OR: [{ approverType: { in: ["DEAN" as const, "DIRECTOR" as const] } }, { approvalMode: "BOTH" }] },
    ],
  };

  const [
    totalFaculty,
    totalHODs,
    totalStudents,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    pendingFacultyPasses,
    allFacultyPasses,
    allFaculty,
    allHODs,
    recentMovements,
    campusStudents,
    recentStudentPasses,
  ] = await Promise.all([
    prisma.profile.count({ where: { role: "FACULTY" } }),
    prisma.profile.count({ where: { role: "FACULTY_ADMIN" } }),
    prisma.student.count(),
    // The Dean only deals with faculty passes sent to the Dean (or to Both):
    // dashboard figures are scoped the same way.
    prisma.permission.count({
      where: { ...deanScope, status: { in: ["APPROVED", "EXITED", "COMPLETED"] }, approvedAt: { gte: today } },
    }),
    prisma.permission.count({
      where: { ...deanScope, status: "REJECTED", rejectedAt: { gte: today } },
    }),
    prisma.movement.count({
      where: { type: "EXIT", createdAt: { gte: today }, permission: deanScope },
    }),
    prisma.movement.count({
      where: { type: "ENTRY", createdAt: { gte: today }, permission: deanScope },
    }),
    prisma.permission.count({
      where: { ...deanScope, status: "PENDING" },
    }),
    // Faculty / HOD passes the Dean is responsible for (today only or pending)
    prisma.permission.findMany({
      where: {
        ...deanScope,
        OR: [
          { exitDate: { gte: today } },
          { createdAt: { gte: today } },
          { status: "PENDING" },
          // Faculty still out on an earlier pass (shown as delayed when late)
          { status: "EXITED", facultyId: { not: null }, type: { not: "ENTRY" }, movements: { none: { type: "ENTRY" } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        faculty: {
          select: {
            department: true,
            designation: true,
            employeeId: true,
            profile: { select: { name: true, email: true, phone: true, role: true } },
          },
        },
        qr: { select: { usedForExit: true, usedForEntry: true, expiresAt: true } },
      },
    }),
    // All faculty (no wardens, no security)
    light ? undefined : prisma.profile.findMany({
      where: { role: { in: ["FACULTY", "FACULTY_ADMIN"] } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        role: true,
        faculty: {
          select: { id: true, department: true, designation: true, employeeId: true, maxApprovals: true },
        },
      },
    }),
    // All HODs specifically
    light ? undefined : prisma.profile.findMany({
      where: { role: "FACULTY_ADMIN" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        role: true,
        faculty: {
          select: { id: true, department: true, designation: true, employeeId: true, maxApprovals: true },
        },
      },
    }),
    // Recent faculty-related movements only (NOT student or outsider)
    prisma.movement.findMany({
      where: {
        createdAt: { gte: today },
        facultyId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        faculty: {
          select: {
            department: true,
            designation: true,
            profile: { select: { name: true } },
          },
        },
        gate: { select: { name: true } },
      },
    }),
    // All students campus-wide
    // Student counts per department; the student directory itself is paged on the
    // server (getExecutiveStudents), so the 45-second poll no longer ships every student.
    prisma.student.groupBy({ by: ["department"], _count: { _all: true } }),
    // Recent student passes campus-wide
    prisma.permission.findMany({
      where: { studentId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
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
        },
      },
    }),
  ]);

  const recentActivity = allFacultyPasses.slice(0, 10);

  return {
    dashboard: {
      faculty,
      stats: {
        totalFaculty,
        totalHODs,
        totalStudents,
        approvedToday,
        rejectedToday,
        exitsToday,
        entriesToday,
        pendingFacultyPasses,
      },
      recentActivity,
      recentStudentPasses,
    },
    requests: allFacultyPasses,
    allFaculty,
    allHODs,
    allMovements: recentMovements,
    studentDeptCounts: toDeptCounts(campusStudents),
    recentStudentPasses,
  };
}

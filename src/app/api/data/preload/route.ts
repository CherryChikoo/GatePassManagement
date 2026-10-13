import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";
import { autoExpireOutdatedPermissions } from "@/lib/permissions/auto-expire";

/**
 * Unified preload endpoint — returns ALL data the logged-in user needs
 * in a single request, keyed by data type.
 *
 * This replaces dozens of individual server-side data-fetching calls
 * and allows the client to cache everything locally in Zustand.
 *
 * GET /api/data/preload
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Proactively clean up any expired passes (time limit ended or previous days)
    await autoExpireOutdatedPermissions();

    switch (user.role) {
      case "FACULTY":
        return NextResponse.json(await preloadFaculty(user.profileId));
      case "WARDEN":
        return NextResponse.json(await preloadWarden(user.profileId));
      case "STUDENT":
        return NextResponse.json(await preloadStudent(user.profileId));
      case "SECURITY":
        return NextResponse.json(await preloadSecurity());
      case "FACULTY_ADMIN":
        return NextResponse.json(await preloadFacultyAdmin(user.profileId));
      case "ADMIN":
        return NextResponse.json(await preloadAdmin());
      case "DIRECTOR":
        return NextResponse.json(await preloadDirector(user.profileId));
      case "DEAN":
        return NextResponse.json(await preloadDean(user.profileId));
      default:
        return NextResponse.json({ error: "Unknown role" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[Preload] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to preload" },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────────────────────
// HOD (FACULTY ADMIN) PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadFacultyAdmin(profileId: string) {
  let faculty = await prisma.faculty.findUnique({
    where: { profileId },
    select: { id: true, department: true, designation: true, maxApprovals: true, employeeId: true },
  });

  if (!faculty) {
    faculty = await prisma.faculty.create({
      data: {
        profileId,
        department: "Computer Science",
        designation: "Head of Department",
        employeeId: `HOD-${Date.now().toString().slice(-4)}`,
        maxApprovals: 50,
      },
      select: { id: true, department: true, designation: true, maxApprovals: true, employeeId: true },
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deptVariants = getDepartmentVariants(faculty.department);
  const deptCondition = deptVariants.length > 0 ? [{ department: { in: deptVariants } }] : [];
  const studentDeptCondition = deptVariants.length > 0 ? [{ student: { department: { in: deptVariants } } }] : [];

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
    myPasses,
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
      where: {
        status: { in: ["APPROVED", "EXITED", "COMPLETED"] },
        approvedAt: { gte: today },
        OR: [
          { approverType: "FACULTY_ADMIN" },
          { approverId: faculty.id },
          { approverId: profileId },
          ...studentDeptCondition,
        ],
      },
    }),
    prisma.permission.count({
      where: {
        status: "REJECTED",
        rejectedAt: { gte: today },
        OR: [
          { approverType: "FACULTY_ADMIN" },
          { approverId: faculty.id },
          { approverId: profileId },
          ...studentDeptCondition,
        ],
      },
    }),
    prisma.movement.count({
      where: {
        type: "EXIT",
        createdAt: { gte: today },
        OR: [
          { facultyId: { not: null } },
          ...studentDeptCondition,
        ],
      },
    }),
    prisma.movement.count({
      where: {
        type: "ENTRY",
        createdAt: { gte: today },
        OR: [
          { facultyId: { not: null } },
          ...studentDeptCondition,
        ],
      },
    }),
    prisma.permission.count({
      where: {
        approverType: "FACULTY_ADMIN",
        status: "PENDING",
      },
    }),
    prisma.permission.count({
      where: {
        status: "PENDING",
        OR: [
          { approverId: faculty.id },
          { approverId: profileId },
          ...studentDeptCondition,
        ],
      },
    }),
    // Combined requests: faculty passes + department student passes
    prisma.permission.findMany({
      where: {
        OR: [
          { approverType: "FACULTY_ADMIN" },
          { approverId: faculty.id },
          { approverId: profileId },
          ...studentDeptCondition,
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
    // Department students
    prisma.student.findMany({
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
    prisma.profile.findMany({
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
    prisma.warden.findMany({
      select: { id: true, hostelBlock: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
    // HOD's own passes
    prisma.permission.findMany({
      where: { facultyId: faculty.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        qr: true,
        movements: { include: { gate: true } },
      },
    }),
    // Movements
    prisma.movement.findMany({
      where: {
        OR: [
          { facultyId: { not: null } },
          ...studentDeptCondition,
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
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
    myPasses,
  };
}

// ──────────────────────────────────────────────────────────────
// FACULTY PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadFaculty(profileId: string) {
  const faculty = await prisma.faculty.findUnique({
    where: { profileId },
    select: { id: true, department: true, designation: true, maxApprovals: true },
  });

  if (!faculty) return { dashboard: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalStudents,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    recentApprovals,
    allRequests,
    studentsData,
    wardens,
    myPasses,
  ] = await Promise.all([
    prisma.student.count({ where: { facultyId: faculty.id } }),
    prisma.permission.count({
      where: {
        approverId: faculty.id,
        status: { in: ["APPROVED", "EXITED", "COMPLETED"] },
        approvedAt: { gte: today },
      },
    }),
    prisma.permission.count({
      where: {
        approverId: faculty.id,
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
    prisma.permission.findMany({
      where: { approverId: faculty.id, approverType: "FACULTY" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true, status: true, type: true, purpose: true, destination: true,
        expectedExit: true, expectedReturn: true, createdAt: true, updatedAt: true,
        rejectionReason: true,
        student: {
          select: {
            studentRoll: true, department: true, year: true, section: true,
            profile: { select: { name: true, phone: true } },
          },
        },
        qr: { select: { usedForExit: true, usedForEntry: true, expiresAt: true } },
      },
    }),
    // All requests for the requests tab (Today only)
    prisma.permission.findMany({
      where: { approverId: faculty.id, approverType: "FACULTY", createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        student: {
          select: {
            studentRoll: true, department: true, year: true, section: true,
            profile: { select: { name: true, email: true } },
          },
        },
        qr: { select: { usedForExit: true, usedForEntry: true } },
      },
    }),
    // Students list
    prisma.student.findMany({
      where: {
        OR: [
          { facultyId: faculty.id },
          ...(faculty.department ? [{ department: { in: getDepartmentVariants(faculty.department) } }] : []),
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
    // Wardens list (for student assignment dropdowns)
    prisma.warden.findMany({
      select: { id: true, hostelBlock: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
    // Faculty's own passes
    prisma.permission.findMany({
      where: { facultyId: faculty.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        qr: true,
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
    requests: allRequests,
    students: studentsData,
    wardens,
    myPasses,
  };
}

// ──────────────────────────────────────────────────────────────
// WARDEN PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadWarden(profileId: string) {
  const warden = await prisma.warden.findUnique({
    where: { profileId },
    select: { id: true, hostelBlock: true },
  });

  if (!warden) return { dashboard: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
      where: { approverId: warden.id, approverType: "WARDEN", createdAt: { gte: today } },
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
    prisma.student.findMany({
      where: { wardenId: warden.id },
      include: {
        profile: true,
        permissions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { studentRoll: "asc" },
    }),
    prisma.warden.findMany({
      select: { id: true, hostelBlock: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
  ]);

  // Transform students to match expected format
  const students = studentsRaw.map((s: any) => ({
    id: s.id,
    name: s.profile.name,
    email: s.profile.email,
    phone: s.profile.phone,
    rollNo: s.studentRoll,
    department: s.department,
    year: s.year,
    section: s.section,
    roomNumber: s.roomNumber,
    active: s.profile.active,
    studentType: s.studentType,
    lastPermission: s.permissions[0] || null,
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
      id: true, studentRoll: true, department: true, year: true,
      section: true, studentType: true, status: true,
      roomNumber: true, hostelBlock: true,
    },
  });

  if (!student) return { dashboard: null };

  const isHosteller = student.studentType === "HOSTELLER";

  // Load approvers + latest permission in parallel
  const [approvers, latestPermission, historyData] = await Promise.all([
    isHosteller
      ? prisma.warden.findMany({
          select: { id: true, hostelBlock: true, profile: { select: { name: true } } },
          orderBy: { profile: { name: "asc" } },
        })
      : prisma.faculty.findMany({
          select: { id: true, department: true, profile: { select: { name: true } } },
          orderBy: { profile: { name: "asc" } },
        }),
    prisma.permission.findFirst({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, type: true, purpose: true, destination: true,
        exitDate: true, expectedExit: true, expectedReturn: true,
        contactNumber: true, remarks: true, rejectionReason: true,
        approverType: true, approverId: true, createdAt: true,
        qr: {
          select: {
            id: true, token: true, expiresAt: true,
            active: true, usedForExit: true, usedForEntry: true,
          },
        },
      },
    }),
    // Pre-fetch first page of history
    Promise.all([
      prisma.permission.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          approval: {
            include: {
              faculty: { include: { profile: true } },
              warden: { include: { profile: true } },
            },
          },
          movements: { include: { gate: true } },
        },
      }),
      prisma.permission.count({ where: { studentId: student.id } }),
    ]),
  ]);

  // Resolve approver name
  let approverName: string | null = null;
  if (latestPermission) {
    const match = approvers.find((a: any) => a.id === latestPermission.approverId);
    approverName = (match as any)?.profile?.name || (isHosteller ? "Hostel Warden" : "Faculty Incharge");
  }

  // Determine state
  const now = new Date();
  const isQrValid =
    latestPermission &&
    latestPermission.status === "APPROVED" &&
    latestPermission.qr &&
    latestPermission.qr.active &&
    new Date(latestPermission.qr.expiresAt) > now;

  let state: "FORM" | "PENDING" | "QR_CODE" = "FORM";
  if (latestPermission && latestPermission.status === "PENDING") {
    state = "PENDING";
  } else if (isQrValid) {
    state = "QR_CODE";
  }

  // Serialize dates for JSON
  const serializedPermission = latestPermission
    ? {
        ...latestPermission,
        exitDate: latestPermission.exitDate?.toISOString?.() ?? latestPermission.exitDate,
        expectedExit: latestPermission.expectedExit?.toISOString?.() ?? latestPermission.expectedExit,
        expectedReturn: latestPermission.expectedReturn?.toISOString?.() ?? latestPermission.expectedReturn,
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

  return {
    dashboard: {
      student,
      isHosteller,
      approvers,
      state,
      latestPermission: serializedPermission,
    },
    formData: { isHosteller, approvers },
    history: { permissions: historyData[0], total: historyData[1] },
  };
}

// ──────────────────────────────────────────────────────────────
// SECURITY PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadSecurity() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endOfDay = new Date(today);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [
    outsiderVisitsToday,
    studentExitsToday,
    studentEntriesToday,
    outsidersInside,
    recentMovements,
    gates,
    logEntries,
    logExits,
    logOutsiders,
    outsidersInsideList,
    outsidersHistory,
  ] = await Promise.all([
    prisma.outsider.count({ where: { createdAt: { gte: today } } }),
    prisma.movement.count({ where: { type: "EXIT", createdAt: { gte: today } } }),
    prisma.movement.count({ where: { type: "ENTRY", createdAt: { gte: today } } }),
    prisma.outsider.count({ where: { status: "INSIDE" } }),
    prisma.movement.findMany({
      where: { createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, type: true, createdAt: true, notes: true,
        student: { select: { studentRoll: true, profile: { select: { name: true } } } },
        gate: { select: { name: true } },
        permission: { select: { purpose: true, destination: true } },
      },
    }),
    prisma.gate.findMany({
      where: { active: true },
      select: { id: true, name: true, location: true },
    }),
    // Security log data (today)
    prisma.movement.findMany({
      where: { type: "ENTRY", createdAt: { gte: today, lt: endOfDay } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, createdAt: true, notes: true, imagePath: true,
        student: { select: { studentRoll: true, profile: { select: { name: true, phone: true } } } },
        gate: { select: { name: true } },
        permission: { select: { purpose: true, destination: true } },
      },
    }),
    prisma.movement.findMany({
      where: { type: "EXIT", createdAt: { gte: today, lt: endOfDay } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, createdAt: true, notes: true, imagePath: true,
        student: { select: { studentRoll: true, profile: { select: { name: true, phone: true } } } },
        gate: { select: { name: true } },
        permission: { select: { purpose: true, destination: true } },
      },
    }),
    prisma.outsider.findMany({
      where: { entryTime: { gte: today, lt: endOfDay } },
      orderBy: { entryTime: "desc" },
    }),
    // Outsiders management data
    prisma.outsider.findMany({
      where: { status: "INSIDE", entryTime: { gte: today } },
      orderBy: { entryTime: "desc" },
    }),
    prisma.outsider.findMany({
      where: { status: "EXITED", entryTime: { gte: today } },
      orderBy: { exitTime: "desc" },
    }),
  ]);

  const todayStr = today.toISOString().split("T")[0];

  return {
    dashboard: {
      stats: { outsiderVisitsToday, studentExitsToday, studentEntriesToday, outsidersInside },
      recentMovements,
      gates,
    },
    log: {
      studentEntries: logEntries,
      studentExits: logExits,
      outsiderVisits: logOutsiders,
      selectedDate: todayStr,
    },
    outsiders: {
      success: true,
      inside: outsidersInsideList,
      history: outsidersHistory,
    },
    gates,
  };
}

// ──────────────────────────────────────────────────────────────
// ADMIN PRELOAD
// ──────────────────────────────────────────────────────────────

async function preloadAdmin() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endOfDay = new Date(today);
  endOfDay.setDate(endOfDay.getDate() + 1);

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
    prisma.faculty.findMany({
      select: { id: true, department: true, profile: { select: { name: true } } },
      orderBy: { profile: { name: "asc" } },
    }),
    prisma.warden.findMany({
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

async function preloadDirector(profileId: string) {
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
    myPasses,
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
    prisma.profile.findMany({
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
    prisma.profile.findMany({
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
    // Director's own passes
    prisma.permission.findMany({
      where: { facultyId: faculty.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        qr: true,
        movements: { include: { gate: true } },
      },
    }),
    // All students campus-wide
    prisma.student.findMany({
      orderBy: { studentRoll: "asc" },
      include: {
        profile: { select: { id: true, name: true, email: true, phone: true, active: true } },
        faculty: { select: { id: true, department: true, profile: { select: { name: true } } } },
        warden: { select: { id: true, hostelBlock: true, profile: { select: { name: true } } } },
      },
    }),
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
    students: campusStudents,
    recentStudentPasses,
    myPasses,
  };
}

// ──────────────────────────────────────────────────────────────
// DEAN PRELOAD — All departments oversight, NO Security/Warden data
// ──────────────────────────────────────────────────────────────

async function preloadDean(profileId: string) {
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
    myPasses,
    campusStudents,
    recentStudentPasses,
  ] = await Promise.all([
    prisma.profile.count({ where: { role: "FACULTY" } }),
    prisma.profile.count({ where: { role: "FACULTY_ADMIN" } }),
    prisma.student.count(),
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
    prisma.permission.count({
      where: {
        status: "PENDING",
        facultyId: { not: null },
      },
    }),
    // Faculty passes only (today only or pending)
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
    // All faculty (no wardens, no security)
    prisma.profile.findMany({
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
    prisma.profile.findMany({
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
    // Dean's own passes
    prisma.permission.findMany({
      where: { facultyId: faculty.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        qr: true,
        movements: { include: { gate: true } },
      },
    }),
    // All students campus-wide
    prisma.student.findMany({
      orderBy: { studentRoll: "asc" },
      include: {
        profile: { select: { id: true, name: true, email: true, phone: true, active: true } },
        faculty: { select: { id: true, department: true, profile: { select: { name: true } } } },
        warden: { select: { id: true, hostelBlock: true, profile: { select: { name: true } } } },
      },
    }),
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
    students: campusStudents,
    recentStudentPasses,
    myPasses,
  };
}

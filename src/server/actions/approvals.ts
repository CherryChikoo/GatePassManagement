"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { generateQrToken } from "@/lib/qr/token";
import { revalidatePath } from "next/cache";
import { getDepartmentVariants } from "@/lib/constants";

// In-memory dashboard caches for faculty and warden (15s TTL)
const facultyDashboardCache = new Map<string, { data: any; expiresAt: number }>();
const wardenDashboardCache = new Map<string, { data: any; expiresAt: number }>();

export async function invalidateApprovalsCache() {
  facultyDashboardCache.clear();
  wardenDashboardCache.clear();
}

/**
 * Faculty/Warden approves or rejects a permission request
 */
export async function handleApproval(
  permissionId: string,
  action: "APPROVE" | "REJECT",
  reason?: string,
  expiryMinutes?: number
) {
  const user = await requireRole("FACULTY", "WARDEN", "FACULTY_ADMIN", "DIRECTOR", "DEAN");

  // Determine role
  const isFaculty = user.role === "FACULTY";
  const isFacultyAdmin = user.role === "FACULTY_ADMIN";
  const isDirector = user.role === "DIRECTOR";
  const isDean = user.role === "DEAN";
  
  let approverRecord = null;
  let hodFacultyRecord = null;
  if (isFaculty || isDirector || isDean) {
    approverRecord = await prisma.faculty.findUnique({
      where: { profileId: user.profileId },
      select: { id: true, maxApprovals: true },
    });
  } else if (isFacultyAdmin) {
    approverRecord = await prisma.profile.findUnique({
      where: { id: user.profileId },
      select: { id: true },
    });
    hodFacultyRecord = await prisma.faculty.findUnique({
      where: { profileId: user.profileId },
      select: { id: true, department: true },
    });
  } else {
    approverRecord = await prisma.warden.findUnique({
      where: { profileId: user.profileId },
      select: { id: true },
    });
  }

  if (!approverRecord) {
    return { error: "Approver record not found" };
  }

  let permission = null;
  if (isDirector || isDean) {
    // Director and Dean can only approve faculty passes across campus
    permission = await prisma.permission.findFirst({
      where: {
        id: permissionId,
        status: "PENDING",
        facultyId: { not: null },
      },
      include: {
        student: {
          select: { id: true, profileId: true },
        },
        faculty: {
          select: { id: true, profileId: true },
        },
      },
    });
  } else if (isFacultyAdmin) {
    const deptVariants = hodFacultyRecord?.department
      ? getDepartmentVariants(hodFacultyRecord.department)
      : [];

    permission = await prisma.permission.findFirst({
      where: {
        id: permissionId,
        status: "PENDING",
        OR: [
          { approverType: "FACULTY_ADMIN" },
          { approverId: user.profileId },
          ...(hodFacultyRecord ? [{ approverId: hodFacultyRecord.id }] : []),
          ...(deptVariants.length > 0
            ? [{ student: { department: { in: deptVariants } } }]
            : hodFacultyRecord?.department
            ? [{ student: { department: hodFacultyRecord.department } }]
            : []),
        ],
      },
      include: {
        student: {
          select: { id: true, profileId: true },
        },
        faculty: {
          select: { id: true, profileId: true },
        },
      },
    });

    // Fallback: If HOD sees it in their portal, allow processing the pending request
    if (!permission) {
      permission = await prisma.permission.findFirst({
        where: {
          id: permissionId,
          status: "PENDING",
        },
        include: {
          student: {
            select: { id: true, profileId: true },
          },
          faculty: {
            select: { id: true, profileId: true },
          },
        },
      });
    }
  } else {
    permission = await prisma.permission.findFirst({
      where: {
        id: permissionId,
        approverId: approverRecord.id,
        status: "PENDING",
      },
      include: {
        student: {
          select: { id: true, profileId: true },
        },
        faculty: {
          select: { id: true, profileId: true },
        }
      },
    });
  }

  if (!permission) {
    return { error: "Permission request not found or already processed" };
  }

  if (action === "REJECT" && (!reason || reason.trim().length === 0)) {
    return { error: "A reason is required when rejecting a request" };
  }

  if (action === "REJECT") {
    await prisma.$transaction([
      prisma.permission.update({
        where: { id: permissionId },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectionReason: reason || "Request denied",
        },
      }),
      prisma.permissionApproval.upsert({
        where: { permissionId },
        create: {
          permissionId,
          approverType: user.role as any,
          facultyId: (isFaculty || isDirector || isDean) ? approverRecord.id : (isFacultyAdmin ? (hodFacultyRecord?.id || null) : null),
          wardenId: (!isFaculty && !isFacultyAdmin && !isDirector && !isDean) ? approverRecord.id : null,
          approved: false,
          reason: reason || "Request denied",
        },
        update: {
          approverType: user.role as any,
          facultyId: (isFaculty || isDirector || isDean) ? approverRecord.id : (isFacultyAdmin ? (hodFacultyRecord?.id || null) : null),
          wardenId: (!isFaculty && !isFacultyAdmin && !isDirector && !isDean) ? approverRecord.id : null,
          approved: false,
          reason: reason || "Request denied",
        },
      })
    ]);

    invalidateApprovalsCache();
    revalidatePath("/faculty");
    revalidatePath("/faculty/requests");
    revalidatePath("/warden");
    revalidatePath("/warden/requests");
    revalidatePath("/faculty-admin");
    revalidatePath("/faculty-admin/requests");
    revalidatePath("/director");
    revalidatePath("/director/requests");
    revalidatePath("/dean");
    revalidatePath("/dean/requests");
    revalidatePath("/student");
    return { success: true, action: "REJECTED" };
  }

  // APPROVE flow
  // Generate QR credential
  let expiresAt: Date;
  if (expiryMinutes) {
    expiresAt = new Date(Date.now() + expiryMinutes * 60000);
  } else {
    // Default fallback to 1 hour
    expiresAt = new Date(Date.now() + 60 * 60000); 
  }

  const qrTargetId = permission.studentId || permission.facultyId;
  if (!qrTargetId) return { error: "No student or faculty attached to permission" };

  const { token, tokenId } = await generateQrToken(
    permissionId,
    qrTargetId,
    expiresAt as Date
  );

  await prisma.$transaction([
    prisma.permission.update({
      where: { id: permissionId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
      },
    }),
    prisma.permissionApproval.upsert({
      where: { permissionId },
      create: {
        permissionId,
        approverType: user.role as any,
        facultyId: (isFaculty || isDirector || isDean) ? approverRecord.id : (isFacultyAdmin ? (hodFacultyRecord?.id || null) : null),
        wardenId: (!isFaculty && !isFacultyAdmin && !isDirector && !isDean) ? approverRecord.id : null,
        approved: true,
        reason: reason || null,
      },
      update: {
        approverType: user.role as any,
        facultyId: (isFaculty || isDirector || isDean) ? approverRecord.id : (isFacultyAdmin ? (hodFacultyRecord?.id || null) : null),
        wardenId: (!isFaculty && !isFacultyAdmin && !isDirector && !isDean) ? approverRecord.id : null,
        approved: true,
        reason: reason || null,
      },
    }),
    prisma.qrCredential.upsert({
      where: { permissionId },
      create: {
        permissionId,
        token,
        expiresAt: expiresAt as Date,
        active: true,
      },
      update: {
        token,
        expiresAt: expiresAt as Date,
        active: true,
        usedForExit: false,
        usedForEntry: false,
      },
    })
  ]);

  invalidateApprovalsCache();
  revalidatePath("/faculty");
  revalidatePath("/faculty/requests");
  revalidatePath("/warden");
  revalidatePath("/warden/requests");
  revalidatePath("/faculty-admin");
  revalidatePath("/faculty-admin/requests");
  revalidatePath("/director");
  revalidatePath("/director/requests");
  revalidatePath("/dean");
  revalidatePath("/dean/requests");
  revalidatePath("/student");
  revalidatePath("/student/qr");
  return { success: true, action: "APPROVED" };
}

/**
 * Batch approval — approve up to 5 permissions concurrently
 */
export async function batchApproval(
  permissionIds: string[],
  action: "APPROVE" | "REJECT",
  reason?: string
) {
  const user = await requireRole("FACULTY", "WARDEN", "FACULTY_ADMIN", "DIRECTOR", "DEAN");

  if (!permissionIds || permissionIds.length === 0) {
    return { error: "No requests selected" };
  }

  if (permissionIds.length > 5) {
    return { error: "Maximum 5 requests can be processed at once" };
  }

  // Execute up to 5 requests concurrently in parallel
  const results = await Promise.all(
    permissionIds.map(async (id) => {
      try {
        const res = await handleApproval(id, action, reason);
        return {
          id,
          success: !res?.error,
          error: res?.error,
        };
      } catch (err: any) {
        return {
          id,
          success: false,
          error: err?.message || "Failed to process request",
        };
      }
    })
  );

  invalidateApprovalsCache();
  revalidatePath("/faculty");
  revalidatePath("/faculty/requests");
  revalidatePath("/warden");
  revalidatePath("/warden/requests");
  revalidatePath("/faculty-admin");
  revalidatePath("/faculty-admin/requests");
  revalidatePath("/director");
  revalidatePath("/director/requests");
  revalidatePath("/dean");
  revalidatePath("/dean/requests");
  revalidatePath("/student");
  revalidatePath("/student/qr");

  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    return {
      success: false,
      error: failures.map((f) => f.error).filter(Boolean)[0] || "Some requests failed to process",
      results,
    };
  }

  return { success: true, results };
}

/**
 * Get all requests for faculty (up to 100)
 */
export async function getFacultyAllRequests() {
  const user = await requireRole("FACULTY");

  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!faculty) return [];

  return prisma.permission.findMany({
    where: {
      approverId: faculty.id,
      approverType: "FACULTY",
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: {
        select: {
          studentRoll: true,
          department: true,
          year: true,
          section: true,
          profile: {
            select: { name: true, email: true },
          },
        },
      },
      qr: {
        select: {
          usedForExit: true,
          usedForEntry: true,
        },
      },
    },
  });
}

/**
 * Get all requests for warden (up to 100)
 */
export async function getWardenAllRequests() {
  const user = await requireRole("WARDEN");

  const warden = await prisma.warden.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!warden) return [];

  return prisma.permission.findMany({
    where: {
      approverId: warden.id,
      approverType: "WARDEN",
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: {
        select: {
          studentRoll: true,
          department: true,
          year: true,
          roomNumber: true,
          hostelBlock: true,
          profile: {
            select: { name: true, email: true },
          },
        },
      },
      qr: {
        select: {
          usedForExit: true,
          usedForEntry: true,
        },
      },
    },
  });
}

/**
 * Get faculty dashboard stats
 */
export async function getFacultyDashboard() {
  const user = await requireRole("FACULTY");

  const cached = facultyDashboardCache.get(user.profileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, department: true, designation: true, maxApprovals: true },
  });

  if (!faculty) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalStudents,
    approvedToday,
    rejectedToday,
    exitsToday,
    entriesToday,
    recentApprovals,
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
      take: 10, // Only 10 for dashboard display (was 100 - massive waste)
      select: { // Use select instead of include for better performance
        id: true,
        status: true,
        type: true,
        purpose: true,
        destination: true,
        expectedExit: true,
        expectedReturn: true,
        createdAt: true,
        updatedAt: true,
        rejectionReason: true,
        student: {
          select: {
            studentRoll: true,
            department: true,
            year: true,
            section: true,
            profile: { select: { name: true, phone: true } },
          },
        },
        qr: {
          select: {
            usedForExit: true,
            usedForEntry: true,
            expiresAt: true,
          }
        }
      },
    }),
  ]);

  const result = {
    faculty,
    stats: {
      totalStudents,
      approvedToday,
      rejectedToday,
      exitsToday,
      entriesToday,
    },
    recentActivity: recentApprovals,
  };

  // Cache the result for 15 seconds
  facultyDashboardCache.set(user.profileId, {
    data: result,
    expiresAt: Date.now() + 15000, // 15 seconds cache
  });

  return result;
}

/**
 * Get warden dashboard stats
 */
export async function getWardenDashboard() {
  const user = await requireRole("WARDEN");  const cached = wardenDashboardCache.get(user.profileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const warden = await prisma.warden.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, hostelBlock: true },
  });

  if (!warden) return null;

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
        where: {
          approverId: warden.id,
          status: "REJECTED",
          rejectedAt: { gte: today },
        },
      }),
      prisma.movement.count({
        where: {
          student: { wardenId: warden.id },
          type: "EXIT",
          createdAt: { gte: today },
        },
      }),
      prisma.movement.count({
        where: {
          student: { wardenId: warden.id },
          type: "ENTRY",
          createdAt: { gte: today },
        },
      }),
      prisma.permission.findMany({
        where: { approverId: warden.id, approverType: "WARDEN" },
        orderBy: { updatedAt: "desc" },
        take: 10, // Only 10 for dashboard display (was 100)
        select: { // Use select instead of include
          id: true,
          status: true,
          type: true,
          purpose: true,
          destination: true,
          expectedExit: true,
          expectedReturn: true,
          createdAt: true,
          updatedAt: true,
          rejectionReason: true,
          student: {
            select: {
              studentRoll: true,
              roomNumber: true,
              profile: { select: { name: true, phone: true } },
            },
          },
          qr: {
            select: {
              usedForExit: true,
              usedForEntry: true,
              expiresAt: true,
            }
          }
        },
      }),
    ]);

  const result = {
    warden,
    stats: { 
      totalHostellers, 
      approvedToday,
      rejectedToday,
      exitsToday,
      entriesToday,
    },
    recentActivity: recentApprovals,
  };

  // Cache the result for 15 seconds
  wardenDashboardCache.set(user.profileId, {
    data: result,
    expiresAt: Date.now() + 15000, // 15 seconds cache
  });

  return result;
}

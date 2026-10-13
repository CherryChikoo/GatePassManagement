"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole, getAuthUser } from "@/lib/auth/helpers";
import { permissionRequestSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { getAllFaculty, getAllWardens } from "./admin";
import { resolveStudentActivePass } from "@/lib/permissions/auto-expire";

// In-memory student dashboard cache (10s TTL)
const studentDashboardCache = new Map<string, { data: any; expiresAt: number }>();

export async function invalidateStudentDashboardCache(profileId?: string) {
  if (profileId) {
    studentDashboardCache.delete(profileId);
  } else {
    studentDashboardCache.clear();
  }
}

/**
 * Lightweight function to get only form data (approvers + isHosteller)
 * Optimized for fast navigation between EXIT/ENTRY forms
 * Cached for 30 seconds to minimize DB queries
 */
export async function getStudentFormData() {
  const user = await requireRole("STUDENT");

  // Check cache first
  const cacheKey = `form-${user.profileId}`;
  const cached = studentDashboardCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // Fetch fresh data
  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: {
      id: true,
      studentType: true,
    },
  });

  if (!student) return null;

  const isHosteller = student.studentType === "HOSTELLER";
  const approvers = isHosteller ? await getAllWardens() : await getAllFaculty();

  const data = {
    isHosteller,
    approvers,
  };

  // Cache for 30 seconds
  studentDashboardCache.set(cacheKey, {
    data,
    expiresAt: now + 30000,
  });

  return data;
}

/**
 * Student submits a new ENTRY permission request
 */
export async function createEntryRequest(formData: FormData) {
  const user = await requireRole("STUDENT");

  const raw = {
    purpose: (formData.get("purpose") as string) || "",
    destination: (formData.get("destination") as string) || "",
    exitDate: (formData.get("exitDate") as string) || "",
    expectedExit: (formData.get("expectedExit") as string) || "",
    contactNumber: (formData.get("contactNumber") as string) || "",
    remarks: (formData.get("remarks") as string) || "",
    approverId: (formData.get("approverId") as string) || "",
  };

  const parsed = permissionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Validate approverId
  if (!raw.approverId) {
    return { error: "Please select a faculty/warden approver." };
  }

  // Get student record
  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: {
      id: true,
      studentType: true,
    },
  });

  if (!student) {
    return { error: "Student record not found. Contact admin." };
  }

  // Check for any truly active permission (auto-expires if QR validity or day ended)
  const existingActive = await resolveStudentActivePass(student.id);

  if (existingActive) {
    const approverName = existingActive.approval?.faculty?.profile.name || 
                        existingActive.approval?.warden?.profile.name || 
                        "your approver";

    if (existingActive.status === "PENDING") {
      return {
        error: `You already have a pending permission request waiting for approval from ${approverName}. Please wait for approval or cancel it first.`,
      };
    }
    if (existingActive.status === "APPROVED") {
      return {
        error: "You have an approved gate pass. Please use your QR code before requesting another permission.",
      };
    }
  }

  // Determine approver type based on student type
  const approverType = student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY";

  // Verify the selected approver exists and is of the correct type
  if (approverType === "FACULTY") {
    const faculty = await prisma.faculty.findUnique({
      where: { id: raw.approverId },
      select: { id: true },
    });
    if (!faculty) {
      return { error: "Invalid faculty selected." };
    }
  } else {
    const warden = await prisma.warden.findUnique({
      where: { id: raw.approverId },
      select: { id: true },
    });
    if (!warden) {
      return { error: "Invalid warden selected." };
    }
  }

  // Build the datetime values
  const exitDate = new Date(parsed.data.exitDate);
  // Prevent requests for past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (exitDate < today) {
    return { error: "Entry date cannot be in the past." };
  }

  const [exitH, exitM] = parsed.data.expectedExit.split(":").map(Number);
  const expectedExit = new Date(exitDate);
  expectedExit.setHours(exitH, exitM, 0, 0);

  // Create the ENTRY permission request
  const permission = await prisma.permission.create({
    data: {
      studentId: student.id,
      approverType,
      approverId: raw.approverId,
      type: "ENTRY", // Mark as ENTRY type
      purpose: parsed.data.purpose,
      destination: parsed.data.destination,
      exitDate,
      expectedExit,
      expectedReturn: null, // No return time for ENTRY
      contactNumber: parsed.data.contactNumber || null,
      remarks: parsed.data.remarks || null,
      status: "PENDING",
    },
  });

  invalidateStudentDashboardCache(user.profileId);
  revalidatePath("/student");
  revalidatePath("/student/history");
  revalidatePath("/faculty");
  revalidatePath("/faculty/requests");
  revalidatePath("/warden");
  revalidatePath("/warden/requests");

  return { success: true, permissionId: permission.id };
}

/**
 * Student submits a new permission request
 */
export async function createPermissionRequest(formData: FormData) {
  const user = await requireRole("STUDENT");

  const raw = {
    purpose: (formData.get("purpose") as string) || "",
    destination: (formData.get("destination") as string) || "",
    exitDate: (formData.get("exitDate") as string) || "",
    expectedExit: (formData.get("expectedExit") as string) || "",
    expectedReturn: (formData.get("expectedReturn") as string) || "",
    contactNumber: (formData.get("contactNumber") as string) || "",
    remarks: (formData.get("remarks") as string) || "",
    approverId: (formData.get("approverId") as string) || "",
  };

  const parsed = permissionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Validate approverId
  if (!raw.approverId) {
    return { error: "Please select a faculty/warden approver." };
  }

  // Get student record
  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: {
      id: true,
      studentType: true,
    },
  });

  if (!student) {
    return { error: "Student record not found. Contact admin." };
  }

  // Check for any truly active permission (auto-expires if QR validity or day ended)
  const existingActive = await resolveStudentActivePass(student.id);

  if (existingActive) {
    const approverName = existingActive.approval?.faculty?.profile.name || 
                        existingActive.approval?.warden?.profile.name || 
                        "your approver";

    if (existingActive.status === "PENDING") {
      return {
        error: `You already have a pending permission request waiting for approval from ${approverName}. Please wait for approval or cancel it first.`,
      };
    }
    if (existingActive.status === "APPROVED") {
      return {
        error: "You have an approved gate pass. Please use your QR code to exit before requesting another permission.",
      };
    }
  }

  // Determine approver type based on student type
  const approverType = student.studentType === "HOSTELLER" ? "WARDEN" : "FACULTY";

  // Verify the selected approver exists and is of the correct type
  if (approverType === "FACULTY") {
    const faculty = await prisma.faculty.findUnique({
      where: { id: raw.approverId },
      select: { id: true },
    });
    if (!faculty) {
      return { error: "Invalid faculty selected." };
    }
  } else {
    const warden = await prisma.warden.findUnique({
      where: { id: raw.approverId },
      select: { id: true },
    });
    if (!warden) {
      return { error: "Invalid warden selected." };
    }
  }

  // Build the datetime values
  const exitDate = new Date(parsed.data.exitDate);
  // Prevent requests for past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (exitDate < today) {
    return { error: "Exit date cannot be in the past." };
  }

  const [exitH, exitM] = parsed.data.expectedExit.split(":").map(Number);
  const expectedExit = new Date(exitDate);
  expectedExit.setHours(exitH, exitM, 0, 0);

  let expectedReturn: Date | null = null;
  if (parsed.data.expectedReturn) {
    const [retH, retM] = parsed.data.expectedReturn.split(":").map(Number);
    expectedReturn = new Date(exitDate);
    expectedReturn.setHours(retH, retM, 0, 0);
    // If return is earlier than exit, assume next day
    if (expectedReturn <= expectedExit) {
      expectedReturn.setDate(expectedReturn.getDate() + 1);
    }
  }

  // Create the permission request
  const permission = await prisma.permission.create({
    data: {
      studentId: student.id,
      approverType,
      approverId: raw.approverId, // Use selected approver
      purpose: parsed.data.purpose,
      destination: parsed.data.destination,
      exitDate,
      expectedExit,
      expectedReturn,
      contactNumber: parsed.data.contactNumber || null,
      remarks: parsed.data.remarks || null,
      status: "PENDING",
    },
  });

  // Audit log removed
  invalidateStudentDashboardCache(user.profileId);
  revalidatePath("/student");
  revalidatePath("/student/history");
  revalidatePath("/faculty");
  revalidatePath("/faculty/requests");
  revalidatePath("/warden");
  revalidatePath("/warden/requests");

  return { success: true, permissionId: permission.id };
}

/**
 * Student cancels their own pending request
 */
export async function cancelPermissionRequest(permissionId: string) {
  const user = await requireRole("STUDENT");

  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!student) return { error: "Student not found" };

  const permission = await prisma.permission.findFirst({
    where: {
      id: permissionId,
      studentId: student.id,
      status: "PENDING",
    },
  });

  if (!permission) {
    return { error: "Request not found or cannot be cancelled" };
  }

  await prisma.permission.update({
    where: { id: permissionId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  invalidateStudentDashboardCache(user.profileId);
  revalidatePath("/student");
  revalidatePath("/student/history");
  return { success: true };
}

/**
 * Get student's permissions
 */
export async function getStudentPermissions(page: number = 1, pageSize: number = 25) {
  const user = await requireRole("STUDENT");

  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!student) return { permissions: [], total: 0 };

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        purpose: true,
        destination: true,
        exitDate: true,
        expectedExit: true,
        expectedReturn: true,
        approverType: true,
        rejectionReason: true,
        approvedAt: true,
        rejectedAt: true,
        createdAt: true,
      },
    }),
    prisma.permission.count({ where: { studentId: student.id } }),
  ]);

  return { permissions, total };
}

/**
 * Get active QR for student (if any approved permission exists)
 */
export async function getStudentActiveQr() {
  const user = await requireRole("STUDENT");

  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!student) return null;

  const activePermission = await prisma.permission.findFirst({
    where: {
      studentId: student.id,
      status: { in: ["APPROVED", "EXITED"] },
    },
    include: {
      qr: {
        select: {
          id: true,
          token: true,
          expiresAt: true,
          active: true,
          usedForExit: true,
          usedForEntry: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!activePermission || !activePermission.qr) return null;

  return {
    permission: {
      id: activePermission.id,
      status: activePermission.status,
      purpose: activePermission.purpose,
      destination: activePermission.destination,
      expectedExit: activePermission.expectedExit,
      expectedReturn: activePermission.expectedReturn,
    },
    qr: activePermission.qr,
  };
}

/**
 * Get student dashboard data
 */
export async function getStudentDashboard() {
  const user = await requireRole("STUDENT");

  const cached = studentDashboardCache.get(user.profileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
    select: {
      id: true,
      studentRoll: true,
      department: true,
      year: true,
      section: true,
      studentType: true,
      status: true,
      roomNumber: true,
      hostelBlock: true,
    },
  });

  if (!student) return null;

  // 1. Approvers list for permission form
  const isHosteller = student.studentType === "HOSTELLER";
  const approvers = isHosteller ? await getAllWardens() : await getAllFaculty();

  // 2. Fetch latest permission request with approver name in single query
  const latestPermission = await prisma.permission.findFirst({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      type: true,
      purpose: true,
      destination: true,
      exitDate: true,
      expectedExit: true,
      expectedReturn: true,
      contactNumber: true,
      remarks: true,
      rejectionReason: true,
      approverType: true,
      approverId: true,
      createdAt: true,
      qr: {
        select: {
          id: true,
          token: true,
          expiresAt: true,
          active: true,
          usedForExit: true,
          usedForEntry: true,
        },
      },
    },
  });

  // 3. Resolve approver display name from cache first, fallback to DB
  let approverName: string | null = null;
  if (latestPermission) {
    // Try to find approver from cached lists instead of separate query
    if (latestPermission.approverType === "FACULTY") {
      const f = approvers.find((a: any) => a.id === latestPermission.approverId);
      approverName = f?.name || "Faculty Incharge";
    } else {
      const w = approvers.find((a: any) => a.id === latestPermission.approverId);
      approverName = w?.name || "Hostel Warden";
    }
  }

  // 4. Determine state: "FORM" | "PENDING" | "QR_CODE"
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
  } else {
    state = "FORM";
  }

  const result = {
    student,
    isHosteller,
    approvers,
    state,
    latestPermission: latestPermission
      ? {
          id: latestPermission.id,
          status: latestPermission.status,
          purpose: latestPermission.purpose,
          destination: latestPermission.destination,
          exitDate: latestPermission.exitDate.toISOString(),
          expectedExit: latestPermission.expectedExit ? latestPermission.expectedExit.toISOString() : null,
          expectedReturn: latestPermission.expectedReturn ? latestPermission.expectedReturn.toISOString() : null,
          contactNumber: latestPermission.contactNumber,
          remarks: latestPermission.remarks,
          rejectionReason: latestPermission.rejectionReason,
          approverType: latestPermission.approverType,
          approverName,
          createdAt: latestPermission.createdAt.toISOString(),
          qr: latestPermission.qr
            ? {
                id: latestPermission.qr.id,
                token: latestPermission.qr.token,
                expiresAt: latestPermission.qr.expiresAt.toISOString(),
                active: latestPermission.qr.active,
                usedForExit: latestPermission.qr.usedForExit,
                usedForEntry: latestPermission.qr.usedForEntry,
              }
            : null,
        }
      : null,
  };

  // Cache the result for 60 seconds (was 10s - too short)
  studentDashboardCache.set(user.profileId, {
    data: result,
    expiresAt: Date.now() + 60000, // 60 seconds cache
  });

  return result;
}


export async function getStudentHistory(page = 1, limit = 25) {
  const user = await requireRole("STUDENT");
  
  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId },
  });
  
  if (!student) {
    throw new Error("Student record not found");
  }

  const skip = (page - 1) * limit;

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        approval: {
          include: {
            faculty: { include: { profile: true } },
            warden: { include: { profile: true } },
          },
        },
        movements: {
          include: { gate: true },
        },
      },
    }),
    prisma.permission.count({
      where: { studentId: student.id },
    }),
  ]);

  return { permissions, total };
}


export async function batchCreatePermissions(studentIds: string[], data: {
  type: "ENTRY" | "EXIT";
  purpose: string;
  destination: string;
  expectedExit?: string;
  expectedReturn?: string;
  contactNumber: string;
  remarks?: string;
}) {
  const user = await requireRole("FACULTY", "WARDEN", "FACULTY_ADMIN");

  if (!studentIds || studentIds.length === 0) return { error: "No students selected" };
  if (studentIds.length > 5) return { error: "You can only grant passes to a maximum of 5 students at a time." };
  
  if (!data.purpose) return { error: "Purpose is required" };

  let approverId = null;
  if (user.role === "FACULTY" || user.role === "FACULTY_ADMIN") {
    const fac = await prisma.faculty.findUnique({ where: { profileId: user.profileId || user.id } });
    if (fac) approverId = fac.id;
  } else if (user.role === "WARDEN") {
    const war = await prisma.warden.findUnique({ where: { profileId: user.profileId || user.id } });
    if (war) approverId = war.id;
  }

  // Generate QR tokens before transaction
  const tokens = await Promise.all(studentIds.map(async (studentId) => {
    const tokenId = randomUUID();
    const token = await new SignJWT({ type: 'GATE_PASS', studentId, jti: tokenId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(data.expectedExit ? new Date(data.expectedExit).getTime() / 1000 + 86400 : Math.floor(Date.now() / 1000) + 86400)
      .sign(new TextEncoder().encode(process.env.QR_JWT_SECRET!));
    return { studentId, token };
  }));

  // Create permissions directly as APPROVED
  await prisma.$transaction(async (tx) => {
    for (const item of tokens) {
      const { studentId, token } = item;

      const perm = await tx.permission.create({
        data: {
          studentId,
          type: data.type,
          purpose: data.purpose,
          destination: data.destination || null,
          expectedExit: data.expectedExit ? new Date(data.expectedExit) : null,
          expectedReturn: data.expectedReturn ? new Date(data.expectedReturn) : null,
          status: "APPROVED",
          remarks: data.remarks || null,
          contactNumber: data.contactNumber || null,
          approverType: user.role as "FACULTY" | "WARDEN",
          approverId: approverId || "unknown",
          exitDate: data.expectedExit ? new Date(data.expectedExit) : new Date(),
          approvedAt: new Date(),
        }
      });

      if (approverId) {
        await tx.permissionApproval.create({
          data: {
            permissionId: perm.id,
            approverType: user.role as "FACULTY" | "WARDEN",
            ...(user.role === "FACULTY" ? { facultyId: approverId } : {}),
            ...(user.role === "WARDEN" ? { wardenId: approverId } : {}),
            approved: true,
            reason: "Manually granted by " + user.role,
          }
        });
      }

      await tx.qrCredential.create({
        data: {
          permissionId: perm.id,
          token: token,
          expiresAt: data.expectedExit ? new Date(new Date(data.expectedExit).getTime() + 86400000) : new Date(Date.now() + 86400000),
        }
      });
    }
  });

  revalidatePath("/faculty/students");
  revalidatePath("/warden/students");
  return { success: true };
}

export async function generateLiveQrToken(permissionId: string) {
  const user = await requireRole("STUDENT");
  
  const student = await prisma.student.findUnique({
    where: { profileId: user.profileId }
  });
  
  if (!student) return { error: "Student not found" };

  const permission = await prisma.permission.findUnique({
    where: { id: permissionId },
    include: { qr: true }
  });

  if (!permission || permission.studentId !== student.id) {
    return { error: "Permission not found" };
  }

  if (permission.status !== "APPROVED") {
    return { error: "Permission is not approved" };
  }

  if (!permission.qr || !permission.qr.active) {
    return { error: "QR credential is not active" };
  }

  if (new Date(permission.qr.expiresAt) < new Date()) {
    return { error: "Warden approval window has expired." };
  }

  if (permission.type === "EXIT" && permission.qr.usedForExit) {
    return { error: "Pass already used for exit" };
  }

  const QR_SECRET = new TextEncoder().encode(process.env.QR_JWT_SECRET);
  
  // Generate a dynamic JWT valid for only 60 seconds
  const liveToken = await new SignJWT({
    permissionId: permission.id,
    tokenId: permission.qr.id,
    studentId: student.id,
    expiresAt: permission.qr.expiresAt.toISOString(), // Warden's true expiry
    nonce: randomUUID() // strictly unique every time
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s") // The dynamic 60s window!
    .sign(QR_SECRET);

  return { token: liveToken, expiresAt: permission.qr.expiresAt };
}


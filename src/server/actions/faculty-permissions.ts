"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { permissionRequestSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { resolveFacultyActivePass } from "@/lib/permissions/auto-expire";
import { getDepartmentVariants } from "@/lib/constants";

/**
 * Faculty submits a new permission request (EXIT or ENTRY)
 */
export async function createFacultyPermissionRequest(formData: FormData, type: "EXIT" | "ENTRY" = "EXIT") {
  const user = await requireRole("FACULTY", "FACULTY_ADMIN");

  const raw = {
    purpose: (formData.get("purpose") as string) || "",
    destination: (formData.get("destination") as string) || "",
    exitDate: (formData.get("exitDate") as string) || "",
    expectedExit: (formData.get("expectedExit") as string) || "",
    expectedReturn: (formData.get("expectedReturn") as string) || "",
    contactNumber: (formData.get("contactNumber") as string) || "",
    remarks: (formData.get("remarks") as string) || "",
  };

  const parsed = permissionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Get faculty record
  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, department: true },
  });

  if (!faculty) {
    return { error: "Faculty record not found." };
  }

  // Check for any truly active permission (auto-expires if QR validity or day ended)
  const existingActive = await resolveFacultyActivePass(faculty.id);

  if (existingActive) {
    if (existingActive.status === "PENDING") {
      return { error: `You already have a pending pass request. Please wait for approval or cancel it.` };
    }
    if (existingActive.status === "APPROVED") {
      return { error: "You have an approved gate pass. Please use your QR code before requesting another." };
    }
  }

  // Determine approver based on role hierarchy:
  // If requester is HOD (FACULTY_ADMIN), escalate to DEAN or DIRECTOR
  // If requester is regular FACULTY, assign to their department's HOD (FACULTY_ADMIN)
  let approverProfile: { id: string; role: string } | null = null;
  let approverType: "FACULTY_ADMIN" | "DIRECTOR" | "DEAN" = "FACULTY_ADMIN";

  if (user.role === "FACULTY_ADMIN") {
    approverProfile = await prisma.profile.findFirst({
      where: { role: { in: ["DEAN", "DIRECTOR"] }, active: true },
      orderBy: { role: "asc" }, // Prefers DEAN first, then DIRECTOR
      select: { id: true, role: true },
    });
    if (approverProfile) {
      approverType = approverProfile.role as "DEAN" | "DIRECTOR";
    }
  } else {
    const deptVariants = faculty.department ? getDepartmentVariants(faculty.department) : [];
    if (deptVariants.length > 0) {
      approverProfile = await prisma.profile.findFirst({
        where: {
          role: "FACULTY_ADMIN",
          active: true,
          faculty: { department: { in: deptVariants } },
        },
        select: { id: true, role: true },
      });
    }

    if (!approverProfile) {
      approverProfile = await prisma.profile.findFirst({
        where: { role: "FACULTY_ADMIN", active: true },
        select: { id: true, role: true },
      });
    }

    if (approverProfile) {
      approverType = "FACULTY_ADMIN";
    }
  }

  // Fallback to any administrative authority if primary role not found
  if (!approverProfile) {
    approverProfile = await prisma.profile.findFirst({
      where: { role: { in: ["DIRECTOR", "DEAN", "FACULTY_ADMIN"] }, active: true },
      select: { id: true, role: true },
    });
    if (approverProfile) {
      approverType = approverProfile.role as "FACULTY_ADMIN" | "DIRECTOR" | "DEAN";
    }
  }

  if (!approverProfile) {
    return { error: "No administrator found to approve your pass." };
  }

  const exitDate = new Date(parsed.data.exitDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (exitDate < today) {
    return { error: "Date cannot be in the past." };
  }

  const [exitH, exitM] = parsed.data.expectedExit.split(":").map(Number);
  const expectedExit = new Date(exitDate);
  expectedExit.setHours(exitH, exitM, 0, 0);

  let expectedReturn: Date | null = null;
  if (parsed.data.expectedReturn && type === "EXIT") {
    const [retH, retM] = parsed.data.expectedReturn.split(":").map(Number);
    expectedReturn = new Date(exitDate);
    expectedReturn.setHours(retH, retM, 0, 0);
    if (expectedReturn <= expectedExit) {
      expectedReturn.setDate(expectedReturn.getDate() + 1);
    }
  }

  const permission = await prisma.permission.create({
    data: {
      facultyId: faculty.id,
      approverType,
      approverId: approverProfile.id,
      type,
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

  revalidatePath("/faculty");
  revalidatePath("/faculty/requests");
  revalidatePath("/faculty-admin");
  revalidatePath("/faculty-admin/requests");
  revalidatePath("/director");
  revalidatePath("/director/requests");
  revalidatePath("/dean");
  revalidatePath("/dean/requests");

  return { success: true, permissionId: permission.id };
}

export async function cancelFacultyPermissionRequest(permissionId: string) {
  const user = await requireRole("FACULTY", "FACULTY_ADMIN");

  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!faculty) return { error: "Faculty not found" };

  const permission = await prisma.permission.findFirst({
    where: {
      id: permissionId,
      facultyId: faculty.id,
      status: "PENDING",
    },
  });

  if (!permission) return { error: "Request not found" };

  await prisma.permission.update({
    where: { id: permissionId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  revalidatePath("/faculty");
  revalidatePath("/faculty/requests");
  revalidatePath("/faculty-admin");
  revalidatePath("/faculty-admin/requests");
  revalidatePath("/director");
  revalidatePath("/director/requests");
  revalidatePath("/dean");
  revalidatePath("/dean/requests");
  return { success: true };
}

/**
 * Fetch complete gate pass history and stats for a specific faculty member (HOD / Admin / Director / Dean view)
 */
export async function getFacultyPassHistory(profileIdOrFacultyId: string) {
  await requireRole("FACULTY_ADMIN", "ADMIN", "DIRECTOR", "DEAN");

  const faculty = await prisma.faculty.findFirst({
    where: {
      OR: [
        { id: profileIdOrFacultyId },
        { profileId: profileIdOrFacultyId },
      ],
    },
    include: {
      profile: {
        select: { id: true, name: true, email: true, phone: true, active: true },
      },
    },
  });

  if (!faculty) {
    return { error: "Faculty member record not found" };
  }

  const permissions = await prisma.permission.findMany({
    where: { facultyId: faculty.id },
    orderBy: { createdAt: "desc" },
    include: {
      approval: {
        include: {
          faculty: { include: { profile: { select: { name: true } } } },
        },
      },
      movements: {
        orderBy: { createdAt: "asc" },
        include: {
          gate: { select: { name: true, location: true } },
          securityUser: { include: { profile: { select: { name: true } } } },
        },
      },
      qr: {
        select: { active: true, usedForExit: true, usedForEntry: true, expiresAt: true },
      },
    },
  });

  const serializedPermissions = permissions.map((p) => ({
    id: p.id,
    type: p.type,
    status: p.status,
    purpose: p.purpose,
    destination: p.destination,
    exitDate: p.exitDate ? p.exitDate.toISOString() : null,
    expectedExit: p.expectedExit ? p.expectedExit.toISOString() : null,
    expectedReturn: p.expectedReturn ? p.expectedReturn.toISOString() : null,
    remarks: p.remarks,
    contactNumber: p.contactNumber,
    rejectionReason: p.rejectionReason,
    approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
    rejectedAt: p.rejectedAt ? p.rejectedAt.toISOString() : null,
    createdAt: p.createdAt ? p.createdAt.toISOString() : null,
    movements: (p.movements || []).map((m) => ({
      id: m.id,
      type: m.type,
      gateName: m.gate?.name || "Main Gate",
      gateLocation: m.gate?.location,
      securityName: m.securityUser?.profile?.name || "Security",
      createdAt: m.createdAt ? m.createdAt.toISOString() : null,
    })),
    approverName: p.approval?.faculty?.profile?.name || null,
  }));

  return {
    success: true,
    faculty: {
      id: faculty.id,
      profileId: faculty.profileId,
      name: faculty.profile.name,
      email: faculty.profile.email,
      phone: faculty.profile.phone,
      department: faculty.department,
      designation: faculty.designation,
      employeeId: faculty.employeeId,
      active: faculty.profile.active,
    },
    permissions: serializedPermissions,
    stats: {
      total: permissions.length,
      approved: permissions.filter((p) => ["APPROVED", "EXITED", "COMPLETED"].includes(p.status)).length,
      rejected: permissions.filter((p) => p.status === "REJECTED").length,
      pending: permissions.filter((p) => p.status === "PENDING").length,
    },
  };
}

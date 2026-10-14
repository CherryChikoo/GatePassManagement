"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { permissionRequestSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { resolveFacultyActivePass } from "@/lib/permissions/auto-expire";
import { getDepartmentVariants } from "@/lib/constants";
import { istDateTime, istDateToInstant, istStartOfDay } from "@/lib/time/ist";
import { getFacultyApproverOptions, type FacultyApproverChoice } from "@/lib/permissions/approver";

/**
 * Faculty submits a new permission request (EXIT or ENTRY)
 */
export async function createFacultyPermissionRequest(formData: FormData, type: "EXIT" | "ENTRY" = "EXIT") {
  // Only regular faculty need a gate pass (not HODs, the Dean or the Director)
  const user = await requireRole("FACULTY");

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

  if (type !== "EXIT" && type !== "ENTRY") return { error: "Invalid pass type" };

  // Faculty choose the approver: own-department HOD, Dean, or Both (both must approve).
  // The Director never approves passes.
  const options = await getFacultyApproverOptions(user);
  let approverType: "FACULTY_ADMIN" | "DEAN";
  let approverId: string;
  let approvalMode: "SINGLE" | "BOTH" = "SINGLE";

  const rawChoice = String(formData.get("approverChoice") || "").toUpperCase();
  // No choice sent (older client): HOD if available, otherwise Dean
  const choice: FacultyApproverChoice =
    rawChoice === "HOD" || rawChoice === "DEAN" || rawChoice === "BOTH"
      ? rawChoice
      : options.hod
      ? "HOD"
      : "DEAN";

  if (choice === "HOD") {
    if (!options.hod) return { error: "No HOD is assigned to your department. Choose the Dean instead." };
    approverType = "FACULTY_ADMIN";
    approverId = options.hod.id;
  } else if (choice === "DEAN") {
    if (!options.dean) return { error: "No Dean is available. Choose your HOD instead." };
    approverType = "DEAN";
    approverId = options.dean.id;
  } else {
    if (!options.hod || !options.dean) {
      return { error: "Both HOD and Dean must be available to request approval from both." };
    }
    // Routed to the HOD; the Dean sees it too. Both must approve.
    approverType = "FACULTY_ADMIN";
    approverId = options.hod.id;
    approvalMode = "BOTH";
  }

  // Dates/times are IST wall-clock values
  const exitDate = istDateToInstant(parsed.data.exitDate);
  if (exitDate < istStartOfDay()) {
    return { error: "Date cannot be in the past." };
  }

  const expectedExit = istDateTime(parsed.data.exitDate, parsed.data.expectedExit);
  if (!expectedExit) return { error: "Invalid time" };

  let expectedReturn: Date | null = null;
  if (parsed.data.expectedReturn && type === "EXIT") {
    expectedReturn = istDateTime(parsed.data.exitDate, parsed.data.expectedReturn);
    if (expectedReturn && expectedReturn <= expectedExit) {
      expectedReturn = new Date(expectedReturn.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const permission = await prisma.permission.create({
    data: {
      facultyId: faculty.id,
      approverType,
      approverId,
      approvalMode,
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
  revalidatePath("/faculty-admin");
  revalidatePath("/faculty-admin/requests");
  revalidatePath("/director");
  revalidatePath("/dean");
  revalidatePath("/dean/requests");

  return { success: true, permissionId: permission.id };
}

export async function cancelFacultyPermissionRequest(permissionId: string) {
  // Only regular faculty need a gate pass (not HODs, the Dean or the Director)
  const user = await requireRole("FACULTY");

  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true },
  });

  if (!faculty) return { error: "Faculty not found" };

  const updated = await prisma.permission.updateMany({
    where: { id: permissionId, facultyId: faculty.id, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  if (updated.count !== 1) return { error: "Request not found or can no longer be cancelled" };

  revalidatePath("/faculty");
  revalidatePath("/faculty-admin");
  revalidatePath("/faculty-admin/requests");
  revalidatePath("/director");
  revalidatePath("/dean");
  revalidatePath("/dean/requests");
  return { success: true };
}

/**
 * Fetch complete gate pass history and stats for a specific faculty member (HOD / Admin / Director / Dean view)
 */
export async function getFacultyPassHistory(profileIdOrFacultyId: string) {
  const user = await requireRole("FACULTY_ADMIN", "ADMIN", "DIRECTOR", "DEAN");
  if (typeof profileIdOrFacultyId !== "string" || !profileIdOrFacultyId) {
    return { error: "Faculty member record not found" };
  }

  // HODs may only view faculty of their own department
  let departmentFilter: Prisma.FacultyWhereInput = {};
  if (user.role === "FACULTY_ADMIN") {
    const hod = await prisma.faculty.findUnique({ where: { profileId: user.profileId }, select: { department: true } });
    const variants = getDepartmentVariants(hod?.department);
    if (variants.length === 0) return { error: "Faculty member record not found" };
    departmentFilter = { department: { in: variants } };
  }

  const faculty = await prisma.faculty.findFirst({
    where: {
      ...departmentFilter,
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
    take: 200,
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

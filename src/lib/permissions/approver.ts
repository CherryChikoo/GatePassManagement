import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";

export type ResolvedApprover = {
  approverType: "FACULTY_ADMIN" | "WARDEN";
  /** HOD: the HOD's Profile id. Warden: the Warden record id. */
  approverId: string;
  name: string;
  /** Human label, e.g. "HOD (CSE)" or "Hostel Warden (Block A)". */
  label: string;
};

export type ApproverResolution =
  | { ok: true; approver: ResolvedApprover }
  | { ok: false; error: string };

/**
 * College rule: students never choose their approver.
 * - Day scholars → the HOD of their own department.
 * - Hostellers → their assigned warden.
 */
export async function resolveStudentApprover(student: {
  department: string | null;
  studentType: "DAY_SCHOLAR" | "HOSTELLER";
  wardenId: string | null;
}): Promise<ApproverResolution> {
  if (student.studentType === "HOSTELLER") {
    if (!student.wardenId) {
      return { ok: false, error: "No hostel warden is assigned to you. Please contact the administrator." };
    }
    const warden = await prisma.warden.findUnique({
      where: { id: student.wardenId },
      select: { id: true, hostelBlock: true, profile: { select: { name: true, active: true } } },
    });
    if (!warden || !warden.profile.active) {
      return { ok: false, error: "Your assigned hostel warden is unavailable. Please contact the administrator." };
    }
    return {
      ok: true,
      approver: {
        approverType: "WARDEN",
        approverId: warden.id,
        name: warden.profile.name,
        label: warden.hostelBlock ? `Hostel Warden (Block ${warden.hostelBlock})` : "Hostel Warden",
      },
    };
  }

  const variants = getDepartmentVariants(student.department);
  if (variants.length === 0) {
    return { ok: false, error: "Your department is not set. Please contact the administrator." };
  }

  const hod = await prisma.profile.findFirst({
    where: {
      role: "FACULTY_ADMIN",
      active: true,
      faculty: { department: { in: variants } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, faculty: { select: { department: true } } },
  });

  if (!hod) {
    return {
      ok: false,
      error: "No HOD is assigned to your department yet. Please contact the administrator.",
    };
  }

  return {
    ok: true,
    approver: {
      approverType: "FACULTY_ADMIN",
      approverId: hod.id,
      name: hod.name,
      label: `HOD (${student.department})`,
    },
  };
}

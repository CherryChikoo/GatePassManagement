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

// ─── Faculty / HOD passes ────────────────────────────────────────────────────

export type FacultyApproverChoice = "HOD" | "DEAN" | "BOTH";

export type FacultyApproverOptions = {
  /** Only regular faculty choose; an HOD's own pass always goes to the Dean. */
  canChoose: boolean;
  hod: { id: string; name: string } | null;
  dean: { id: string; name: string } | null;
};

/**
 * Who can approve a faculty member's own pass:
 * - FACULTY: the HOD of their department and/or the Dean (they choose HOD, Dean, or Both)
 * - FACULTY_ADMIN (HOD): the Dean only
 * Never the requester themself; the Director does not approve passes.
 */
export async function getFacultyApproverOptions(user: {
  role: string;
  profileId: string;
}): Promise<FacultyApproverOptions> {
  const deanRow = await prisma.profile.findFirst({
    where: { role: "DEAN", active: true, id: { not: user.profileId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, faculty: { select: { designation: true } } },
  });
  // Show the Dean with their title, e.g. "Dr. Rao (Dean of Academics)"
  const deanDesignation = deanRow?.faculty?.designation?.trim();
  const dean = deanRow
    ? { id: deanRow.id, name: deanDesignation && deanDesignation !== "Dean" ? `${deanRow.name} (${deanDesignation})` : deanRow.name }
    : null;

  if (user.role !== "FACULTY") {
    return { canChoose: false, hod: null, dean };
  }

  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { department: true },
  });
  const variants = getDepartmentVariants(faculty?.department);
  const hod =
    variants.length > 0
      ? await prisma.profile.findFirst({
          where: {
            role: "FACULTY_ADMIN",
            active: true,
            id: { not: user.profileId },
            faculty: { department: { in: variants } },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        })
      : null;

  return { canChoose: true, hod, dean };
}

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

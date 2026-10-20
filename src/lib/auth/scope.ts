import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";
import type { AuthUser } from "@/lib/auth/helpers";

/**
 * Data-scope rules for staff, enforced server-side:
 * - ADMIN: everything
 * - FACULTY: only the students assigned to them (never the whole department)
 * - FACULTY_ADMIN (HOD): students and faculty of their department
 * - WARDEN: their assigned hostellers
 * Department is admin-managed (users cannot edit it themselves).
 */
export type StaffScope =
  | { kind: "ADMIN" }
  | { kind: "FACULTY" | "FACULTY_ADMIN"; facultyId: string; deptVariants: string[] }
  | { kind: "WARDEN"; wardenId: string }
  | { kind: "NONE" };

export async function getStaffScope(user: AuthUser): Promise<StaffScope> {
  if (user.role === "ADMIN") return { kind: "ADMIN" };

  if (user.role === "FACULTY" || user.role === "FACULTY_ADMIN") {
    const faculty = await prisma.faculty.findUnique({
      where: { profileId: user.profileId },
      select: { id: true, department: true },
    });
    if (!faculty) return { kind: "NONE" };
    return { kind: user.role, facultyId: faculty.id, deptVariants: getDepartmentVariants(faculty.department) };
  }

  if (user.role === "WARDEN") {
    const warden = await prisma.warden.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
    return warden ? { kind: "WARDEN", wardenId: warden.id } : { kind: "NONE" };
  }

  return { kind: "NONE" };
}

/** Prisma filter selecting the students a scope may access. */
export function studentWhereForScope(scope: StaffScope): Prisma.StudentWhereInput | null {
  switch (scope.kind) {
    case "ADMIN":
      return {};
    case "FACULTY":
      return { facultyId: scope.facultyId };
    case "FACULTY_ADMIN":
      return {
        OR: [
          { facultyId: scope.facultyId },
          ...(scope.deptVariants.length > 0 ? [{ department: { in: scope.deptVariants } }] : []),
        ],
      };
    case "WARDEN":
      return { wardenId: scope.wardenId };
    default:
      return null;
  }
}

export async function canAccessStudent(scope: StaffScope, studentId: string): Promise<boolean> {
  const where = studentWhereForScope(scope);
  if (!where) return false;
  const found = await prisma.student.findFirst({ where: { AND: [{ id: studentId }, where] }, select: { id: true } });
  return !!found;
}

/** Whether a scope may view a profile's full history (students, plus own-department faculty for HODs). */
export async function canViewProfile(scope: StaffScope, profileId: string): Promise<boolean> {
  if (scope.kind === "ADMIN") return true;

  const studentWhere = studentWhereForScope(scope);
  if (studentWhere) {
    const student = await prisma.student.findFirst({
      where: { AND: [{ profileId }, studentWhere] },
      select: { id: true },
    });
    if (student) return true;
  }

  if (scope.kind === "FACULTY_ADMIN" && scope.deptVariants.length > 0) {
    const faculty = await prisma.faculty.findFirst({
      where: {
        profileId,
        department: { in: scope.deptVariants },
        profile: { role: { in: ["FACULTY", "FACULTY_ADMIN"] } },
      },
      select: { id: true },
    });
    if (faculty) return true;
  }

  return false;
}

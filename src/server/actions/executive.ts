"use server";

import { loadActivityPage, type ActivityPageParams } from "@/lib/activity/campus-activity";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, type AuthUser } from "@/lib/auth/helpers";
import { getDepartmentVariants } from "@/lib/constants";
import { istStartOfDay } from "@/lib/time/ist";
import { SUPERVISOR_REQUEST_SELECT, SUPERVISOR_STATUS_WHERE, supervisorRequestsScope } from "@/lib/passes/supervisor-requests";

const MAX_PAGE_SIZE = 50;

/** Matches no student (an HOD / faculty / warden account that is not set up yet) */
const NO_STUDENTS: Prisma.StudentWhereInput = { id: "__none__" };

/**
 * Which students this user may list: campus-wide for the Director, Dean,
 * Security Supervisor and Admin; their own students for the others (the same
 * scope their screens always had):
 * - Faculty: the students assigned to them
 * - HOD: assigned students + their department
 * - Warden: their hostellers
 */
async function studentScope(user: AuthUser): Promise<Prisma.StudentWhereInput> {
  if (user.role === "FACULTY" || user.role === "FACULTY_ADMIN") {
    const faculty = await prisma.faculty.findUnique({
      where: { profileId: user.profileId },
      select: { id: true, department: true },
    });
    if (!faculty) return NO_STUDENTS;
    const deptVariants = user.role === "FACULTY_ADMIN" ? getDepartmentVariants(faculty.department) : [];
    return {
      OR: [{ facultyId: faculty.id }, ...(deptVariants.length > 0 ? [{ department: { in: deptVariants } }] : [])],
    };
  }
  if (user.role === "WARDEN") {
    const warden = await prisma.warden.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
    return warden ? { wardenId: warden.id } : NO_STUDENTS;
  }
  return {};
}

const pageSizeOf = (v: unknown, fallback: number) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(v) || fallback)));
const pageOf = (v: unknown) => Math.max(1, Math.floor(Number(v) || 1));
const textOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

/**
 * Student directory, one page at a time (search and filters run in the
 * database). Campus-wide for the Director, Dean, Security Supervisor and Admin;
 * the HOD / faculty / warden "My Students" screens get only their own students
 * (see studentScope). Replaces sending every student with the dashboard data.
 */
export async function getExecutiveStudents(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  department?: string;
  year?: string;
  studentType?: string;
}) {
  const user = await requireRole("DIRECTOR", "DEAN", "SECURITY_SUPERVISOR", "ADMIN", "FACULTY_ADMIN", "FACULTY", "WARDEN");
  const scope = await studentScope(user);

  const pageSize = pageSizeOf(params?.pageSize, 15);
  const page = pageOf(params?.page);
  const q = textOf(params?.q);
  const department = typeof params?.department === "string" && params.department !== "ALL" ? params.department.slice(0, 100) : "";
  const year = typeof params?.year === "string" && /^\d{1,2}$/.test(params.year) ? Number(params.year) : null;
  const studentType =
    params?.studentType === "HOSTELLER" || params?.studentType === "DAY_SCHOLAR" ? params.studentType : null;

  const where: Prisma.StudentWhereInput = {
    AND: [
      scope,
      department ? { department } : {},
      year !== null ? { year } : {},
      studentType ? { studentType } : {},
      q
        ? {
            OR: [
              { studentRoll: { contains: q, mode: "insensitive" } },
              { department: { contains: q, mode: "insensitive" } },
              { hostelBlock: { contains: q, mode: "insensitive" } },
              { profile: { name: { contains: q, mode: "insensitive" } } },
              { profile: { email: { contains: q, mode: "insensitive" } } },
              { profile: { phone: { contains: q } } },
            ],
          }
        : {},
    ],
  };

  const [rows, total, scopeTotal, active, hostellers, departments] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { studentRoll: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        profile: { select: { id: true, name: true, email: true, phone: true, active: true } },
        faculty: { select: { id: true, department: true, profile: { select: { name: true } } } },
        warden: { select: { id: true, hostelBlock: true, profile: { select: { name: true } } } },
      },
    }),
    prisma.student.count({ where }),
    // Summary of everyone this user can see (not affected by the filters, as before)
    prisma.student.count({ where: scope }),
    prisma.student.count({ where: { AND: [scope, { profile: { active: true } }] } }),
    prisma.student.count({ where: { AND: [scope, { studentType: "HOSTELLER" }] } }),
    prisma.student.findMany({ where: scope, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    metrics: { total: scopeTotal, active, hostelers: hostellers, dayScholars: scopeTotal - hostellers },
    departments: departments.map((d) => d.department).filter((d): d is string => !!d),
  };
}

const FACULTY_ROLES: Prisma.ProfileWhereInput = { role: { in: ["FACULTY", "FACULTY_ADMIN"] } };

/**
 * Campus faculty & HOD directory (Director, Dean, Security Supervisor), one page
 * at a time (search and filters run in the database). Replaces sending every
 * faculty member with the dashboard data.
 */
export async function getExecutiveFaculty(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  department?: string;
  /** "HOD" | "FACULTY" | "ALL" */
  role?: string;
  /** "ACTIVE" | "DISABLED" | "ALL" */
  status?: string;
}) {
  await requireRole("DIRECTOR", "DEAN", "SECURITY_SUPERVISOR", "ADMIN");

  const pageSize = pageSizeOf(params?.pageSize, 20);
  const page = pageOf(params?.page);
  const q = textOf(params?.q);
  const department = typeof params?.department === "string" && params.department !== "ALL" ? params.department.slice(0, 100) : "";

  const where: Prisma.ProfileWhereInput = {
    AND: [
      FACULTY_ROLES,
      department ? { faculty: { department } } : {},
      params?.role === "HOD" ? { role: "FACULTY_ADMIN" } : params?.role === "FACULTY" ? { role: "FACULTY" } : {},
      params?.status === "ACTIVE" ? { active: true } : params?.status === "DISABLED" ? { active: false } : {},
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { faculty: { department: { contains: q, mode: "insensitive" } } },
              { faculty: { designation: { contains: q, mode: "insensitive" } } },
              { faculty: { employeeId: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };

  const [rows, total, allTotal, active, hods, departments] = await Promise.all([
    prisma.profile.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, email: true, phone: true, active: true, role: true,
        faculty: { select: { id: true, department: true, designation: true, employeeId: true, maxApprovals: true } },
      },
    }),
    prisma.profile.count({ where }),
    // Summary of all faculty (not affected by the filters, as before)
    prisma.profile.count({ where: FACULTY_ROLES }),
    prisma.profile.count({ where: { ...FACULTY_ROLES, active: true } }),
    prisma.profile.count({ where: { role: "FACULTY_ADMIN" } }),
    prisma.faculty.findMany({
      where: { profile: FACULTY_ROLES, department: { not: null } },
      distinct: ["department"],
      select: { department: true },
      orderBy: { department: "asc" },
    }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    metrics: { total: allTotal, active, hods, teachingFaculty: allTotal - hods },
    departments: departments.map((d) => d.department).filter((d): d is string => !!d),
  };
}

/**
 * Security Supervisor → Requests: today's student and faculty requests plus any
 * still pending, one page at a time (search and filters run in the database).
 * Read-only. Replaces sending up to 500 requests with every dashboard refresh.
 */
export async function getSupervisorRequests(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  /** "PENDING" | "APPROVED" | "REJECTED" | "ALL" */
  status?: string;
  /** "ALL" | "STUDENTS" | "FACULTY" */
  who?: string;
}) {
  await requireRole("SECURITY_SUPERVISOR");

  const pageSize = pageSizeOf(params?.pageSize, 20);
  const page = pageOf(params?.page);
  const q = textOf(params?.q);
  const status = params?.status === "PENDING" || params?.status === "APPROVED" || params?.status === "REJECTED" ? params.status : null;

  const base: Prisma.PermissionWhereInput = {
    AND: [
      supervisorRequestsScope(istStartOfDay()),
      params?.who === "FACULTY" ? { facultyId: { not: null } } : params?.who === "STUDENTS" ? { studentId: { not: null } } : {},
    ],
  };
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.PermissionWhereInput = {
    AND: [
      base,
      status ? SUPERVISOR_STATUS_WHERE[status] : {},
      q
        ? {
            OR: [
              { purpose: contains },
              { destination: contains },
              { student: { studentRoll: contains } },
              { student: { department: contains } },
              { student: { profile: { name: contains } } },
              { faculty: { employeeId: contains } },
              { faculty: { department: contains } },
              { faculty: { profile: { name: contains } } },
            ],
          }
        : {},
    ],
  };

  const [rows, total, pending, approved, all] = await Promise.all([
    prisma.permission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: SUPERVISOR_REQUEST_SELECT,
    }),
    prisma.permission.count({ where }),
    // Tab counts (requester filter only, as before)
    prisma.permission.count({ where: { AND: [base, SUPERVISOR_STATUS_WHERE.PENDING] } }),
    prisma.permission.count({ where: { AND: [base, SUPERVISOR_STATUS_WHERE.APPROVED] } }),
    prisma.permission.count({ where: base }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    counts: { PENDING: pending, APPROVED: approved, REJECTED: Math.max(0, all - pending - approved), ALL: all },
  };
}

/**
 * One page of one IST day's campus activity (Director, Dean, Security
 * Supervisor) with the day's counts per tab. Loaded by the Activity screen in
 * the browser (cached per day and page), so the page opens at once.
 */
export async function getCampusActivity(dateParam?: string, params?: ActivityPageParams) {
  await requireRole("DIRECTOR", "DEAN", "SECURITY_SUPERVISOR");
  return loadActivityPage(typeof dateParam === "string" ? dateParam : undefined, params, { departments: null, studentMovements: true });
}

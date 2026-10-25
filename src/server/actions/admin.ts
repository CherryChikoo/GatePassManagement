"use server";

import { Role } from "@prisma/client";
import { getAdminMonitorCounts } from "@/lib/dashboard/admin-monitor";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/auth/rate-limiter";
import { clearRoleLine } from "@/lib/auth/titles";
import { requireRole, getAuthUser, invalidateProfileCache } from "@/lib/auth/helpers";
import {
  createUserSchema,
  createGateSchema,
  updateGateSchema,
  staffStudentUpdateSchema,
  adminStudentUpdateSchema,
  adminUserUpdateSchema,
} from "@/lib/validation/schemas";
import { getStaffScope, canAccessStudent, canViewProfile } from "@/lib/auth/scope";
import { istDayRangeFromParam } from "@/lib/time/ist";
import { getSyncReport, reconcilePortalWithLogins, deleteLoginWithoutPortal } from "@/lib/accounts/sync";
import { deanTitle } from "@/lib/auth/titles";
import { getDepartmentVariants, listedDepartmentCode } from "@/lib/constants";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { fillMovementPeople } from "@/lib/people";

// In-memory caches to make frequent admin dashboard, gates, and user navigation blazing fast
// No in-memory copies of lists here: the portal runs on several server
// instances at once, and a copy kept by one is not cleared by a change made
// on another — a deleted user would come back on the next reload. These
// queries take milliseconds; the browser screens avoid repeat requests.

/** After an admin change: signed-in details (role, active) are read fresh on this instance. */
function clearAdminCaches() {
  invalidateProfileCache();
}

const CACHE_CLEARING_ROLES: string[] = ["ADMIN", "SECURITY", "FACULTY_ADMIN", "WARDEN", "DEAN", "DIRECTOR", "SECURITY_SUPERVISOR"];

export async function invalidateAdminCaches() {
  // Exported from a "use server" module, so it is callable from the browser:
  // only staff may trigger it (students and faculty cannot force cache-wide reloads).
  const caller = await getAuthUser();
  if (!caller || !CACHE_CLEARING_ROLES.includes(caller.role)) return;
  clearAdminCaches();
}


// Use service role client for admin user creation
function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Admin creates a new user account
 */
export async function createUser(formData: FormData) {
  await requireRole("ADMIN");

  const raw = {
    name: (formData.get("name") as string) || "",
    email: (formData.get("email") as string) || "",
    password: (formData.get("password") as string) || "",
    role: (formData.get("role") as string) || "",
    phone: (formData.get("phone") as string) || "",
    studentRoll: (formData.get("studentRoll") as string) || "",
    department: (formData.get("department") as string) || "",
    year: formData.get("year") ? Number(formData.get("year")) : undefined,
    semester: formData.get("semester") ? Number(formData.get("semester")) : undefined,
    section: (formData.get("section") as string) || "",
    studentType: (formData.get("studentType") as string) || undefined,
    hostelType: (formData.get("hostelType") as string) || undefined,
    roomNumber: (formData.get("roomNumber") as string) || "",
    hostelBlock: (formData.get("hostelBlock") as string) || "",
    designation: (formData.get("designation") as string) || "",
    wardenHostelBlock: (formData.get("wardenHostelBlock") as string) || "",
  };

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Deans are "Dean of <area>"; Directors carry a title such as "Managing Director"
  const deanOf = ((formData.get("deanOf") as string) || "").trim();
  if (parsed.data.role === "DEAN" && !deanOf) return { error: "Enter what the Dean is in charge of (Dean of …)" };
  if (parsed.data.role === "DEAN" && deanOf.length > 80) return { error: "Dean of … is too long" };
  if (parsed.data.role === "DIRECTOR" && !parsed.data.designation?.trim()) return { error: "Enter the Director’s title, e.g. Managing Director" };

  // "Head Security" is a Security account that can also take staff attendance
  const isHeadSecurity = parsed.data.role === "HEAD_SECURITY";
  const data = { ...parsed.data, role: isHeadSecurity ? ("SECURITY" as const) : parsed.data.role };
  // Students: the department must be one from the list (stored as its code, e.g. "CSE")
  if (data.role === "STUDENT") {
    const code = listedDepartmentCode(data.department);
    if (!code) return { error: "Choose the student's department from the list." };
    data.department = code;
  }

  // Explicitly validate uniqueness before hitting Auth
  const existingEmail = await prisma.profile.findUnique({
    where: { email: data.email },
  });
  if (existingEmail) {
    return { error: `Email ${data.email} is already registered.` };
  }

  if (data.role === "STUDENT" && data.studentRoll) {
    const existingRoll = await prisma.student.findUnique({
      where: { studentRoll: data.studentRoll },
    });
    if (existingRoll) {
      return { error: `Roll number ${data.studentRoll} is already registered.` };
    }
  }

  // Create Supabase Auth user
  const adminSupabase = getAdminSupabase();
  const { data: authData, error: authError } =
    await adminSupabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      // Same name on the login as on the portal account
      user_metadata: { name: data.name, full_name: data.name, display_name: data.name, phone: data.phone || null },
    });

  if (authError) {
    return { error: `Auth error: ${authError.message}` };
  }

  const assignedFacultyId = ((formData.get("assignedFacultyId") as string) || "").trim();
  const assignedWardenId = ((formData.get("assignedWardenId") as string) || "").trim();
  const assignedGateId = ((formData.get("assignedGateId") as string) || "").trim();

  try {
    if (assignedFacultyId && !(await prisma.faculty.findUnique({ where: { id: assignedFacultyId }, select: { id: true } }))) {
      throw new Error("Selected faculty does not exist");
    }
    if (assignedWardenId && !(await prisma.warden.findUnique({ where: { id: assignedWardenId }, select: { id: true } }))) {
      throw new Error("Selected warden does not exist");
    }
    if (assignedGateId && !(await prisma.gate.findUnique({ where: { id: assignedGateId }, select: { id: true } }))) {
      throw new Error("Selected gate does not exist");
    }

    // Profile + role-specific record are created atomically
    await prisma.$transaction(async (prisma) => {
    const profile = await prisma.profile.create({
      data: {
        userId: authData.user.id,
        role: data.role as any,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
      },
    });

    // Create role-specific record
    switch (data.role) {
      case "STUDENT": {
        const facultyId = assignedFacultyId;
        const wardenId = assignedWardenId;
        await prisma.student.create({
          data: {
            profileId: profile.id,
            studentRoll: data.studentRoll || `STU-${Date.now()}`,
            department: data.department || null,
            year: data.year || null,
            semester: data.semester || null,
            section: data.section || null,
            studentType: (data.studentType as any) || "DAY_SCHOLAR",
            hostelType: data.studentType === "HOSTELLER" ? data.hostelType || null : null,
            facultyId: facultyId || null,
            // Hostel details only for hostellers
            wardenId: data.studentType === "HOSTELLER" ? wardenId || null : null,
            roomNumber: data.studentType === "HOSTELLER" ? data.roomNumber || null : null,
            hostelBlock: data.studentType === "HOSTELLER" ? data.hostelBlock || null : null,
          },
        });
        break;
      }
      case "FACULTY":
        await prisma.faculty.create({
          data: {
            profileId: profile.id,
            employeeId: formData.get("employeeId") as string || null,
            department: data.department || null,
            designation: data.designation || null,
          },
        });
        break;
      case "FACULTY_ADMIN":
        await prisma.faculty.create({
          data: {
            profileId: profile.id,
            employeeId: (formData.get("employeeId") as string) || `HOD-${Date.now().toString().slice(-4)}`,
            department: data.department || null,
            designation: data.designation || "Head of Department",
            maxApprovals: 50,
          },
        });
        break;
      case "DIRECTOR":
        await prisma.faculty.create({
          data: {
            profileId: profile.id,
            employeeId: (formData.get("employeeId") as string) || `DIR-${Date.now().toString().slice(-4)}`,
            department: data.department || "All Departments",
            designation: data.designation?.trim() || "Director",
            maxApprovals: 999,
          },
        });
        break;
      case "DEAN":
        await prisma.faculty.create({
          data: {
            profileId: profile.id,
            employeeId: (formData.get("employeeId") as string) || `DEAN-${Date.now().toString().slice(-4)}`,
            department: data.department || "All Departments",
            designation: deanOf ? deanTitle(deanOf) : "Dean",
            maxApprovals: 999,
          },
        });
        break;
      case "WARDEN":
        await prisma.warden.create({
          data: {
            profileId: profile.id,
            employeeId: formData.get("employeeId") as string || null,
            hostelBlock: data.wardenHostelBlock || null,
          },
        });
        break;
      case "SECURITY":
        await prisma.securityStaff.create({
          data: {
            profileId: profile.id,
            employeeId: formData.get("employeeId") as string || null,
            gateId: assignedGateId || null,
            isHead: isHeadSecurity,
          },
        });
        break;
    }
    });

    clearAdminCaches();
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: any) {
    // Roll back the auth user if the database records could not be created
    await adminSupabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    console.error("[createUser] failed:", error?.code, error?.message);
    if (error?.code === "P2002") return { error: "Email, roll number or employee ID is already in use." };
    if (/invalid input value for enum/i.test(String(error?.message))) {
      return { error: "This role is not set up in the database yet. Run `npx prisma db push`, then try again." };
    }
    return { error: error?.message?.startsWith("Selected") ? error.message : "Failed to create user record" };
  }
}

/**
 * Enables / disables a login.
 * - Main Admin: any account except Admins.
 * - HOD: students of their own department only.
 */
export async function toggleUserActive(profileId: string) {
  const user = await requireRole("ADMIN", "FACULTY_ADMIN");
  if (typeof profileId !== "string" || !profileId) return { error: "User not found" };

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { active: true, role: true, userId: true },
  });

  if (!profile) return { error: "User not found" };

  // Admins may disable other admins (never themselves); HODs only reach students (below)
  if (profile.userId === user.userId) return { error: "You can't disable your own account" };
  if (user.role === "FACULTY_ADMIN") {
    if (profile.role !== "STUDENT") return { error: "You can enable or disable students only" };
    const scope = await getStaffScope(user);
    if (!(await canViewProfile(scope, profileId))) return { error: "This student is not in your department" };
  }

  const nextActive = !profile.active;

  // Ban/unban in Supabase Auth too, so a deactivated user cannot sign in or refresh a session.
  const { error: authError } = await getAdminSupabase().auth.admin.updateUserById(profile.userId, {
    ban_duration: nextActive ? "none" : "876000h",
  });
  if (authError) return { error: "Failed to update sign-in access: " + authError.message };

  await prisma.profile.update({
    where: { id: profileId },
    data: { active: nextActive },
  });

  invalidateProfileCache(profile.userId);
  clearAdminCaches();
  revalidatePath("/admin/users");
  revalidatePath("/faculty-admin/students");
  return { success: true };
}

/**
 * Admin deletes a user permanently.
 * Users with any gate-pass or movement history cannot be deleted (that would
 * erase the campus audit trail); deactivate them instead.
 */
export async function deleteUser(profileId: string) {
  await requireRole("ADMIN");

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      userId: true,
      role: true,
      student: { select: { id: true, _count: { select: { permissions: true, movements: true } } } },
      faculty: { select: { id: true, _count: { select: { permissions: true, permissionApprovals: true, movements: true } } } },
      warden: { select: { id: true, _count: { select: { permissionApprovals: true } } } },
      securityStaff: { select: { id: true, _count: { select: { movements: true } } } },
      _count: { select: { registerEntries: true, recordedOutsiders: true } },
    },
  });

  if (!profile) return { error: "User not found" };
  if (profile.role === "ADMIN") return { error: "Cannot delete admin accounts" };

  const counts = [
    profile._count.registerEntries,
    profile._count.recordedOutsiders,
    profile.student?._count.permissions,
    profile.student?._count.movements,
    profile.faculty?._count.permissions,
    profile.faculty?._count.permissionApprovals,
    profile.faculty?._count.movements,
    profile.warden?._count.permissionApprovals,
    profile.securityStaff?._count.movements,
  ];
  if (counts.some((c) => (c ?? 0) > 0)) {
    return {
      error: "This user has gate-pass history and cannot be deleted. Deactivate the account instead to keep the audit trail.",
    };
  }

  try {
    // Database first, so a failure never leaves a profile without an auth account.
    await prisma.$transaction(async (tx) => {
      if (profile.faculty) {
        await tx.student.updateMany({ where: { facultyId: profile.faculty.id }, data: { facultyId: null } });
      }
      if (profile.warden) {
        await tx.student.updateMany({ where: { wardenId: profile.warden.id }, data: { wardenId: null } });
      }
      await tx.profile.delete({ where: { id: profileId } });
    });
  } catch (err: any) {
    console.error("[deleteUser] database error:", err?.message);
    return { error: "Failed to delete user record" };
  }

  const { error: authError } = await getAdminSupabase().auth.admin.deleteUser(profile.userId);
  invalidateProfileCache(profile.userId);
  clearAdminCaches();
  revalidatePath("/admin/users");

  if (authError && !/not.*found/i.test(authError.message)) {
    console.error("[deleteUser] auth delete failed:", authError.message);
    return {
      error: "The portal account was deleted, but its Supabase login could not be removed. Use 'Delete login' in the account-sync panel above.",
    };
  }
  return { success: true };
}

/**
 * Update an existing gate
 */
export async function updateGate(gateId: string, formData: FormData) {
  await requireRole("ADMIN");

  const parsed = updateGateSchema.safeParse({
    name: formData.get("name") as string,
    location: (formData.get("location") as string) || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, location } = parsed.data;

  try {
    await prisma.gate.update({
      where: { id: gateId },
      data: { name, location: location || null },
    });
    revalidatePath("/admin/gates");
    return { success: true };
  } catch (error: any) {
    if (error.code === 'P2002') return { error: "Gate name already exists" };
    return { error: "Failed to update gate" };
  }
}

/**
 * Toggle gate active status
 */
export async function toggleGateActive(gateId: string) {
  await requireRole("ADMIN");
  
  const gate = await prisma.gate.findUnique({ where: { id: gateId } });
  if (!gate) return { error: "Gate not found" };

  await prisma.gate.update({
    where: { id: gateId },
    data: { active: !gate.active },
  });

  revalidatePath("/admin/gates");
  return { success: true };
}

/**
 * Create a new gate
 */
export async function createGate(formData: FormData) {
  await requireRole("ADMIN");

  const raw = {
    name: formData.get("name") as string,
    location: formData.get("location") as string,
  };

  const parsed = createGateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const existingGate = await prisma.gate.findUnique({
    where: { name: parsed.data.name },
  });

  if (existingGate) {
    return { error: "A gate with this name already exists." };
  }

  await prisma.gate.create({
    data: {
      name: parsed.data.name,
      location: parsed.data.location || null,
    },
  });

  revalidatePath("/admin/gates");
  return { success: true };
}

/**
 * Get admin dashboard stats
 */
export async function getAdminDashboard(dateString?: string) {
  await requireRole("ADMIN");
  const { start: today, end: endOfDay } = istDayRangeFromParam(dateString);

  const [
    totalStudents,
    totalFaculty,
    totalWardens,
    totalSecurity,
    outsidersCount,
    approvedToday,
    rejectedToday,
    entryToday,
    exitToday,
    recentMovements,
    gates,
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
    prisma.movement.count({
      where: { type: "ENTRY", createdAt: { gte: today, lt: endOfDay } },
    }),
    prisma.movement.count({
      where: { type: "EXIT", createdAt: { gte: today, lt: endOfDay } },
    }),
    prisma.movement.findMany({
      where: { createdAt: { gte: today, lt: endOfDay } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        permission: {
          select: { purpose: true, destination: true },
        },
        student: {
          include: {
            profile: { select: { name: true, email: true, phone: true } },
          },
        },
        faculty: { select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } } },
        gate: { select: { name: true } },
        securityUser: {
          include: { profile: { select: { name: true } } },
        },
      },
    }),
    prisma.gate.findMany({ select: { id: true, name: true, active: true } }),
  ]);

  // Right now / today / people counts (same helper as the preload)
  const monitor = await getAdminMonitorCounts(today, endOfDay);

  const dashboardData = {
    stats: {
      totalStudents,
      totalFaculty,
      totalWardens,
      totalSecurity,
      outsidersCount,
      approvedToday,
      rejectedToday,
      entryToday,
      exitToday,
      ...monitor,
    },
    recentMovements,
    gates,
  };

  fillMovementPeople(dashboardData);
  return dashboardData;
}

/**
 * Get all users with pagination
 */
export async function getUsers(
  page: number = 1,
  pageSize: number = 20,
  roleFilter?: string
) {
  await requireRole("ADMIN");

  // Validate inputs: an unknown role (e.g. a client generated before a new role
  // was added) or a bad page number must not crash the page.
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const knownRoles = Object.values(Role) as string[];
  if (roleFilter && !knownRoles.includes(roleFilter)) {
    return { users: [], total: 0 };
  }
  page = safePage;
  pageSize = safePageSize;

  const where = roleFilter ? { role: roleFilter as Role } : {};

  const [users, total] = await Promise.all([
    prisma.profile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        student: {
          select: {
            id: true,
            studentRoll: true,
            department: true,
            year: true,
            semester: true,
            section: true,
            studentType: true,
            hostelType: true,
            status: true,
            roomNumber: true,
            hostelBlock: true,
            facultyId: true,
            wardenId: true,
            faculty: {
              select: {
                id: true,
                profile: { select: { name: true } },
              },
            },
            warden: {
              select: {
                id: true,
                profile: { select: { name: true } },
              },
            },
          },
        },
        faculty: {
          select: {
            id: true,
            employeeId: true,
            department: true,
            designation: true,
            _count: { select: { assignedStudents: true } },
          },
        },
        warden: {
          select: {
            id: true,
            employeeId: true,
            hostelBlock: true,
            _count: { select: { assignedHostellers: true } },
          },
        },
        securityStaff: {
          select: {
            id: true,
            employeeId: true,
            isHead: true,
            gate: {
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    prisma.profile.count({ where }),
  ]);

  const result = { users, total };
  return result;
}

const ADMIN_ONLY_STUDENT_FIELDS = ["email", "studentRoll", "department", "studentType", "hostelType", "facultyId", "wardenId"] as const;

/**
 * Update student details.
 * - ADMIN: all fields, including login email, roll number and assignments.
 * - FACULTY / HOD / WARDEN: only students in their scope, and only contact /
 *   academic-placement fields (no email, roll, department or assignments).
 */
export async function updateStudentDetails(studentId: string, data: Record<string, unknown>) {
  const user = await requireRole("ADMIN", "FACULTY", "FACULTY_ADMIN", "WARDEN");
  const isAdmin = user.role === "ADMIN";
  // Admin, HOD and Warden may change a student's email, roll number, department,
  // type and assignments (only for students they can access — checked below).
  // Faculty members edit contact and cohort details only.
  const canEditRecord = isAdmin || user.role === "FACULTY_ADMIN" || user.role === "WARDEN";

  const scope = await getStaffScope(user);
  if (!(await canAccessStudent(scope, studentId))) {
    return { error: "You are not allowed to edit this student." };
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { profile: true },
  });
  if (!student) return { error: "Student not found" };

  const parsed = (canEditRecord ? adminStudentUpdateSchema : staffStudentUpdateSchema).safeParse(data ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data as Record<string, any>;

  if (!canEditRecord) {
    const current: Record<string, unknown> = {
      email: student.profile.email,
      studentRoll: student.studentRoll,
      department: student.department,
      studentType: student.studentType,
      hostelType: student.hostelType,
      facultyId: student.facultyId,
      wardenId: student.wardenId,
    };
    const attempted = ADMIN_ONLY_STUDENT_FIELDS.filter(
      (k) => data?.[k] !== undefined && (data[k] || null) !== (current[k] || null)
    );
    if (attempted.length > 0) {
      return { error: "Only an administrator, HOD or warden can change email, roll number, department, student type or assignments." };
    }
  }

  // A changed department must be one from the list (an older custom one may stay as it is)
  if (input.department !== undefined && (input.department || null) !== (student.department || null)) {
    const code = listedDepartmentCode(input.department);
    if (!code) return { error: "Choose the student's department from the list." };
    input.department = code;
  }

  if (input.email && input.email !== student.profile.email) {
    const existingEmail = await prisma.profile.findUnique({ where: { email: input.email } });
    if (existingEmail && existingEmail.id !== student.profileId) {
      return { error: `Email ${input.email} is already registered to another user.` };
    }
  }

  if (input.studentRoll && input.studentRoll !== student.studentRoll) {
    const existing = await prisma.student.findUnique({ where: { studentRoll: input.studentRoll } });
    if (existing && existing.id !== studentId) {
      return { error: `Roll number ${input.studentRoll} is already registered to another student.` };
    }
  }

  if (input.facultyId) {
    const mentor = await prisma.faculty.findUnique({ where: { id: input.facultyId }, select: { id: true, department: true } });
    if (!mentor) return { error: "Selected faculty does not exist" };
    // An HOD assigns mentors from their own department
    if (
      scope.kind === "FACULTY_ADMIN" &&
      input.facultyId !== student.facultyId &&
      !getDepartmentVariants(mentor.department).some((d) => scope.deptVariants.includes(d))
    ) {
      return { error: "You can assign faculty from your own department only." };
    }
  }
  if (input.wardenId && !(await prisma.warden.findUnique({ where: { id: input.wardenId }, select: { id: true } }))) {
    return { error: "Selected warden does not exist" };
  }

  const emailChanged = canEditRecord && input.email && input.email !== student.profile.email;
  const nameChanged = !!input.name && input.name !== student.profile.name;
  const phoneChanged = input.phone !== undefined && (input.phone || null) !== student.profile.phone;
  // Keep the Supabase login identical to the portal account (email, name, phone)
  if (emailChanged || nameChanged || phoneChanged) {
    const { error: authError } = await getAdminSupabase().auth.admin.updateUserById(student.profile.userId, {
      ...(emailChanged ? { email: input.email, email_confirm: true } : {}),
      ...(nameChanged || phoneChanged
        ? {
            user_metadata: {
              ...(nameChanged ? { name: input.name, full_name: input.name, display_name: input.name } : {}),
              ...(phoneChanged ? { phone: input.phone || null } : {}),
            },
          }
        : {}),
    });
    if (authError) return { error: "Failed to update the login account: " + authError.message };
  }

  try {
    await prisma.$transaction([
      prisma.profile.update({
        where: { id: student.profileId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(emailChanged ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        },
      }),
      prisma.student.update({
        where: { id: studentId },
        data: {
          ...(input.studentRoll ? { studentRoll: input.studentRoll } : {}),
          ...(input.department !== undefined ? { department: input.department || null } : {}),
          ...(input.year !== undefined ? { year: input.year ?? null } : {}),
          ...(input.semester !== undefined ? { semester: input.semester ?? null } : {}),
          ...(input.section !== undefined ? { section: input.section || null } : {}),
          ...(input.studentType ? { studentType: input.studentType } : {}),
          ...(input.hostelType !== undefined ? { hostelType: input.hostelType || null } : {}),
          ...(input.facultyId !== undefined ? { facultyId: input.facultyId || null } : {}),
          ...(input.wardenId !== undefined ? { wardenId: input.wardenId || null } : {}),
          ...(input.roomNumber !== undefined ? { roomNumber: input.roomNumber || null } : {}),
          ...(input.hostelBlock !== undefined ? { hostelBlock: input.hostelBlock || null } : {}),
          // A day scholar has no hostel: warden, hostel, block and room are always cleared
          ...((input.studentType || student.studentType) === "DAY_SCHOLAR"
            ? { wardenId: null, hostelType: null, hostelBlock: null, roomNumber: null }
            : {}),
        },
      }),
    ]);
  } catch (err: any) {
    if (emailChanged || nameChanged || phoneChanged) {
      // Put the login back so the two never disagree
      const p = student.profile;
      await getAdminSupabase()
        .auth.admin.updateUserById(p.userId, {
          ...(emailChanged ? { email: p.email } : {}),
          user_metadata: { name: p.name, full_name: p.name, display_name: p.name, phone: p.phone },
        })
        .catch(() => {});
    }
    if (err?.code === "P2002") return { error: "Email or roll number is already in use." };
    return { error: "Failed to update student" };
  }

  clearAdminCaches();
  revalidatePath("/admin/users");
  revalidatePath("/faculty/students");
  revalidatePath("/faculty-admin/students");
  revalidatePath("/warden/students");
  revalidatePath("/student");
  return { success: true };
}

/**
 * Admin updates details for Faculty, Warden, or Security
 */
export async function updateUserDetails(profileId: string, rawData: Record<string, unknown>) {
  await requireRole("ADMIN");

  const parsed = adminUserUpdateSchema.safeParse(rawData ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      faculty: true,
      warden: true,
      securityStaff: true,
    },
  });

  if (!profile) return { error: "User not found" };

  const emailChanged = !!data.email && data.email !== profile.email;
  const nameChanged = !!data.name && data.name !== profile.name;
  const phoneChanged = data.phone !== undefined && (data.phone || null) !== profile.phone;
  if (emailChanged) {
    const existing = await prisma.profile.findUnique({ where: { email: data.email! } });
    if (existing && existing.id !== profileId) {
      return { error: `Email ${data.email} is already registered to another user.` };
    }
  }

  if (data.gateId && !(await prisma.gate.findUnique({ where: { id: data.gateId }, select: { id: true } }))) {
    return { error: "Selected gate does not exist" };
  }

  // Keep the Supabase login identical to the portal account (email, name, phone)
  if (emailChanged || nameChanged || phoneChanged) {
    const { error: authError } = await getAdminSupabase().auth.admin.updateUserById(profile.userId, {
      ...(emailChanged ? { email: data.email, email_confirm: true } : {}),
      ...(nameChanged || phoneChanged
        ? {
            user_metadata: {
              ...(nameChanged ? { name: data.name, full_name: data.name, display_name: data.name } : {}),
              ...(phoneChanged ? { phone: data.phone || null } : {}),
            },
          }
        : {}),
    });
    if (authError) return { error: "Failed to update the login account: " + authError.message };
  }

  // Profile and role record change together (one transaction): never half-saved
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  if (data.name !== undefined || data.phone !== undefined || emailChanged) {
    writes.push(
      prisma.profile.update({
        where: { id: profileId },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(emailChanged ? { email: data.email } : {}),
          ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        },
      })
    );
  }
  if (["FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN"].includes(profile.role) && profile.faculty) {
    writes.push(
      prisma.faculty.update({
        where: { id: profile.faculty.id },
        data: {
          ...(data.department !== undefined ? { department: data.department || null } : {}),
          ...(data.designation !== undefined ? { designation: data.designation || null } : {}),
          ...(data.employeeId !== undefined ? { employeeId: data.employeeId || null } : {}),
        },
      })
    );
  } else if (profile.role === "WARDEN" && profile.warden) {
    writes.push(
      prisma.warden.update({
        where: { id: profile.warden.id },
        data: {
          ...(data.hostelBlock !== undefined ? { hostelBlock: data.hostelBlock || null } : {}),
          ...(data.employeeId !== undefined ? { employeeId: data.employeeId || null } : {}),
        },
      })
    );
  } else if (profile.role === "SECURITY" && profile.securityStaff) {
    writes.push(
      prisma.securityStaff.update({
        where: { id: profile.securityStaff.id },
        data: {
          ...(data.gateId !== undefined ? { gateId: data.gateId || null } : {}),
          ...(data.employeeId !== undefined ? { employeeId: data.employeeId || null } : {}),
          ...(typeof data.isHeadSecurity === "boolean" ? { isHead: data.isHeadSecurity } : {}),
        },
      })
    );
  }

  try {
    if (writes.length) await prisma.$transaction(writes);
  } catch (err: any) {
    // Put the login back so the two never disagree
    if (emailChanged || nameChanged || phoneChanged) {
      await getAdminSupabase()
        .auth.admin.updateUserById(profile.userId, {
          ...(emailChanged ? { email: profile.email } : {}),
          user_metadata: { name: profile.name, full_name: profile.name, display_name: profile.name, phone: profile.phone },
        })
        .catch(() => {});
    }
    if (err?.code === "P2002") {
      const target = String(err?.meta?.target ?? "");
      return { error: target.includes("employee") ? "That Employee ID is already used by another account." : "Email is already in use." };
    }
    console.error("[updateUserDetails] failed:", err?.message);
    return { error: "Failed to update user" };
  }

  clearAdminCaches();
  clearRoleLine(profileId);
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Faculty: only their assigned students. HOD: assigned + their department.
 */
export async function getFacultyStudents() {
  const user = await requireRole("FACULTY", "FACULTY_ADMIN");

  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, department: true },
  });

  if (!faculty) return { students: [] };

  const deptVariants = user.role === "FACULTY_ADMIN" ? getDepartmentVariants(faculty.department) : [];
  const students = await prisma.student.findMany({
    where: {
      OR: [
        { facultyId: faculty.id },
        ...(deptVariants.length > 0 ? [{ department: { in: deptVariants } }] : []),
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
  });

  return { students };
}

/**
 * Get detailed info for a specific user for the details modal
 */
export async function getUserDetails(profileId: string, role: string) {
  await requireRole("ADMIN");

  let data = null;

  if (role === "STUDENT") {
    data = await prisma.student.findUnique({
      where: { profileId },
      include: {
        profile: true,
        faculty: { include: { profile: true } },
        warden: { include: { profile: true } },
      }
    });
  } else if (role === "FACULTY" || role === "FACULTY_ADMIN") {
    data = await prisma.faculty.findUnique({
      where: { profileId },
      include: {
        profile: true,
        _count: { select: { assignedStudents: true } }
      }
    });
  } else if (role === "WARDEN") {
    data = await prisma.warden.findUnique({
      where: { profileId },
      include: {
        profile: true,
        _count: { select: { assignedHostellers: true } }
      }
    });
  } else if (role === "SECURITY") {
    data = await prisma.securityStaff.findUnique({
      where: { profileId },
      include: {
        profile: true,
        gate: true
      }
    });
  }

  return data;
}

/**
 * Get comprehensive user details, past permissions, and full activity logs for a user
 */
export async function getUserFullHistory(profileId: string): Promise<any> {
  const user = await requireRole("ADMIN", "FACULTY", "FACULTY_ADMIN", "WARDEN");
  if (typeof profileId !== "string" || !profileId) return null;

  // Accept a Student id as well (legacy links): resolve it to the profile (and its role) in one query.
  const target = await prisma.profile.findFirst({
    where: { OR: [{ id: profileId }, { student: { id: profileId } }] },
    select: { id: true, role: true },
  });
  if (!target) return null;
  profileId = target.id;
  const pid = profileId;

  const HISTORY_LIMIT = 500;
  const nameOnly = { include: { profile: { select: { name: true } } } } as const;
  const contact = { select: { id: true, name: true, email: true, phone: true } } as const;
  const gateAndGuard = {
    gate: { select: { name: true, location: true } },
    securityUser: nameOnly,
  } as const;
  const assignedPerson = { include: { profile: { select: { id: true, name: true, email: true, phone: true, active: true } } } } as const;
  const approvalsOf = (who: "faculty" | "warden") =>
    prisma.permissionApproval.findMany({
      where: { [who]: { profileId: pid } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { permission: { include: { student: { include: { profile: { select: { name: true, email: true } } } } } } },
    });

  // Each history list is its own query so they load in parallel (instead of
  // one long chain of ~25 round trips). Only the lists this kind of account
  // has are loaded.
  const branches = {
    student: () =>
      Promise.all([
        prisma.permission.findMany({
          where: { student: { profileId: pid } },
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
          include: {
            approval: { include: { faculty: nameOnly, warden: nameOnly } },
            movements: { orderBy: { createdAt: "asc" }, include: gateAndGuard },
          },
        }),
        prisma.movement.findMany({
          where: { student: { profileId: pid } },
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
          include: { ...gateAndGuard, permission: { select: { purpose: true, destination: true, status: true } } },
        }),
      ]).then(([permissions, movements]) => ({ permissions, movements })),
    faculty: () =>
      Promise.all([
        prisma.student.findMany({ where: { faculty: { profileId: pid } }, ...assignedPerson }),
        prisma.permission.findMany({
          where: { faculty: { profileId: pid } },
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
          include: {
            approval: { include: { faculty: nameOnly } },
            movements: { orderBy: { createdAt: "asc" }, include: gateAndGuard },
          },
        }),
        approvalsOf("faculty"),
      ]).then(([assignedStudents, permissions, permissionApprovals]) => ({ assignedStudents, permissions, permissionApprovals })),
    warden: () =>
      Promise.all([prisma.student.findMany({ where: { warden: { profileId: pid } }, ...assignedPerson }), approvalsOf("warden")]).then(
        ([assignedHostellers, permissionApprovals]) => ({ assignedHostellers, permissionApprovals })
      ),
    securityStaff: () =>
      prisma.movement
        .findMany({
          where: { securityUser: { profileId: pid } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            gate: true,
            student: { include: { profile: { select: { name: true, email: true } } } },
            permission: { select: { purpose: true, destination: true } },
          },
        })
        .then((movements) => ({ movements })),
  };
  type Branch = keyof typeof branches;
  const expected: Branch[] =
    target.role === "STUDENT"
      ? ["student"]
      : target.role === "WARDEN"
      ? ["warden"]
      : target.role === "SECURITY"
      ? ["securityStaff"]
      : ["FACULTY", "FACULTY_ADMIN", "DEAN", "DIRECTOR"].includes(target.role)
      ? ["faculty"]
      : [];
  const started = new Map<Branch, Promise<Record<string, unknown>>>(expected.map((b) => [b, branches[b]()]));

  // The permission check runs alongside the loading; nothing is returned unless it passes.
  const [allowed, base] = await Promise.all([
    getStaffScope(user).then((scope) => canViewProfile(scope, pid)),
    prisma.profile.findUnique({
      where: { id: pid },
      include: {
        student: { include: { faculty: { include: { profile: contact } }, warden: { include: { profile: contact } } } },
        faculty: true,
        warden: true,
        securityStaff: { include: { gate: true } },
      },
    }),
  ]);
  if (!allowed || !base) return null;

  // Same shape as before: the lists hang off their role records. (An account
  // holding an unexpected extra record still gets that record's lists.)
  const attach = async (b: Branch) => {
    const rec = (base as any)[b];
    if (!rec) return null;
    return { ...rec, ...(await (started.get(b) ?? branches[b]())) };
  };
  const [student, faculty, warden, securityStaff] = await Promise.all([
    attach("student"),
    attach("faculty"),
    attach("warden"),
    attach("securityStaff"),
  ]);
  const profile: any = { ...base, student, faculty, warden, securityStaff };

  if (!profile) return null;

  // Never ship the Supabase auth user id to the browser.
  const { userId: _authUserId, ...safeProfile } = profile;
  return safeProfile;
}

/**
 * Get all faculty list (for assigning to students or submitting requests)
 */
export async function getAllFaculty() {
  await requireRole("ADMIN", "STUDENT", "FACULTY", "FACULTY_ADMIN", "WARDEN", "DIRECTOR", "DEAN");

  const data = await prisma.faculty.findMany({
    select: {
      id: true,
      department: true,
      profile: { select: { name: true } }, // Only name, email not needed for forms
    },
    orderBy: { profile: { name: "asc" } },
  });

  return data;
}

/**
 * Get all wardens list (for assigning to students or submitting requests)
 */
export async function getAllWardens() {
  await requireRole("ADMIN", "STUDENT", "FACULTY", "FACULTY_ADMIN", "WARDEN", "DIRECTOR");
  const data = await prisma.warden.findMany({
    select: {
      id: true,
      hostelBlock: true,
      profile: { select: { name: true } }, // Only name, email not needed for forms
    },
    orderBy: { profile: { name: "asc" } },
  });

  return data;
}

/**
 * Get all gates list (for assigning to security)
 */
export async function getAllGates() {
  await requireRole("ADMIN", "FACULTY", "FACULTY_ADMIN", "WARDEN", "DIRECTOR", "DEAN");

  const data = await prisma.gate.findMany({
    select: {
      id: true,
      name: true,
      active: true,
    },
  });

  return data;
}

/**
 * Get all gates with full details for Admin Gates management page
 */
export async function getAdminGates() {
  await requireRole("ADMIN");
  const data = await prisma.gate.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, location: true, active: true, createdAt: true },
  });

  return data;
}

/**
 * Assign faculty to student
 */
export async function assignFacultyToStudent(studentId: string, facultyId: string) {
  const admin = await requireRole("ADMIN");

  await prisma.student.update({
    where: { id: studentId },
    data: { facultyId: facultyId || null },
  });

  clearAdminCaches();
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Assign warden to student
 */
export async function assignWardenToStudent(studentId: string, wardenId: string) {
  const admin = await requireRole("ADMIN");

  await prisma.student.update({
    where: { id: studentId },
    data: { wardenId: wardenId || null },
  });

  clearAdminCaches();
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Assign gate to security
 */
export async function assignGateToSecurity(securityId: string, gateId: string) {
  const admin = await requireRole("ADMIN");

  await prisma.securityStaff.update({
    where: { id: securityId },
    data: { gateId: gateId || null },
  });

  clearAdminCaches();
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Get comprehensive activity logs for the admin Activity tab
 */
export async function getActivityData(dateString?: string) {
  await requireRole("ADMIN");
  const { start: today, end: endOfDay } = istDayRangeFromParam(dateString);

  // Fetch Movement Data and Stats in parallel
  const [
    entriesToday,
    exitsToday,
    totalMovements,
    recentEntries,
    recentExits,
    outsidersCount,
    outsiders,
    entryPermissions,
    exitPermissions
  ] = await Promise.all([
    prisma.movement.count({
      where: {
        type: "ENTRY",
        createdAt: { gte: today, lt: endOfDay },
      },
    }),
    prisma.movement.count({
      where: {
        type: "EXIT",
        createdAt: { gte: today, lt: endOfDay },
      },
    }),
    prisma.movement.count(),
    prisma.movement.findMany({
      where: { type: "ENTRY", createdAt: { gte: today, lt: endOfDay } },
      take: 60,
      orderBy: { createdAt: "desc" },
      include: {
        permission: {
          select: { purpose: true, destination: true },
        },
        student: {
          include: {
            profile: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        faculty: {
          select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } },
        },
        gate: { select: { name: true, location: true } },
        securityUser: {
          include: { profile: { select: { name: true } } },
        },
      },
    }),
    prisma.movement.findMany({
      where: { type: "EXIT", createdAt: { gte: today, lt: endOfDay } },
      take: 60,
      orderBy: { createdAt: "desc" },
      include: {
        permission: {
          select: { purpose: true, destination: true },
        },
        student: {
          include: {
            profile: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        faculty: {
          select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } },
        },
        gate: { select: { name: true, location: true } },
        securityUser: {
          include: { profile: { select: { name: true } } },
        },
      },
    }),
    prisma.outsider.count({ where: { status: "INSIDE", entryTime: { gte: today, lt: endOfDay } } }),
    prisma.outsider.findMany({
      where: { entryTime: { gte: today, lt: endOfDay } },
      orderBy: { entryTime: "desc" },
      // Meeting a faculty / staff member (the code itself is never sent)
      include: { visitPass: { select: { hostName: true, status: true, attempts: true } } },
    })
  ,
    prisma.permission.findMany({
      where: { type: "ENTRY", createdAt: { gte: today, lt: endOfDay } },
      take: 60,
      orderBy: { createdAt: "desc" },
      include: {
        student: { include: { profile: { select: { id: true, name: true, email: true, phone: true } } } },
        faculty: {
          select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } },
        },
      }
    }),
    prisma.permission.findMany({
      where: { type: "EXIT", createdAt: { gte: today, lt: endOfDay } },
      take: 60,
      orderBy: { createdAt: "desc" },
      include: {
        student: { include: { profile: { select: { id: true, name: true, email: true, phone: true } } } },
        faculty: {
          select: { employeeId: true, department: true, designation: true, profile: { select: { id: true, name: true, email: true, phone: true } } },
        },
      }
    })
  ]);

  // A record belongs to a student or a faculty member. Faculty records are sent in
  // the same shape (name, ID, email, phone) so the page shows the right person.
  const personOf = (r: any) =>
    r.student ??
    (r.faculty
      ? {
          isFaculty: true,
          studentRoll: r.faculty.employeeId || "Faculty",
          department: r.faculty.department,
          designation: r.faculty.designation,
          profile: r.faculty.profile,
        }
      : null);

  // Pass *requests* are listed alongside gate scans but flagged and NOT counted as movements.
  const formattedEntryPerms = entryPermissions.map((p: any) => ({
    id: p.id,
    isRequest: true,
    type: "ENTRY",
    createdAt: p.createdAt,
    student: personOf(p),
    gate: { name: "Not scanned yet", location: "Pass request" },
    permission: { purpose: p.purpose, destination: p.destination },
    securityUser: null
  }));

  const formattedExitPerms = exitPermissions.map((p: any) => ({
    id: p.id,
    isRequest: true,
    type: "EXIT",
    createdAt: p.createdAt,
    student: personOf(p),
    gate: { name: "Not scanned yet", location: "Pass request" },
    permission: { purpose: p.purpose, destination: p.destination },
    securityUser: null
  }));

  const mergedEntries = [...recentEntries.map((m: any) => ({ ...m, student: personOf(m) })), ...formattedEntryPerms].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const mergedExits = [...recentExits.map((m: any) => ({ ...m, student: personOf(m) })), ...formattedExitPerms].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const activityData = {
    stats: {
      entriesToday,
      exitsToday,
      entryRequestsToday: entryPermissions.length,
      exitRequestsToday: exitPermissions.length,
      totalMovements,
      outsidersOnCampus: outsidersCount,
    },
    recentEntries: mergedEntries, 
    recentExits: mergedExits, 
    outsiders 
  };

  return activityData;
}


// ──────────────────────────────────────────────────────────────
// PORTAL ⇄ SUPABASE AUTH SYNC (Admin only)
// ──────────────────────────────────────────────────────────────

/** Compares portal accounts with Supabase Auth logins. */
export async function getAccountSyncStatus() {
  await requireRole("ADMIN");
  try {
    return { report: await getSyncReport() };
  } catch (err: any) {
    console.error("[getAccountSyncStatus]", err?.message);
    return { error: "Could not read Supabase Auth logins. Try again shortly." };
  }
}

/** Removes/disables portal accounts without a login and fixes email differences. */
export async function fixAccountSync() {
  await requireRole("ADMIN");
  try {
    const result = await reconcilePortalWithLogins();
    clearAdminCaches();
    revalidatePath("/admin/users");
    return { success: true, ...result };
  } catch (err: any) {
    console.error("[fixAccountSync]", err?.message);
    return { error: "Sync failed. No changes were made where the login list could not be read." };
  }
}

/** Deletes a Supabase login that has no portal account. */
export async function removeLoginWithoutPortal(authUserId: string) {
  await requireRole("ADMIN");
  if (typeof authUserId !== "string" || !authUserId) return { error: "Invalid login" };
  const res = await deleteLoginWithoutPortal(authUserId);
  if (res.error) return { error: res.error };
  return { success: true };
}

// Outsider / visitor actions live in ./outsiders.ts (single implementation).

export async function getWardenStudents() {
  const user = await requireRole("WARDEN");

  const warden = await prisma.warden.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, hostelBlock: true },
  });

  if (!warden) return { students: [] };

  const students = await prisma.student.findMany({
    where: { wardenId: warden.id },
    include: {
      profile: true,
      permissions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { studentRoll: "asc" },
  });

  return {
    students: students.map(s => ({
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
    })),
    warden,
  };
}




/**
 * Sets a new password for someone else's login.
 * - Main Admin: any account except other Admins.
 * - HOD: students and faculty of their own department only.
 */
export async function resetUserPassword(profileId: string, newPassword: string) {
  const user = await requireRole("ADMIN", "FACULTY_ADMIN", "WARDEN");
  if (typeof profileId !== "string" || !profileId) return { error: "User not found" };
  if (typeof newPassword !== "string" || newPassword.length < 8) return { error: "Password must be at least 8 characters" };
  // Generous for real use, but stops a misused staff session from mass-changing passwords
  if (!checkRateLimit(`password-reset:${user.id}`, { maxAttempts: 30, windowMs: 15 * 60_000 }).allowed) {
    return { error: "Too many password changes in a short time. Please wait a few minutes." };
  }
  if (newPassword.length > 72) return { error: "Password must be at most 72 characters" };

  const target = await prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true, role: true, name: true } });
  if (!target) return { error: "User not found" };
  if (target.userId === user.userId) return { error: "Change your own password in Settings" };

  if (user.role === "ADMIN") {
    if (target.role === "ADMIN") return { error: "Admin passwords cannot be reset here" };
  } else if (user.role === "WARDEN") {
    // Warden: only their own hostel students
    if (target.role !== "STUDENT") return { error: "You can change passwords only for your hostel students" };
    const scope = await getStaffScope(user);
    if (!(await canViewProfile(scope, profileId))) return { error: "This student is not assigned to you" };
  } else {
    // HOD: only their department's students and faculty
    if (target.role !== "STUDENT" && target.role !== "FACULTY") {
      return { error: "You can reset passwords only for students and faculty" };
    }
    const scope = await getStaffScope(user);
    if (!(await canViewProfile(scope, profileId))) return { error: "This person is not in your department" };
  }

  // Recorded on the login itself (same request, no extra table): the student is
  // told who changed it the next time they sign in.
  const changedByRole = user.role === "ADMIN" ? "Administrator" : user.role === "WARDEN" ? "Warden" : "HOD";
  const { error } = await getAdminSupabase().auth.admin.updateUserById(target.userId, {
    password: newPassword,
    app_metadata: {
      password_changed_by: user.name,
      password_changed_by_role: changedByRole,
      password_changed_at: new Date().toISOString(),
      password_notice_pending: true,
    },
  });
  if (error) {
    console.error("[resetUserPassword] failed:", error.message);
    return { error: "Could not change the password. Please try again." };
  }
  return { success: true };
}

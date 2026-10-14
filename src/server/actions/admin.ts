"use server";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
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
import { getDepartmentVariants } from "@/lib/constants";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

// In-memory caches to make frequent admin dashboard, gates, and user navigation blazing fast
let cachedDashboard: { data: any; expiresAt: number } | null = null;
let cachedFaculty: { data: any; expiresAt: number } | null = null;
let cachedWardens: { data: any; expiresAt: number } | null = null;
let cachedGates: { data: any; expiresAt: number } | null = null;
let cachedAdminGates: { data: any; expiresAt: number } | null = null;
let cachedActivity: { data: any; expiresAt: number } | null = null;
const userDetailsCache = new Map<string, { data: any; expiresAt: number }>();
const usersListCache = new Map<string, { data: any; expiresAt: number }>();

export async function invalidateAdminCaches() {
  // Exported from a "use server" module, so it is callable from the browser:
  // require a signed-in user (it only clears caches, but avoid anonymous abuse).
  if (!(await getAuthUser())) return;
  cachedDashboard = null;
  cachedFaculty = null;
  cachedWardens = null;
  cachedGates = null;
  cachedAdminGates = null;
  cachedActivity = null;
  userDetailsCache.clear();
  usersListCache.clear();
  invalidateProfileCache();
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
    section: (formData.get("section") as string) || "",
    studentType: (formData.get("studentType") as string) || undefined,
    roomNumber: (formData.get("roomNumber") as string) || "",
    hostelBlock: (formData.get("hostelBlock") as string) || "",
    designation: (formData.get("designation") as string) || "",
    wardenHostelBlock: (formData.get("wardenHostelBlock") as string) || "",
  };

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;

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
            section: data.section || null,
            studentType: (data.studentType as any) || "DAY_SCHOLAR",
            facultyId: facultyId || null,
            wardenId: wardenId || null,
            roomNumber: data.roomNumber || null,
            hostelBlock: data.hostelBlock || null,
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
            designation: data.designation || "Director",
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
            designation: data.designation || "Dean",
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
          },
        });
        break;
    }
    });

    invalidateAdminCaches();
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
 * Admin toggles a user's active status
 */
export async function toggleUserActive(profileId: string) {
  await requireRole("ADMIN");

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { active: true, role: true, userId: true },
  });

  if (!profile) return { error: "User not found" };

  if (profile.role === "ADMIN") return { error: "Cannot disable admin accounts" };

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
  invalidateAdminCaches();
  revalidatePath("/admin/users");
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
    },
  });

  if (!profile) return { error: "User not found" };
  if (profile.role === "ADMIN") return { error: "Cannot delete admin accounts" };

  const counts = [
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
  invalidateAdminCaches();
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
    cachedGates = null;
    cachedAdminGates = null;
    cachedDashboard = null;
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

  cachedGates = null;
  cachedAdminGates = null;
  cachedDashboard = null;
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

  cachedGates = null;
  cachedAdminGates = null;
  cachedDashboard = null;
  revalidatePath("/admin/gates");
  return { success: true };
}

/**
 * Get admin dashboard stats
 */
export async function getAdminDashboard(dateString?: string) {
  await requireRole("ADMIN");
  if (!dateString && cachedDashboard && cachedDashboard.expiresAt > Date.now()) {
    return cachedDashboard.data;
  }
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
        gate: { select: { name: true } },
        securityUser: {
          include: { profile: { select: { name: true } } },
        },
      },
    }),
    prisma.gate.findMany({ select: { id: true, name: true, active: true } }),
  ]);

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
    },
    recentMovements,
    gates,
  };

  if (!dateString) {
    cachedDashboard = { data: dashboardData, expiresAt: Date.now() + 10_000 };
  }
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

  const cacheKey = `${page}-${pageSize}-${roleFilter || "ALL"}`;
  const cached = usersListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const where = roleFilter
    ? { role: roleFilter as Role }
    : { role: { not: Role.ADMIN } };

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
            section: true,
            studentType: true,
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
  usersListCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
  return result;
}

const ADMIN_ONLY_STUDENT_FIELDS = ["email", "studentRoll", "department", "studentType", "facultyId", "wardenId"] as const;

/**
 * Update student details.
 * - ADMIN: all fields, including login email, roll number and assignments.
 * - FACULTY / HOD / WARDEN: only students in their scope, and only contact /
 *   academic-placement fields (no email, roll, department or assignments).
 */
export async function updateStudentDetails(studentId: string, data: Record<string, unknown>) {
  const user = await requireRole("ADMIN", "FACULTY", "FACULTY_ADMIN", "WARDEN");
  const isAdmin = user.role === "ADMIN";

  const scope = await getStaffScope(user);
  if (!(await canAccessStudent(scope, studentId))) {
    return { error: "You are not allowed to edit this student." };
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { profile: true },
  });
  if (!student) return { error: "Student not found" };

  const parsed = (isAdmin ? adminStudentUpdateSchema : staffStudentUpdateSchema).safeParse(data ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data as Record<string, any>;

  if (!isAdmin) {
    const current: Record<string, unknown> = {
      email: student.profile.email,
      studentRoll: student.studentRoll,
      department: student.department,
      studentType: student.studentType,
      facultyId: student.facultyId,
      wardenId: student.wardenId,
    };
    const attempted = ADMIN_ONLY_STUDENT_FIELDS.filter(
      (k) => data?.[k] !== undefined && (data[k] || null) !== (current[k] || null)
    );
    if (attempted.length > 0) {
      return { error: "Only an administrator can change email, roll number, department, student type or assignments." };
    }
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

  if (input.facultyId && !(await prisma.faculty.findUnique({ where: { id: input.facultyId }, select: { id: true } }))) {
    return { error: "Selected faculty does not exist" };
  }
  if (input.wardenId && !(await prisma.warden.findUnique({ where: { id: input.wardenId }, select: { id: true } }))) {
    return { error: "Selected warden does not exist" };
  }

  const emailChanged = isAdmin && input.email && input.email !== student.profile.email;
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
          ...(input.section !== undefined ? { section: input.section || null } : {}),
          ...(input.studentType ? { studentType: input.studentType } : {}),
          ...(input.facultyId !== undefined ? { facultyId: input.facultyId || null } : {}),
          ...(input.wardenId !== undefined ? { wardenId: input.wardenId || null } : {}),
          ...(input.roomNumber !== undefined ? { roomNumber: input.roomNumber || null } : {}),
          ...(input.hostelBlock !== undefined ? { hostelBlock: input.hostelBlock || null } : {}),
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

  invalidateAdminCaches();
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

  if (data.name !== undefined || data.phone !== undefined || emailChanged) {
    try {
      await prisma.profile.update({
        where: { id: profileId },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(emailChanged ? { email: data.email } : {}),
          ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        },
      });
    } catch (err: any) {
      // Put the login back so the two never disagree
      await getAdminSupabase()
        .auth.admin.updateUserById(profile.userId, {
          ...(emailChanged ? { email: profile.email } : {}),
          user_metadata: { name: profile.name, full_name: profile.name, display_name: profile.name, phone: profile.phone },
        })
        .catch(() => {});
      if (err?.code === "P2002") return { error: "Email is already in use." };
      return { error: "Failed to update user" };
    }
  }

  if (["FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN"].includes(profile.role) && profile.faculty) {
    await prisma.faculty.update({
      where: { id: profile.faculty.id },
      data: {
        ...(data.department !== undefined ? { department: data.department || null } : {}),
        ...(data.designation !== undefined ? { designation: data.designation || null } : {}),
        ...(data.employeeId !== undefined ? { employeeId: data.employeeId || null } : {}),
      },
    });
  } else if (profile.role === "WARDEN" && profile.warden) {
    await prisma.warden.update({
      where: { id: profile.warden.id },
      data: {
        ...(data.hostelBlock !== undefined ? { hostelBlock: data.hostelBlock || null } : {}),
        ...(data.employeeId !== undefined ? { employeeId: data.employeeId || null } : {}),
      },
    });
  } else if (profile.role === "SECURITY" && profile.securityStaff) {
    await prisma.securityStaff.update({
      where: { id: profile.securityStaff.id },
      data: {
        ...(data.gateId !== undefined ? { gateId: data.gateId || null } : {}),
        ...(data.employeeId !== undefined ? { employeeId: data.employeeId || null } : {}),
      },
    });
  }

  invalidateAdminCaches();
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Faculty gets their assigned students (and departmental students)
 */
export async function getFacultyStudents() {
  const user = await requireRole("FACULTY", "FACULTY_ADMIN");

  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, department: true },
  });

  if (!faculty) return { students: [] };

  const deptVariants = getDepartmentVariants(faculty.department);
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

  const cacheKey = `${profileId}-${role}`;
  const cached = userDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

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

  if (data) {
    userDetailsCache.set(cacheKey, { data, expiresAt: Date.now() + 20_000 });
  }

  return data;
}

/**
 * Get comprehensive user details, past permissions, and full activity logs for a user
 */
export async function getUserFullHistory(profileId: string): Promise<any> {
  const user = await requireRole("ADMIN", "FACULTY", "FACULTY_ADMIN", "WARDEN");
  if (typeof profileId !== "string" || !profileId) return null;

  // Accept a Student id as well (legacy links), then authorize on the profile.
  const viaStudent = await prisma.student.findUnique({ where: { id: profileId }, select: { profileId: true } });
  if (viaStudent) profileId = viaStudent.profileId;

  const scope = await getStaffScope(user);
  if (!(await canViewProfile(scope, profileId))) return null;

  const HISTORY_LIMIT = 100;

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      student: {
        include: {
          faculty: {
            include: { profile: { select: { id: true, name: true, email: true, phone: true } } },
          },
          warden: {
            include: { profile: { select: { id: true, name: true, email: true, phone: true } } },
          },
          permissions: {
            orderBy: { createdAt: "desc" },
            take: HISTORY_LIMIT,
            include: {
              approval: {
                include: {
                  faculty: { include: { profile: { select: { name: true } } } },
                  warden: { include: { profile: { select: { name: true } } } },
                },
              },
              movements: {
                orderBy: { createdAt: "asc" },
                include: {
                  gate: { select: { name: true, location: true } },
                  securityUser: { include: { profile: { select: { name: true } } } },
                },
              },
            },
          },
          movements: {
            orderBy: { createdAt: "desc" },
            take: HISTORY_LIMIT,
            include: {
              gate: { select: { name: true, location: true } },
              securityUser: { include: { profile: { select: { name: true } } } },
              permission: { select: { purpose: true, destination: true, status: true } },
            },
          },
        },
      },
      faculty: {
        include: {
          assignedStudents: {
            include: {
              profile: { select: { id: true, name: true, email: true, phone: true, active: true } },
            },
          },
          permissions: {
            orderBy: { createdAt: "desc" },
            take: HISTORY_LIMIT,
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
            },
          },
          permissionApprovals: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              permission: {
                include: {
                  student: { include: { profile: { select: { name: true, email: true } } } },
                },
              },
            },
          },
        },
      },
      warden: {
        include: {
          assignedHostellers: {
            include: {
              profile: { select: { id: true, name: true, email: true, phone: true, active: true } },
            },
          },
          permissionApprovals: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              permission: {
                include: {
                  student: { include: { profile: { select: { name: true, email: true } } } },
                },
              },
            },
          },
        },
      },
      securityStaff: {
        include: {
          gate: true,
          movements: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              gate: true,
              student: { include: { profile: { select: { name: true, email: true } } } },
              permission: { select: { purpose: true, destination: true } },
            },
          },
        },
      },
    },
  });

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
  if (cachedFaculty && cachedFaculty.expiresAt > Date.now()) {
    return cachedFaculty.data;
  }

  const data = await prisma.faculty.findMany({
    select: {
      id: true,
      department: true,
      profile: { select: { name: true } }, // Only name, email not needed for forms
    },
    orderBy: { profile: { name: "asc" } },
  });

  // Cache for 5 minutes - faculty list rarely changes
  cachedFaculty = { data, expiresAt: Date.now() + 300_000 };
  return data;
}

/**
 * Get all wardens list (for assigning to students or submitting requests)
 */
export async function getAllWardens() {
  await requireRole("ADMIN", "STUDENT", "FACULTY", "FACULTY_ADMIN", "WARDEN", "DIRECTOR");
  if (cachedWardens && cachedWardens.expiresAt > Date.now()) {
    return cachedWardens.data;
  }
  const data = await prisma.warden.findMany({
    select: {
      id: true,
      hostelBlock: true,
      profile: { select: { name: true } }, // Only name, email not needed for forms
    },
    orderBy: { profile: { name: "asc" } },
  });

  // Cache for 5 minutes - warden list rarely changes
  cachedWardens = { data, expiresAt: Date.now() + 300_000 };
  return data;
}

/**
 * Get all gates list (for assigning to security)
 */
export async function getAllGates() {
  await requireRole("ADMIN", "FACULTY", "FACULTY_ADMIN", "WARDEN", "DIRECTOR", "DEAN");

  if (cachedGates && cachedGates.expiresAt > Date.now()) {
    return cachedGates.data;
  }  const data = await prisma.gate.findMany({
    select: {
      id: true,
      name: true,
      active: true,
    },
  });

  cachedGates = { data, expiresAt: Date.now() + 30_000 };
  return data;
}

/**
 * Get all gates with full details for Admin Gates management page
 */
export async function getAdminGates() {
  await requireRole("ADMIN");
  if (cachedAdminGates && cachedAdminGates.expiresAt > Date.now()) {
    return cachedAdminGates.data;
  }
  const data = await prisma.gate.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, location: true, active: true, createdAt: true },
  });

  cachedAdminGates = { data, expiresAt: Date.now() + 30_000 };
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

  invalidateAdminCaches();
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

  invalidateAdminCaches();
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

  invalidateAdminCaches();
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Get comprehensive activity logs for the admin Activity tab
 */
export async function getActivityData(dateString?: string) {
  await requireRole("ADMIN");
  if (
    !dateString &&
    cachedActivity &&
    Array.isArray(cachedActivity.data?.recentEntries) &&
    Array.isArray(cachedActivity.data?.recentExits) &&
    cachedActivity.expiresAt > Date.now()
  ) {
    return cachedActivity.data;
  }
  const { start: today, end: endOfDay } = istDayRangeFromParam(dateString);

  // Fetch Movement Data and Stats in parallel
  const [
    entriesToday,
    exitsToday,
    studentsOutside,
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
    prisma.student.count({
      where: {
        status: "OUTSIDE",
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
        gate: { select: { name: true, location: true } },
        securityUser: {
          include: { profile: { select: { name: true } } },
        },
      },
    }),
    prisma.outsider.count({ where: { status: "INSIDE", entryTime: { gte: today, lt: endOfDay } } }),
    prisma.outsider.findMany({ where: { entryTime: { gte: today, lt: endOfDay } }, orderBy: { entryTime: "desc" } })
  ,
    prisma.permission.findMany({
      where: { type: "ENTRY", createdAt: { gte: today, lt: endOfDay } },
      take: 60,
      orderBy: { createdAt: "desc" },
      include: {
        student: { include: { profile: { select: { id: true, name: true, email: true, phone: true } } } },
      }
    }),
    prisma.permission.findMany({
      where: { type: "EXIT", createdAt: { gte: today, lt: endOfDay } },
      take: 60,
      orderBy: { createdAt: "desc" },
      include: {
        student: { include: { profile: { select: { id: true, name: true, email: true, phone: true } } } },
      }
    })
  ]);

  // Pass *requests* are listed alongside gate scans but flagged and NOT counted as movements.
  const formattedEntryPerms = entryPermissions.map((p: any) => ({
    id: p.id,
    isRequest: true,
    type: "ENTRY",
    createdAt: p.createdAt,
    student: p.student,
    gate: { name: "Pass Requested", location: "-" },
    permission: { purpose: p.purpose, destination: p.destination },
    securityUser: { profile: { name: "System" } }
  }));

  const formattedExitPerms = exitPermissions.map((p: any) => ({
    id: p.id,
    isRequest: true,
    type: "EXIT",
    createdAt: p.createdAt,
    student: p.student,
    gate: { name: "Pass Requested", location: "-" },
    permission: { purpose: p.purpose, destination: p.destination },
    securityUser: { profile: { name: "System" } }
  }));

  const mergedEntries = [...recentEntries, ...formattedEntryPerms].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const mergedExits = [...recentExits, ...formattedExitPerms].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const activityData = {
    stats: {
      entriesToday,
      exitsToday,
      entryRequestsToday: entryPermissions.length,
      exitRequestsToday: exitPermissions.length,
      studentsOutside,
      totalMovements,
      outsidersOnCampus: outsidersCount,
    },
    recentEntries: mergedEntries, 
    recentExits: mergedExits, 
    outsiders 
  };

  if (!dateString) {
    cachedActivity = { data: activityData, expiresAt: Date.now() + 10_000 };
  }
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
    invalidateAdminCaches();
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




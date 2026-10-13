"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole, invalidateProfileCache } from "@/lib/auth/helpers";
import { createUserSchema, createGateSchema } from "@/lib/validation/schemas";
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
    });

  if (authError) {
    return { error: `Auth error: ${authError.message}` };
  }

  try {
    // Create profile
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
        const facultyId = formData.get("assignedFacultyId") as string;
        const wardenId = formData.get("assignedWardenId") as string;
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
            gateId: formData.get("assignedGateId") as string || null,
          },
        });
        break;
    }

    // Audit log removed
    invalidateAdminCaches();
    revalidatePath("/admin/users");
    return { success: true, userId: profile.id };
  } catch (error: any) {
    // Rollback the auth user if profile creation fails
    await adminSupabase.auth.admin.deleteUser(authData.user.id);
    return { error: error.message || "Failed to create user record" };
  }
}

/**
 * Admin toggles a user's active status
 */
export async function toggleUserActive(profileId: string) {
  const admin = await requireRole("ADMIN");

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { active: true, role: true },
  });

  if (!profile) return { error: "User not found" };

  if (profile.role === "ADMIN") return { error: "Cannot disable admin accounts" };

  await prisma.profile.update({
    where: { id: profileId },
    data: { active: !profile.active },
  });

  invalidateAdminCaches();
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Admin deletes a user permanently
 */
export async function deleteUser(profileId: string) {
  await requireRole("ADMIN");

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { 
      userId: true, 
      role: true,
      student: { select: { id: true } },
      faculty: { select: { id: true } },
      warden: { select: { id: true } },
      securityStaff: { select: { id: true } }
    },
  });

  if (!profile) return { error: "User not found" };
  if (profile.role === "ADMIN") return { error: "Cannot delete admin accounts" };

  // Delete from Supabase Auth (wrap in try-catch in case Auth user was already deleted)
  try {
    const adminSupabase = getAdminSupabase();
    await adminSupabase.auth.admin.deleteUser(profile.userId);
  } catch (err) {
    console.warn("Auth user not found, deleting Prisma profile anyway", err);
  }

  // Delete from Prisma (Handle manual cascading for non-cascade foreign keys)
  await prisma.$transaction(async (tx) => {
    if (profile.role === "STUDENT" && profile.student) {
      await tx.movement.deleteMany({ where: { studentId: profile.student.id } });
      await tx.permission.deleteMany({ where: { studentId: profile.student.id } });
    } else if (["FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN"].includes(profile.role) && profile.faculty) {
      await tx.student.updateMany({ where: { facultyId: profile.faculty.id }, data: { facultyId: null } });
      await tx.permissionApproval.deleteMany({ where: { facultyId: profile.faculty.id } });
      await tx.permission.deleteMany({ where: { facultyId: profile.faculty.id } });
    } else if (profile.role === "WARDEN" && profile.warden) {
      await tx.student.updateMany({ where: { wardenId: profile.warden.id }, data: { wardenId: null } });
      await tx.permissionApproval.deleteMany({ where: { wardenId: profile.warden.id } });
    } else if (profile.role === "SECURITY" && profile.securityStaff) {
      await tx.movement.deleteMany({ where: { securityUserId: profile.securityStaff.id } });
    }
    
    await tx.profile.delete({ where: { id: profileId } });
  });

  invalidateAdminCaches();
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Update an existing gate
 */
export async function updateGate(gateId: string, formData: FormData) {
  await requireRole("ADMIN");

  const name = formData.get("name") as string;
  const location = formData.get("location") as string;

  if (!name) return { error: "Gate name is required" };

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
    return { error: error.message || "Failed to update gate" };
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
  const today = dateString ? new Date(dateString) : new Date();
  today.setHours(0, 0, 0, 0);

  const endOfDay = new Date(today);
  endOfDay.setDate(endOfDay.getDate() + 1);

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
    prisma.outsider.count({ where: { status: "INSIDE", entryTime: { gte: today, lt: endOfDay } } }),
    prisma.outsider.findMany({ where: { entryTime: { gte: today, lt: endOfDay } }, orderBy: { entryTime: "desc" } })
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
  const cacheKey = `${page}-${pageSize}-${roleFilter || "ALL"}`;
  const cached = usersListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const where = roleFilter 
    ? { role: roleFilter as any } 
    : { role: { not: "ADMIN" } as any };

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

/**
 * Admin or Faculty updates student details
 */
export async function updateStudentDetails(studentId: string, data: {
  name?: string;
    email?: string;
    phone?: string;
  studentRoll?: string;
  department?: string;
  year?: number | null;
  section?: string | null;
  studentType?: "DAY_SCHOLAR" | "HOSTELLER";
  facultyId?: string | null;
  wardenId?: string | null;
  roomNumber?: string | null;
  hostelBlock?: string | null;
}) {
  const user = await requireRole("ADMIN", "FACULTY");

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { profile: true },
  });

  if (!student) return { error: "Student not found" };

  // Validate unique roll number
  if (data.email && data.email !== student.profile.email) {
    const existingEmail = await prisma.profile.findUnique({ where: { email: data.email } });
    if (existingEmail && existingEmail.id !== student.profileId) {
      return { error: `Email ${data.email} is already registered to another user.` };
    }
  }

  // Validate unique roll number
  if (data.studentRoll && data.studentRoll !== student.studentRoll) {
    const existing = await prisma.student.findUnique({
      where: { studentRoll: data.studentRoll },
    });
    if (existing && existing.id !== studentId) {
      return { error: `Roll number ${data.studentRoll} is already registered to another student.` };
    }
  }

  // Update profile
  
    if (data.email) {
      const adminSupabase = getAdminSupabase();
      const authUpdates: any = { email: data.email, email_confirm: true };
      const { error: authError } = await adminSupabase.auth.admin.updateUserById(
        student.profile.userId,
        authUpdates
      );
      if (authError) return { error: "Failed to update authentication email: " + authError.message };
    }

    if (data.name !== undefined || data.phone !== undefined || data.email !== undefined) {
    await prisma.profile.update({
      where: { id: student.profileId },
      data: {
        ...(data.name ? { name: data.name } : {}),
          ...(data.email ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      },
    });
  }

  // Update student
  await prisma.student.update({
    where: { id: studentId },
    data: {
      ...(data.studentRoll ? { studentRoll: data.studentRoll } : {}),
      ...(data.department !== undefined ? { department: data.department || null } : {}),
      ...(data.year !== undefined ? { year: data.year ? Number(data.year) : null } : {}),
      ...(data.section !== undefined ? { section: data.section || null } : {}),
      ...(data.studentType ? { studentType: data.studentType } : {}),
      ...(data.facultyId !== undefined ? { facultyId: data.facultyId || null } : {}),
      ...(data.wardenId !== undefined ? { wardenId: data.wardenId || null } : {}),
      ...(data.roomNumber !== undefined ? { roomNumber: data.roomNumber || null } : {}),
      ...(data.hostelBlock !== undefined ? { hostelBlock: data.hostelBlock || null } : {}),
    },
  });

  invalidateAdminCaches();
  revalidatePath("/admin/users");
  revalidatePath("/faculty");
  revalidatePath("/faculty/students");
  revalidatePath("/student");
  return { success: true };
}

/**
 * Admin updates details for Faculty, Warden, or Security
 */
export async function updateUserDetails(profileId: string, data: {
  name?: string;
    email?: string;
    phone?: string;
    designation?: string;
  department?: string;
  employeeId?: string;
  hostelBlock?: string;
  gateId?: string;
}) {
  await requireRole("ADMIN");

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      faculty: true,
      warden: true,
      securityStaff: true,
    },
  });

  if (!profile) return { error: "User not found" };

  
    if (data.email) {
      const adminSupabase = getAdminSupabase();
      const authUpdates: any = { email: data.email, email_confirm: true };
      const { error: authError } = await adminSupabase.auth.admin.updateUserById(
        profile.userId,
        authUpdates
      );
      if (authError) return { error: "Failed to update authentication email: " + authError.message };
    }

    if (data.name !== undefined || data.phone !== undefined || data.email !== undefined) {
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.email ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      },
    });
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
export async function getUserFullHistory(profileId: string) {
  await requireRole("ADMIN", "FACULTY", "FACULTY_ADMIN", "WARDEN");

  let profile = await prisma.profile.findUnique({
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

  if (!profile) {
    const student = await prisma.student.findUnique({
      where: { id: profileId },
      select: { profileId: true },
    });
    if (student) {
      return getUserFullHistory(student.profileId);
    }
  }

  return profile;
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
    data: { facultyId },
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
    data: { wardenId },
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
    data: { gateId },
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
  const today = dateString ? new Date(dateString) : new Date();
  today.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(today);
  endOfDay.setDate(endOfDay.getDate() + 1);

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

  const formattedEntryPerms = entryPermissions.map((p: any) => ({
    id: p.id,
    type: "ENTRY",
    createdAt: p.createdAt,
    student: p.student,
    gate: { name: "Pass Requested", location: "-" },
    permission: { purpose: p.purpose, destination: p.destination },
    securityUser: { profile: { name: "System" } }
  }));

  const formattedExitPerms = exitPermissions.map((p: any) => ({
    id: p.id,
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
      entriesToday: entriesToday + entryPermissions.length,
      exitsToday: exitsToday + exitPermissions.length,
      studentsOutside,
      totalMovements: totalMovements + entryPermissions.length + exitPermissions.length, 
      outsidersOnCampus: outsidersCount 
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
// OUTSIDER / VISITOR ACTIONS
// ──────────────────────────────────────────────────────────────

export async function createOutsider(data: {
  name: string;
  phone: string;
  category: string;
  purpose: string;
  visitingStudent: string;
  gate: string;
  vehicleNumber: string;
}) {
  await requireRole("ADMIN", "SECURITY");
  
  const outsider = await prisma.outsider.create({
    data: {
      name: data.name,
      phone: data.phone,
      category: data.category,
      purpose: data.purpose,
      visitingStudent: data.visitingStudent,
      gate: data.gate,
      vehicleNumber: data.vehicleNumber,
      status: "INSIDE",
      entryTime: new Date()
    }
  });
  
  invalidateAdminCaches();
  revalidatePath("/admin/activity");
  return outsider;
}

export async function markOutsiderExited(id: string) {
  await requireRole("ADMIN", "SECURITY");
  
  const outsider = await prisma.outsider.update({
    where: { id },
    data: {
      status: "EXITED",
      exitTime: new Date()
    }
  });
  
  invalidateAdminCaches();
  revalidatePath("/admin/activity");
  return outsider;
}

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




"use server";

import { getAuthUser, invalidateProfileCache } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function updateProfileSettings(formData: FormData) {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };

  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const password = (formData.get("password") as string)?.trim();
  const department = (formData.get("department") as string)?.trim();
  const designation = (formData.get("designation") as string)?.trim();

  if (!name) return { error: "Name is required" };

  const adminSupabase = getAdminSupabase();

  try {
    const authUpdates: any = {
      user_metadata: {
        name,
        full_name: name,
        display_name: name,
      },
    };

    // If password provided, validate and update in Supabase Auth
    if (password && password.length > 0) {
      if (password.length < 6) return { error: "Password must be at least 6 characters" };
      authUpdates.password = password;
    }

    // 1. Sync update to Supabase Auth (metadata and/or password)
    const { error: authError } = await adminSupabase.auth.admin.updateUserById(
      user.userId,
      authUpdates
    );
    if (authError) {
      console.error("[updateProfileSettings] Supabase auth update error:", authError);
      throw new Error(authError.message);
    }

    // 2. Update Prisma Profile in database
    await prisma.profile.update({
      where: { id: user.id },
      data: {
        name,
        phone,
      },
    });

    // 3. Update Faculty record for FACULTY, FACULTY_ADMIN (HOD), DIRECTOR, DEAN - department only (designation is admin-managed)
    if (user.role === "FACULTY" || user.role === "FACULTY_ADMIN" || user.role === "DIRECTOR" || user.role === "DEAN") {
      const defaultDesignation = 
        user.role === "DIRECTOR" ? "Director" :
        user.role === "DEAN" ? "Dean" :
        user.role === "FACULTY_ADMIN" ? "Head of Department" : "Faculty Member";

      await prisma.faculty.upsert({
        where: { profileId: user.id },
        update: {
          ...(department ? { department } : {}),
        },
        create: {
          profileId: user.id,
          department: department || (user.role === "DIRECTOR" || user.role === "DEAN" ? "All Departments" : "General"),
          designation: defaultDesignation,
        },
      });
    }

    // 4. Invalidate profile in-memory cache so getAuthUser returns fresh record
    invalidateProfileCache(user.userId);
    invalidateProfileCache();

    // 5. Revalidate Next.js cache paths
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    revalidatePath("/director", "layout");
    revalidatePath("/dean", "layout");
    revalidatePath("/faculty-admin", "layout");
    revalidatePath("/faculty", "layout");
    revalidatePath("/admin", "layout");
    revalidatePath("/warden", "layout");
    revalidatePath("/security", "layout");

    return {
      success: true,
      updatedUser: {
        name,
        phone,
        department,
        designation,
      },
    };
  } catch (err: any) {
    console.error("[updateProfileSettings] Error:", err);
    return { error: err.message || "Failed to update profile settings" };
  }
}

"use server";

import { getAuthUser, invalidateProfileCache } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Non-persisting anon client, used only to re-verify the current password. */
function getVerifierSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const settingsSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9][0-9\s-]{8,16}[0-9])?$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  currentPassword: z.string().optional().or(z.literal("")),
  password: z.string().optional().or(z.literal("")),
});

/**
 * Users update their own display name, phone and (optionally) password.
 * Role, department and designation are admin-managed: department controls
 * data/approval scope, so it can never be self-edited.
 */
export async function updateProfileSettings(formData: FormData) {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = settingsSchema.safeParse({
    name: (formData.get("name") as string) ?? "",
    phone: (formData.get("phone") as string) ?? "",
    currentPassword: (formData.get("currentPassword") as string) ?? "",
    password: (formData.get("password") as string) ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { name, currentPassword } = parsed.data;
  const phone = parsed.data.phone || null;
  const password = parsed.data.password || "";

  if (password) {
    if (password.length < 8) return { error: "New password must be at least 8 characters" };
    if (!currentPassword) return { error: "Enter your current password to set a new one" };

    // Re-authenticate: a hijacked session alone must not be enough to take over the account.
    const { error: verifyError } = await getVerifierSupabase().auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) return { error: "Current password is incorrect" };
  }

  try {
    const before = await prisma.profile.findUnique({ where: { id: user.id }, select: { name: true, phone: true } });
    const { error: authError } = await getAdminSupabase().auth.admin.updateUserById(user.userId, {
      user_metadata: { name, full_name: name, display_name: name, phone },
      ...(password ? { password } : {}),
    });
    if (authError) {
      console.error("[updateProfileSettings] Supabase auth update error:", authError.message);
      return { error: "Failed to update account" };
    }

    try {
      await prisma.profile.update({
        where: { id: user.id },
        data: { name, phone },
      });
    } catch (err) {
      // Put the login's name/phone back so the two never disagree
      await getAdminSupabase()
        .auth.admin.updateUserById(user.userId, {
          user_metadata: { name: before?.name, full_name: before?.name, display_name: before?.name, phone: before?.phone ?? null },
        })
        .catch(() => {});
      throw err;
    }

    invalidateProfileCache(user.userId);

    revalidatePath("/settings");
    revalidatePath("/", "layout");

    return { success: true, updatedUser: { name, phone } };
  } catch (err: any) {
    console.error("[updateProfileSettings] Error:", err?.message);
    return { error: "Failed to update profile settings" };
  }
}

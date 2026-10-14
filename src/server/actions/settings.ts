"use server";

import { getAuthUser, invalidateProfileCache } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deanTitle } from "@/lib/auth/titles";

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
  // Directors, Deans and HODs only
  email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
  employeeId: z.string().trim().max(50).optional().or(z.literal("")),
  title: z.string().trim().max(100).optional().or(z.literal("")),
});

/** Roles that manage their own profile details (department stays admin-managed). */
const SELF_MANAGED = ["DIRECTOR", "DEAN", "FACULTY_ADMIN"] as const;

/**
 * Users update their own name, phone and (optionally) password.
 * Directors, Deans and HODs may also change their email, Employee ID and title
 * (Dean of …, Director title, HOD designation). Department and role are always
 * admin-managed: department controls approval scope.
 */
export async function updateProfileSettings(formData: FormData) {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  const selfManaged = (SELF_MANAGED as readonly string[]).includes(user.role);

  const parsed = settingsSchema.safeParse({
    name: (formData.get("name") as string) ?? "",
    phone: (formData.get("phone") as string) ?? "",
    currentPassword: (formData.get("currentPassword") as string) ?? "",
    password: (formData.get("password") as string) ?? "",
    email: selfManaged ? ((formData.get("email") as string) ?? "") : "",
    employeeId: selfManaged ? ((formData.get("employeeId") as string) ?? "") : "",
    title: selfManaged ? ((formData.get("title") as string) ?? "") : "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { name, currentPassword } = parsed.data;
  const phone = parsed.data.phone || null;
  const password = parsed.data.password || "";
  const newEmail = selfManaged && parsed.data.email && parsed.data.email.toLowerCase() !== user.email.toLowerCase()
    ? parsed.data.email.toLowerCase()
    : null;

  // Faculty-record details for Directors, Deans and HODs
  let facultyUpdate: { employeeId: string | null; designation: string } | null = null;
  if (selfManaged) {
    const title = parsed.data.title?.trim() || "";
    if (user.role === "DEAN" && !title) return { error: "Enter what you are Dean of" };
    if (user.role === "DIRECTOR" && !title) return { error: "Enter your title, e.g. Managing Director" };
    facultyUpdate = {
      employeeId: parsed.data.employeeId?.trim() || null,
      designation: user.role === "DEAN" ? deanTitle(title) : title || "Head of Department",
    };
  }

  if (password && password.length < 8) return { error: "New password must be at least 8 characters" };
  if (password || newEmail) {
    if (!currentPassword) {
      return { error: newEmail ? "Enter your current password to change your email" : "Enter your current password to set a new one" };
    }
    // Re-authenticate: a hijacked session alone must not be enough to take over the account.
    const { error: verifyError } = await getVerifierSupabase().auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) return { error: "Current password is incorrect" };
  }

  if (newEmail) {
    const taken = await prisma.profile.findUnique({ where: { email: newEmail }, select: { id: true } });
    if (taken && taken.id !== user.id) return { error: "That email is already used by another account" };
  }
  if (facultyUpdate?.employeeId) {
    const taken = await prisma.faculty.findUnique({ where: { employeeId: facultyUpdate.employeeId }, select: { profileId: true } });
    if (taken && taken.profileId !== user.id) return { error: "That Employee ID is already used by another account" };
  }

  try {
    const before = await prisma.profile.findUnique({ where: { id: user.id }, select: { name: true, phone: true, email: true } });
    const { error: authError } = await getAdminSupabase().auth.admin.updateUserById(user.userId, {
      user_metadata: { name, full_name: name, display_name: name, phone },
      ...(password ? { password } : {}),
      ...(newEmail ? { email: newEmail, email_confirm: true } : {}),
    });
    if (authError) {
      console.error("[updateProfileSettings] Supabase auth update error:", authError.message);
      return { error: newEmail && /already|exists|registered/i.test(authError.message) ? "That email is already used by another login" : "Failed to update account" };
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.profile.update({
          where: { id: user.id },
          data: { name, phone, ...(newEmail ? { email: newEmail } : {}) },
        });
        if (facultyUpdate) {
          await tx.faculty.update({ where: { profileId: user.id }, data: facultyUpdate });
        }
      });
    } catch (err) {
      // Put the login back so the two never disagree
      await getAdminSupabase()
        .auth.admin.updateUserById(user.userId, {
          user_metadata: { name: before?.name, full_name: before?.name, display_name: before?.name, phone: before?.phone ?? null },
          ...(newEmail && before?.email ? { email: before.email, email_confirm: true } : {}),
        })
        .catch(() => {});
      throw err;
    }

    invalidateProfileCache(user.userId);

    revalidatePath("/settings");
    revalidatePath("/", "layout");

    return { success: true, updatedUser: { name, phone, email: newEmail ?? user.email } };
  } catch (err: any) {
    console.error("[updateProfileSettings] Error:", err?.message);
    if (err?.code === "P2002") return { error: "That email or Employee ID is already in use" };
    return { error: "Failed to update profile settings" };
  }
}

"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validation/schemas";
import { redirect } from "next/navigation";
import { getRoleDashboardPath } from "@/lib/auth/helpers";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limiter";
import { logger } from "@/lib/logger";
import { LIMITS } from "@/lib/constants";

export async function loginAction(formData: FormData) {
  try {
    const raw = {
      email: (formData.get("email") as string) || "",
      password: (formData.get("password") as string) || "",
    };

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const { email, password } = parsed.data;

    // Check rate limit
    const rateLimitResult = checkRateLimit(`login:${email}`, {
      maxAttempts: LIMITS.MAX_LOGIN_ATTEMPTS,
      windowMs: LIMITS.LOGIN_RATE_LIMIT_WINDOW_MS,
      blockDurationMs: LIMITS.LOGIN_BLOCK_DURATION_MS,
    });

    if (!rateLimitResult.allowed) {
      const minutesRemaining = Math.ceil((rateLimitResult.resetAt - Date.now()) / 60000);
      logger.warn('Login rate limit exceeded', { email, minutesRemaining });
      return { 
        error: `Too many login attempts. Please try again in ${minutesRemaining} minutes.` 
      };
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.warn('Login failed', { email, error: error.message });
      return { error: "Invalid email or password" };
    }

    // Get the profile to determine role-based redirect
    const profile = await prisma.profile.findUnique({
      where: { userId: data.user.id },
      select: { role: true, active: true },
    });

    if (!profile) {
      await supabase.auth.signOut();
      logger.error('Login failed - profile not found', undefined, { email, userId: data.user.id });
      return { error: "Account not configured. Contact admin." };
    }

    if (!profile.active) {
      await supabase.auth.signOut();
      logger.warn('Login failed - account disabled', { email, userId: data.user.id });
      return { error: "Account is disabled. Contact admin." };
    }

    logger.info('User logged in successfully', { email, userId: data.user.id, role: profile.role });

    return { redirectUrl: getRoleDashboardPath(profile.role) };
  } catch (err: any) {
    logger.error('Login action exception', err);
    return { error: err?.message || "An unexpected error occurred during login. Please try again." };
  }
}

import { cookies } from "next/headers";
import { invalidateProfileCache } from "@/lib/auth/helpers";

export async function logoutAction() {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    for (const c of allCookies) {
      if (c.name.includes("auth-token") || c.name.startsWith("sb-")) {
        cookieStore.delete(c.name);
      }
    }
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {}
  invalidateProfileCache();
  redirect("/login");
}

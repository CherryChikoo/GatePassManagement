"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validation/schemas";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getRoleDashboardPath, invalidateProfileCache } from "@/lib/auth/helpers";
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

    const email = parsed.data.email.trim().toLowerCase();
    const { password } = parsed.data;

    // Rate limit per client IP + email so a third party cannot lock out a
    // specific account from everywhere. Note: in-memory, per serverless instance.
    const reqHeaders = await headers();
    const ip = (reqHeaders.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const rateLimitResult = checkRateLimit(`login:${ip}:${email}`, {
      maxAttempts: LIMITS.MAX_LOGIN_ATTEMPTS,
      windowMs: LIMITS.LOGIN_RATE_LIMIT_WINDOW_MS,
      blockDurationMs: LIMITS.LOGIN_BLOCK_DURATION_MS,
    });

    if (!rateLimitResult.allowed) {
      const minutesRemaining = Math.ceil((rateLimitResult.resetAt - Date.now()) / 60000);
      logger.warn('Login rate limit exceeded', { minutesRemaining });
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
      logger.warn('Login failed', { error: error.message });
      return { error: "Invalid email or password" };
    }

    resetRateLimit(`login:${ip}:${email}`);

    // Get the profile to determine role-based redirect
    const profile = await prisma.profile.findUnique({
      where: { userId: data.user.id },
      select: { role: true, active: true },
    });

    if (!profile) {
      await supabase.auth.signOut();
      logger.error('Login failed - profile not found', undefined, { userId: data.user.id });
      return { error: "Account not configured. Contact admin." };
    }

    if (!profile.active) {
      await supabase.auth.signOut();
      logger.warn('Login failed - account disabled', { userId: data.user.id });
      return { error: "Account is disabled. Contact admin." };
    }

    logger.info('User logged in successfully', { userId: data.user.id, role: profile.role });

    return { redirectUrl: getRoleDashboardPath(profile.role) };
  } catch (err: any) {
    logger.error('Login action exception', err);
    return { error: "An unexpected error occurred during login. Please try again." };
  }
}

export async function logoutAction() {
  let userId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getClaims();
    userId = (data?.claims?.sub as string) || null;
    await supabase.auth.signOut();
  } catch {}
  try {
    const cookieStore = await cookies();
    for (const c of cookieStore.getAll()) {
      if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
        cookieStore.delete(c.name);
      }
    }
  } catch {}
  if (userId) invalidateProfileCache(userId);
  redirect("/login");
}

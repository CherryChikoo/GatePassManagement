import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validation/schemas";
import { cookies, headers } from "next/headers";
import { AUTH_PROFILE_SELECT, getRoleDashboardPath, rememberProfile } from "@/lib/auth/helpers";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limiter";
import { logger } from "@/lib/logger";
import { LIMITS } from "@/lib/constants";
import { createClient } from "@supabase/supabase-js";

/**
 * Signing in (email + password), used by POST /api/auth/login. A plain route,
 * not a server action: an action is addressed by an ID that changes with every
 * deployment, so a sign-in page opened before a deployment (phone restoring
 * the tab, page left open) failed on its first try.
 */
export type SignInResult = { error: string } | { redirectUrl: string };

/** Cookie read once by the app frame to tell the user their password was changed by staff. */
const PASSWORD_NOTICE_COOKIE = "gp_pw_notice";

export async function signIn(input: { email?: unknown; password?: unknown }): Promise<SignInResult> {
  const startedAt = Date.now();
  try {
    const raw = {
      email: typeof input.email === "string" ? input.email : "",
      password: typeof input.password === "string" ? input.password : "",
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
      // Could not reach the sign-in server (slow network, timeout): the password may be right
      const status = (error as { status?: number }).status;
      if (error.name === "AuthRetryableFetchError" || status === 0 || (typeof status === "number" && status >= 500)) {
        return { error: "Could not sign in. Check your connection and try again." };
      }
      return { error: "Invalid email or password" };
    }

    resetRateLimit(`login:${ip}:${email}`);

    // Get the profile to determine role-based redirect
    const profile = await prisma.profile.findUnique({
      where: { userId: data.user.id },
      select: AUTH_PROFILE_SELECT,
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

    // The dashboard that opens next finds the profile here instead of asking again
    rememberProfile(profile);

    logger.info('User logged in successfully', { userId: data.user.id, role: profile.role });

    // Staff changed this user's password: show a one-time notice after sign-in.
    // The details come with the sign-in response (no extra request); clearing the
    // flag is one request, only on this first sign-in after a change.
    const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
    if (meta.password_notice_pending === true) {
      const cookieStore = await cookies();
      cookieStore.set(
        PASSWORD_NOTICE_COOKIE,
        JSON.stringify({
          by: typeof meta.password_changed_by === "string" ? meta.password_changed_by : "",
          role: typeof meta.password_changed_by_role === "string" ? meta.password_changed_by_role : "",
          at: typeof meta.password_changed_at === "string" ? meta.password_changed_at : "",
        }),
        { path: "/", maxAge: 60 * 60 * 24, sameSite: "lax", secure: process.env.NODE_ENV === "production" }
      );
      try {
        await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
        }).auth.admin.updateUserById(data.user.id, { app_metadata: { password_notice_pending: false } });
      } catch (err: any) {
        logger.warn('Could not clear the password notice flag', { error: err?.message });
      }
    }

    const ms = Date.now() - startedAt;
    if (ms > 1500) logger.warn('Slow sign-in', { ms, role: profile.role });
    return { redirectUrl: getRoleDashboardPath(profile.role) };
  } catch (err: any) {
    logger.error('Login action exception', err);
    return { error: "An unexpected error occurred during login. Please try again." };
  }
}

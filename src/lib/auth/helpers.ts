import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { cache } from "react";
import { headers } from "next/headers";
import { USER_ID_HEADER, USER_EMAIL_HEADER } from "@/lib/supabase/middleware";

export type AuthUser = {
  id: string;
  userId: string;
  role: Role;
  name: string;
  email: string;
  profileId: string;
  /** Profile photo version (ms) — null when there is no photo */
  avatarVersion: number | null;
};

// In-memory profile cache with 20s TTL to prevent repeating DB profile queries across components & actions
const profileCache = new Map<string, { profile: any; expiresAt: number }>();

export function invalidateProfileCache(userId?: string) {
  if (userId) {
    profileCache.delete(userId);
  } else {
    profileCache.clear();
  }
}

/**
 * Get the currently authenticated user with their profile.
 * Returns null if not authenticated.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  let userId: string | null = null;
  let userEmail: string | null = null;

  // These headers are trustworthy: src/proxy.ts strips any client-supplied
  // values and only sets them after verifying the session JWT signature.
  try {
    const reqHeaders = await headers();
    userId = reqHeaders.get(USER_ID_HEADER);
    userEmail = reqHeaders.get(USER_EMAIL_HEADER);
  } catch {
    // headers() might throw in certain non-request contexts
  }

  // Fallback (e.g. public routes): verify with Supabase Auth directly
  if (!userId) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;
    userId = user.id;
    userEmail = user.email || null;
  }

  // Check in-memory profile cache
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    const profile = cached.profile;
    if (!profile || !profile.active) return null;
    return {
      id: profile.id,
      userId: profile.userId,
      role: profile.role,
      name: profile.name,
      email: profile.email || userEmail || "",
      profileId: profile.id,
      avatarVersion: profile.avatarUpdatedAt ? new Date(profile.avatarUpdatedAt).getTime() : null,
    };
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, userId: true, role: true, name: true, email: true, active: true, avatarUpdatedAt: true },
  });

  if (!profile || !profile.active) return null;

  profileCache.set(userId, {
    profile,
    expiresAt: Date.now() + 20_000,
  });

  return {
    id: profile.id,
    userId: profile.userId,
    role: profile.role,
    name: profile.name,
    email: profile.email || userEmail || "",
    profileId: profile.id,
    avatarVersion: profile.avatarUpdatedAt ? new Date(profile.avatarUpdatedAt).getTime() : null,
  };
});


/**
 * Require authentication. Redirects to login if not authenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Require a specific role. Redirects to login or unauthorized page.
 */
export async function requireRole(...roles: Role[]): Promise<AuthUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    redirect("/unauthorized");
  }
  return user;
}

/**
 * Get the role-specific home page for a user
 */
export function getRoleDashboardPath(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "STUDENT":
      return "/student";
    case "FACULTY":
      return "/faculty";
    case "FACULTY_ADMIN":
      return "/faculty-admin";
    case "WARDEN":
      return "/warden";
    case "SECURITY":
      return "/security";
    case "DIRECTOR":
      return "/director";
    case "DEAN":
      return "/dean";
    case "SECURITY_SUPERVISOR":
      return "/supervisor";
    default:
      return "/login";
  }
}

/** Address of a person's profile photo (versioned, so browsers keep it until it changes). */
export function avatarUrlFor(user: { profileId: string; avatarVersion: number | null }): string | null {
  return user.avatarVersion ? `/avatar/${user.profileId}?v=${user.avatarVersion}` : null;
}

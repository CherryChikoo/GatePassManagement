/**
 * Keeps portal accounts (public.profiles) and Supabase Auth logins identical.
 *
 * Rules (same as the database triggers in prisma/migrations/auth_profile_sync.sql):
 * - A portal account without a login is removed; if it has gate-pass history it
 *   is kept for the audit trail but disabled (it can never sign in anyway).
 * - A login without a portal account cannot use the portal; the Admin sync panel
 *   lists it so it can be removed.
 *
 * Server-only (service-role key). Callers must authorize first.
 */
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db/prisma";

function adminAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;
}

export type AuthLogin = { id: string; email: string; createdAt: string };

/** All Supabase Auth logins. Throws if the list cannot be read (never treat that as "no logins"). */
export async function listAuthLogins(): Promise<AuthLogin[]> {
  const admin = adminAuth();
  const all: AuthLogin[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not read Supabase Auth users: ${error.message}`);
    data.users.forEach((u) => all.push({ id: u.id, email: u.email ?? "", createdAt: u.created_at }));
    if (data.users.length < 1000) break;
  }
  return all;
}

/** Profile ids (from `ids`) that have gate-pass history and therefore must be kept. */
async function profilesWithHistory(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.profile.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      student: { select: { _count: { select: { permissions: true, movements: true } } } },
      faculty: { select: { _count: { select: { permissions: true, permissionApprovals: true, movements: true } } } },
      warden: { select: { _count: { select: { permissionApprovals: true } } } },
      securityStaff: { select: { _count: { select: { movements: true } } } },
    },
  });
  return new Set(
    rows
      .filter((p) =>
        [
          p.student?._count.permissions,
          p.student?._count.movements,
          p.faculty?._count.permissions,
          p.faculty?._count.permissionApprovals,
          p.faculty?._count.movements,
          p.warden?._count.permissionApprovals,
          p.securityStaff?._count.movements,
        ].some((c) => (c ?? 0) > 0)
      )
      .map((p) => p.id)
  );
}

export type SyncReport = {
  loginCount: number;
  portalCount: number;
  /** True when every portal account has its login and vice versa (archived accounts excepted) */
  inSync: boolean;
  /** Disabled accounts kept only for gate-pass history (their login was removed) */
  archivedCount: number;
  /** Portal accounts whose login no longer exists */
  portalWithoutLogin: { id: string; name: string; email: string; role: string; active: boolean; archived: boolean }[];
  /** Logins that have no portal account */
  loginWithoutPortal: AuthLogin[];
  /** Same person, but the email differs between the login and the portal */
  emailMismatch: { profileId: string; portalEmail: string; loginEmail: string }[];
};

export async function getSyncReport(): Promise<SyncReport> {
  const [logins, profiles] = await Promise.all([
    listAuthLogins(),
    prisma.profile.findMany({ select: { id: true, userId: true, name: true, email: true, role: true, active: true } }),
  ]);

  const loginById = new Map(logins.map((l) => [l.id, l]));
  const profileUserIds = new Set(profiles.map((p) => p.userId));

  const orphans = profiles.filter((p) => !loginById.has(p.userId));
  const withHistory = await profilesWithHistory(orphans.map((p) => p.id));
  const portalWithoutLogin = orphans.map(({ id, name, email, role, active }) => ({
    id,
    name,
    email,
    role,
    active,
    archived: !active && withHistory.has(id),
  }));
  const archivedCount = portalWithoutLogin.filter((p) => p.archived).length;
  const loginWithoutPortal = logins.filter((l) => !profileUserIds.has(l.id));
  const emailMismatch = profiles
    .filter((p) => {
      const l = loginById.get(p.userId);
      return l && l.email && l.email.toLowerCase() !== p.email.toLowerCase();
    })
    .map((p) => ({ profileId: p.id, portalEmail: p.email, loginEmail: loginById.get(p.userId)!.email }));

  return {
    loginCount: logins.length,
    portalCount: profiles.length,
    inSync: portalWithoutLogin.every((p) => p.archived) && loginWithoutPortal.length === 0 && emailMismatch.length === 0,
    archivedCount,
    portalWithoutLogin,
    loginWithoutPortal,
    emailMismatch,
  };
}

/**
 * Removes (or, with history, disables) portal accounts that have no login, and
 * copies login emails onto portal accounts where they differ.
 */
export async function reconcilePortalWithLogins(): Promise<{ deleted: number; disabled: number; emailsFixed: number }> {
  const report = await getSyncReport();
  if (report.loginCount === 0) {
    throw new Error("Supabase Auth returned no logins — refusing to reconcile.");
  }

  let deleted = 0;
  let disabled = 0;
  const pending = report.portalWithoutLogin.filter((p) => !p.archived);
  const withHistory = await profilesWithHistory(pending.map((p) => p.id));
  for (const p of pending) {
    if (withHistory.has(p.id)) {
      await prisma.profile.update({ where: { id: p.id }, data: { active: false } });
      disabled++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const roles = await tx.profile.findUnique({
        where: { id: p.id },
        select: { faculty: { select: { id: true } }, warden: { select: { id: true } } },
      });
      if (roles?.faculty) {
        await tx.student.updateMany({ where: { facultyId: roles.faculty.id }, data: { facultyId: null } });
      }
      if (roles?.warden) {
        await tx.student.updateMany({ where: { wardenId: roles.warden.id }, data: { wardenId: null } });
      }
      await tx.profile.delete({ where: { id: p.id } }); // role rows cascade
    });
    deleted++;
  }

  let emailsFixed = 0;
  for (const m of report.emailMismatch) {
    try {
      await prisma.profile.update({ where: { id: m.profileId }, data: { email: m.loginEmail } });
      emailsFixed++;
    } catch {
      // email already used by another portal account — leave for the admin to resolve
    }
  }

  return { deleted, disabled, emailsFixed };
}

/** Deletes a Supabase login that has no portal account (cannot be used anyway). */
export async function deleteLoginWithoutPortal(authUserId: string): Promise<{ error?: string }> {
  const hasProfile = await prisma.profile.findUnique({ where: { userId: authUserId }, select: { id: true } });
  if (hasProfile) return { error: "This login belongs to a portal account. Delete the user from Admin → Users instead." };
  const { error } = await adminAuth().deleteUser(authUserId);
  return error ? { error: error.message } : {};
}

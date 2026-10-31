/**
 * Who may see and add to each register (server-side only).
 *
 * - Security: every register except Staff Attendance; can add entries.
 * - Head Security (security account with isHead): everything Security can,
 *   plus viewing and taking Staff Attendance.
 * - Security Supervisor: view every register, including attendance.
 * - Main Admin: view every register and take attendance.
 */
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth/helpers";
import type { RegisterKey } from "./definitions";

const ATTENDANCE: RegisterKey = "SECURITY_ATTENDANCE";
/** Replaced registers: Security no longer sees them; Admin / Supervisor can still read the old records */
const RETIRED: RegisterKey[] = ["AUTO_BOOK"];

export type RegisterAccess = {
  isHeadSecurity: boolean;
  /** Registers this user may not see at all */
  hidden: RegisterKey[];
  canView: (key: string) => boolean;
  canCreate: (key: string) => boolean;
};

// Head Security is set in the database, not from the portal, so it changes
// rarely: remembering it for a minute saves one query on every register request.
const HEAD_TTL_MS = 60_000;
const headCache = new Map<string, { isHead: boolean; expiresAt: number }>();

async function isHeadSecurityStaff(profileId: string): Promise<boolean> {
  const hit = headCache.get(profileId);
  if (hit && hit.expiresAt > Date.now()) return hit.isHead;
  const staff = await prisma.securityStaff.findUnique({ where: { profileId }, select: { isHead: true } });
  const isHead = !!staff?.isHead;
  if (headCache.size > 500) headCache.clear();
  headCache.set(profileId, { isHead, expiresAt: Date.now() + HEAD_TTL_MS });
  return isHead;
}

export async function getRegisterAccess(user: AuthUser): Promise<RegisterAccess> {
  const isHeadSecurity = user.role === "SECURITY" ? await isHeadSecurityStaff(user.profileId) : false;
  const viewer = user.role === "SECURITY" || user.role === "ADMIN" || user.role === "SECURITY_SUPERVISOR";
  const hidden: RegisterKey[] =
    user.role === "SECURITY" ? [...(isHeadSecurity ? [] : [ATTENDANCE]), ...RETIRED] : [];

  return {
    isHeadSecurity,
    hidden,
    canView: (key) => viewer && !hidden.includes(key as RegisterKey),
    canCreate: (key) =>
      RETIRED.includes(key as RegisterKey)
        ? false
        : key === ATTENDANCE
        ? user.role === "ADMIN" || isHeadSecurity
        : user.role === "SECURITY",
  };
}

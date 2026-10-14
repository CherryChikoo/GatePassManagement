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

export type RegisterAccess = {
  isHeadSecurity: boolean;
  /** Registers this user may not see at all */
  hidden: RegisterKey[];
  canView: (key: string) => boolean;
  canCreate: (key: string) => boolean;
};

export async function getRegisterAccess(user: AuthUser): Promise<RegisterAccess> {
  let isHeadSecurity = false;
  if (user.role === "SECURITY") {
    const staff = await prisma.securityStaff.findUnique({ where: { profileId: user.profileId }, select: { isHead: true } });
    isHeadSecurity = !!staff?.isHead;
  }
  const viewer = user.role === "SECURITY" || user.role === "ADMIN" || user.role === "SECURITY_SUPERVISOR";
  const hidden: RegisterKey[] = user.role === "SECURITY" && !isHeadSecurity ? [ATTENDANCE] : [];

  return {
    isHeadSecurity,
    hidden,
    canView: (key) => viewer && !hidden.includes(key as RegisterKey),
    canCreate: (key) =>
      key === ATTENDANCE ? user.role === "ADMIN" || isHeadSecurity : user.role === "SECURITY",
  };
}

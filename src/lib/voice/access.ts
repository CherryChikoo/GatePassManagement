/**
 * Voice filling (server only): which form a request is for, and whether this
 * user may fill it — the same rule as adding an entry to that register.
 */
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { getEntryRegister } from "@/lib/registers/catalog";
import { VISITOR_SPEC, VISITOR_SPEC_KEY, voiceSpecForRegister, type VoiceSpec } from "./spec";
import type { StaffName } from "./prompt";

/** The form's voice spec, or null when it does not exist or this user may not add to it. */
export async function voiceSpecForUser(user: AuthUser, key: unknown): Promise<VoiceSpec | null> {
  if (typeof key !== "string" || !key || key.length > 80) return null;
  if (key === VISITOR_SPEC_KEY) return user.role === "SECURITY" ? VISITOR_SPEC : null;
  const [def, access] = await Promise.all([getEntryRegister(key), getRegisterAccess(user)]);
  // Staff attendance is a tap-grid, not a form
  if (!def || def.key === "SECURITY_ATTENDANCE" || !access.canCreate(def.key)) return null;
  return voiceSpecForRegister(def);
}

/** Security staff names, for "staff" fields (spoken name -> staff record). */
export async function staffNamesFor(spec: VoiceSpec): Promise<StaffName[]> {
  const needs = [...spec.fields, ...spec.groups.flatMap((g) => g.fields)].some((f) => f.type === "staff");
  if (!needs) return [];
  const staff = await prisma.securityStaff.findMany({
    where: { profile: { active: true } },
    select: { id: true, profile: { select: { name: true } } },
    orderBy: { profile: { name: "asc" } },
    take: 300,
  });
  return staff.map((s) => ({ id: s.id, name: s.profile.name }));
}

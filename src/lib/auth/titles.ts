import { cache } from "react";
import { prisma } from "@/lib/db/prisma";

/**
 * The title shown for a Dean or Director, e.g. "Dean of Placements" or
 * "Managing Director" (their designation set by the admin). Falls back to
 * "Dean" / "Director".
 */
const leadershipTitleCache = new Map<string, { title: string; expiresAt: number }>();

export const getLeadershipTitle = cache(async (profileId: string, role: "DEAN" | "DIRECTOR"): Promise<string> => {
  // Changes only when the admin edits the designation: a minute per instance, not a query per page
  const hit = leadershipTitleCache.get(profileId);
  if (hit && hit.expiresAt > Date.now()) return hit.title;
  const faculty = await prisma.faculty.findUnique({ where: { profileId }, select: { designation: true } });
  const title = faculty?.designation?.trim() || (role === "DEAN" ? "Dean" : "Director");
  if (leadershipTitleCache.size > 500) leadershipTitleCache.clear();
  leadershipTitleCache.set(profileId, { title, expiresAt: Date.now() + 60_000 });
  return title;
});

/** "Placements" → "Dean of Placements" (no double prefix if the admin typed it). */
export function deanTitle(area: string): string {
  const a = area.trim().replace(/^dean\s+of\s+/i, "");
  return `Dean of ${a}`;
}

/** Line under "Gate Pass" in the app frame, for roles without a stored title */
const ROLE_LINE: Record<string, string> = {
  ADMIN: "Administrator",
  FACULTY: "Faculty",
  FACULTY_ADMIN: "Head of Department",
  DEAN: "Dean",
  DIRECTOR: "Director",
  WARDEN: "Warden",
  SECURITY: "Security",
  SECURITY_SUPERVISOR: "Security Supervisor",
  STUDENT: "Student",
};

// Titles rarely change: keep them a minute per instance instead of a query per page
const roleLineCache = new Map<string, { line: string; expiresAt: number }>();

/**
 * Who the signed-in person is, under "Gate Pass": their designation
 * ("Assistant Professor", "Dean of Placements", "Managing Director"),
 * "Head of Department · CSE", "Head Security"… — never "… Dashboard".
 */
export const getRoleLine = cache(async (profileId: string, role: string): Promise<string> => {
  const hit = roleLineCache.get(profileId);
  if (hit && hit.expiresAt > Date.now()) return hit.line;

  let line = ROLE_LINE[role] ?? role;
  if (role === "FACULTY" || role === "FACULTY_ADMIN" || role === "DEAN" || role === "DIRECTOR") {
    const f = await prisma.faculty.findUnique({ where: { profileId }, select: { designation: true, department: true } });
    const designation = f?.designation?.trim();
    if (role === "FACULTY_ADMIN") line = f?.department ? `Head of Department · ${f.department}` : "Head of Department";
    else if (designation) line = designation;
  } else {
    // Admin, Warden, Security, Supervisor: the designation set by the admin
    const p = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { designation: true, securityStaff: { select: { isHead: true } } },
    });
    const designation = p?.designation?.trim();
    if (designation) line = designation;
    else if (role === "SECURITY" && p?.securityStaff?.isHead) line = "Head Security";
  }

  if (roleLineCache.size > 2000) roleLineCache.clear();
  roleLineCache.set(profileId, { line, expiresAt: Date.now() + 60_000 });
  return line;
});

/** After a designation / department / Head Security change, show the new line at once. */
export function clearRoleLine(profileId?: string) {
  if (profileId) roleLineCache.delete(profileId);
  else roleLineCache.clear();
}

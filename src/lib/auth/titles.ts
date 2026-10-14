import { cache } from "react";
import { prisma } from "@/lib/db/prisma";

/**
 * The title shown for a Dean or Director, e.g. "Dean of Placements" or
 * "Managing Director" (their designation set by the admin). Falls back to
 * "Dean" / "Director".
 */
export const getLeadershipTitle = cache(async (profileId: string, role: "DEAN" | "DIRECTOR"): Promise<string> => {
  const faculty = await prisma.faculty.findUnique({ where: { profileId }, select: { designation: true } });
  const title = faculty?.designation?.trim();
  return title || (role === "DEAN" ? "Dean" : "Director");
});

/** "Placements" → "Dean of Placements" (no double prefix if the admin typed it). */
export function deanTitle(area: string): string {
  const a = area.trim().replace(/^dean\s+of\s+/i, "");
  return `Dean of ${a}`;
}

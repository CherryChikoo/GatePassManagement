"use server";

import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";
import { loadActivityPage, type ActivityPageParams } from "@/lib/activity/campus-activity";

/**
 * One page of one IST day of the HOD's department activity (student and
 * faculty passes, faculty gate scans), with the day's counts per tab. Loaded by
 * the Activity screen in the browser (cached per day and page), so the page
 * opens at once; search and filters run in the database.
 */
export async function getHodActivity(dateParam?: string, params?: ActivityPageParams) {
  const user = await requireRole("FACULTY_ADMIN");

  // Get the HOD's faculty record to find their department
  const faculty = await prisma.faculty.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, department: true },
  });

  if (!faculty) return { error: "Faculty record not found for HOD account." };

  const dept = faculty.department || "";
  const deptVariants = getDepartmentVariants(dept);
  // No department configured → show nothing rather than every department
  const departments = deptVariants.length > 0 ? deptVariants : ["__no_department__"];

  const data = await loadActivityPage(typeof dateParam === "string" ? dateParam : undefined, params, {
    departments,
    studentMovements: false,
  });
  return { ...data, department: dept };
}

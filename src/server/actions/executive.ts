"use server";

import { loadCampusActivity } from "@/lib/activity/campus-activity";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";

const MAX_PAGE_SIZE = 50;

/**
 * Campus-wide student directory for the Director, Dean and Security Supervisor,
 * one page at a time (search and filters run in the database). Replaces sending
 * every student with each 45-second dashboard refresh.
 */
export async function getExecutiveStudents(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  department?: string;
  year?: string;
  studentType?: string;
}) {
  await requireRole("DIRECTOR", "DEAN", "SECURITY_SUPERVISOR", "ADMIN");

  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(params?.pageSize) || 15)));
  const page = Math.max(1, Math.floor(Number(params?.page) || 1));
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 100) : "";
  const department = typeof params?.department === "string" && params.department !== "ALL" ? params.department.slice(0, 100) : "";
  const year = typeof params?.year === "string" && /^\d{1,2}$/.test(params.year) ? Number(params.year) : null;
  const studentType =
    params?.studentType === "HOSTELLER" || params?.studentType === "DAY_SCHOLAR" ? params.studentType : null;

  const where: Prisma.StudentWhereInput = {
    AND: [
      department ? { department } : {},
      year !== null ? { year } : {},
      studentType ? { studentType } : {},
      q
        ? {
            OR: [
              { studentRoll: { contains: q, mode: "insensitive" } },
              { department: { contains: q, mode: "insensitive" } },
              { profile: { name: { contains: q, mode: "insensitive" } } },
              { profile: { email: { contains: q, mode: "insensitive" } } },
              { profile: { phone: { contains: q } } },
            ],
          }
        : {},
    ],
  };

  const [rows, total, campusTotal, active, hostellers, departments] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { studentRoll: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        profile: { select: { id: true, name: true, email: true, phone: true, active: true } },
        faculty: { select: { id: true, department: true, profile: { select: { name: true } } } },
        warden: { select: { id: true, hostelBlock: true, profile: { select: { name: true } } } },
      },
    }),
    prisma.student.count({ where }),
    // Campus-wide summary (not affected by the filters, as before)
    prisma.student.count(),
    prisma.student.count({ where: { profile: { active: true } } }),
    prisma.student.count({ where: { studentType: "HOSTELLER" } }),
    prisma.student.findMany({ distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    metrics: { total: campusTotal, active, hostelers: hostellers, dayScholars: campusTotal - hostellers },
    departments: departments.map((d) => d.department).filter((d): d is string => !!d),
  };
}

/**
 * One IST day of campus activity (Director, Dean, Security Supervisor). Loaded by
 * the Activity screen in the browser (cached per day), so the page opens at once.
 */
export async function getCampusActivity(dateParam?: string) {
  await requireRole("DIRECTOR", "DEAN", "SECURITY_SUPERVISOR");
  return loadCampusActivity(typeof dateParam === "string" ? dateParam : undefined);
}

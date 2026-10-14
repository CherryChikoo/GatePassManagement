"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { facultyRequestTypeLabel } from "@/lib/registers/definitions";
import { istDayRangeFromParam, parseDateParam, parsePageParam } from "@/lib/time/ist";

const PAGE_SIZE = 10;

/**
 * One person's gate-pass history, a page at a time, optionally for one IST date.
 * Used by the Director / Dean / Supervisor "View Record" popups (campus-wide roles).
 *
 * `person`: a student (student record id) or a staff member (profile id).
 */
export async function getPersonPassHistory(params: {
  person: { kind: "student"; id: string } | { kind: "staff"; profileId: string };
  date?: string;
  status?: "ALL" | "APPROVED" | "PENDING" | "REJECTED";
  page?: number;
}) {
  await requireRole("ADMIN", "DIRECTOR", "DEAN", "SECURITY_SUPERVISOR");
  const person = params?.person;
  let owner: Prisma.PermissionWhereInput;
  if (person?.kind === "student" && typeof person.id === "string" && person.id) {
    owner = { studentId: person.id };
  } else if (person?.kind === "staff" && typeof person.profileId === "string" && person.profileId) {
    const faculty = await prisma.faculty.findUnique({ where: { profileId: person.profileId }, select: { id: true } });
    if (!faculty) return { success: true, page: 1, pageSize: PAGE_SIZE, total: 0, passes: [] };
    owner = { facultyId: faculty.id };
  } else {
    return { error: "Person not found" };
  }

  const page = parsePageParam(String(params?.page ?? 1));
  const date = parseDateParam(params?.date);
  const day = date ? istDayRangeFromParam(date) : null;
  const status = params?.status ?? "ALL";
  const statusWhere: Prisma.PermissionWhereInput =
    status === "APPROVED"
      ? { status: { in: ["APPROVED", "EXITED", "COMPLETED"] } }
      : status === "PENDING"
      ? { status: "PENDING" }
      : status === "REJECTED"
      ? { status: { in: ["REJECTED", "CANCELLED", "EXPIRED"] } }
      : {};

  const where: Prisma.PermissionWhereInput = {
    AND: [
      owner,
      statusWhere,
      ...(day
        ? [{
            OR: [
              { createdAt: { gte: day.start, lt: day.end } },
              { exitDate: { gte: day.start, lt: day.end } },
              { movements: { some: { createdAt: { gte: day.start, lt: day.end } } } },
            ],
          }]
        : []),
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.permission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, type: true, status: true, purpose: true, destination: true, requestType: true,
        exitDate: true, endDate: true, createdAt: true, approvedAt: true, rejectionReason: true,
        movements: { orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true, gate: { select: { name: true } } } },
      },
    }),
    prisma.permission.count({ where }),
  ]);

  return {
    success: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    passes: rows.map((p) => ({
      id: p.id,
      type: p.type,
      status: p.status,
      title: facultyRequestTypeLabel(p.requestType) || p.purpose,
      purpose: p.purpose,
      destination: p.destination,
      exitDate: p.exitDate.toISOString(),
      endDate: p.endDate ? p.endDate.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
      rejectionReason: p.rejectionReason,
      movements: p.movements.map((m) => ({ type: m.type, at: m.createdAt.toISOString(), gate: m.gate?.name ?? null })),
    })),
  };
}

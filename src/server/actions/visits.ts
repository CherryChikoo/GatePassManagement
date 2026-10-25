"use server";

/**
 * Meeting codes (see src/lib/visits/passes.ts):
 * - the faculty / staff list Security picks "Meeting" from,
 * - "My visitors" for the person being met (with the codes to give out),
 * - "Meeting done" for that person.
 */
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { createSignedPhotoUrls } from "@/lib/storage/storage-admin";
import { HOST_ROLES, notifyHost } from "@/lib/visits/passes";
import { istDateString, istDayRangeFromParam, parseDateParam } from "@/lib/time/ist";

const ROLE_TITLE: Record<string, string> = {
  FACULTY: "Faculty",
  FACULTY_ADMIN: "Head of Department",
  DEAN: "Dean",
  DIRECTOR: "Director",
  WARDEN: "Warden",
  ADMIN: "Administration",
  SECURITY_SUPERVISOR: "Security Supervisor",
};

export type VisitHostOption = { id: string; name: string; title: string; department: string | null; employeeId: string | null };

/** Faculty / staff a visitor can come to meet (Security's "Meeting" picker). */
export async function getVisitHostOptions(): Promise<VisitHostOption[]> {
  await requireRole("SECURITY", "ADMIN", "SECURITY_SUPERVISOR");
  const people = await prisma.profile.findMany({
    where: { active: true, role: { in: [...HOST_ROLES] } },
    select: {
      id: true,
      name: true,
      role: true,
      faculty: { select: { designation: true, department: true, employeeId: true } },
      warden: { select: { employeeId: true, hostelBlock: true } },
    },
    orderBy: { name: "asc" },
    take: 3000,
  });
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    title: p.faculty?.designation?.trim() || ROLE_TITLE[p.role] || p.role,
    department: p.faculty?.department ?? (p.warden?.hostelBlock ? `Hostel ${p.warden.hostelBlock}` : null),
    employeeId: p.faculty?.employeeId ?? p.warden?.employeeId ?? null,
  }));
}

export type MyVisit = {
  id: string;
  /** "VISITORS" or the register key (e.g. "ADMISSION") */
  register: string;
  visitorName: string;
  visitorPhone: string | null;
  purpose: string | null;
  category: string | null;
  vehicleNumber: string | null;
  photoUrl: string | null;
  status: "INSIDE" | "MET" | "EXITED";
  /** Only while the visitor is still inside */
  code: string | null;
  arrivedAt: string;
  metAt: string | null;
  exitedAt: string | null;
  exitMethod: string | null;
  overrideReason: string | null;
};

const MY_VISITS_PAGE_SIZE = 15;

export type MyVisitsPage = {
  rows: MyVisit[];
  total: number;
  page: number;
  pageSize: number;
  /** People still inside to meet me (any day): the "Here now" count */
  hereCount: number;
  /** The day shown in "By date" (YYYY-MM-DD, India time) */
  date: string;
};

/**
 * People who came to meet me, one page at a time:
 * - view "here": everyone still inside (any day), newest first
 * - view "day": everyone who arrived on `date` (default today)
 */
export async function listMyVisits(params?: { view?: "here" | "day"; date?: string; page?: number }): Promise<MyVisitsPage> {
  const user = await requireRole(...HOST_ROLES);
  const view = params?.view === "day" ? "day" : "here";
  const page = Math.max(1, Math.floor(Number(params?.page) || 1));
  const day = istDayRangeFromParam(parseDateParam(params?.date) ?? istDateString());
  const mine = { hostProfileId: user.profileId };
  const where =
    view === "here"
      ? { ...mine, status: { not: "EXITED" } }
      : { ...mine, createdAt: { gte: day.start, lt: day.end } };

  const [rows, total, hereCount] = await Promise.all([
    prisma.visitPass.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * MY_VISITS_PAGE_SIZE,
      take: MY_VISITS_PAGE_SIZE,
      select: {
        id: true, register: true, visitorName: true, visitorPhone: true, purpose: true, code: true, status: true,
        createdAt: true, metAt: true, exitedAt: true, exitMethod: true, overrideReason: true,
        outsider: { select: { category: true, vehicleNumber: true, photoUrl: true } },
      },
    }),
    prisma.visitPass.count({ where }),
    view === "here" ? Promise.resolve(-1) : prisma.visitPass.count({ where: { ...mine, status: { not: "EXITED" } } }),
  ]);
  const photos = await createSignedPhotoUrls(rows.map((r) => r.outsider?.photoUrl ?? "").filter(Boolean));
  return {
    rows: rows.map((r) => ({
      id: r.id,
      register: r.register,
      visitorName: r.visitorName,
      visitorPhone: r.visitorPhone,
      purpose: r.purpose,
      category: r.outsider?.category ?? null,
      vehicleNumber: r.outsider?.vehicleNumber ?? null,
      photoUrl: r.outsider?.photoUrl ? photos.get(r.outsider.photoUrl) ?? null : null,
      status: (r.status === "MET" || r.status === "EXITED" ? r.status : "INSIDE") as MyVisit["status"],
      code: r.status === "EXITED" ? null : r.code,
      arrivedAt: r.createdAt.toISOString(),
      metAt: r.metAt?.toISOString() ?? null,
      exitedAt: r.exitedAt?.toISOString() ?? null,
      exitMethod: r.exitMethod,
      overrideReason: r.overrideReason,
    })),
    total,
    page,
    pageSize: MY_VISITS_PAGE_SIZE,
    hereCount: hereCount < 0 ? total : hereCount,
    date: day.dateStr,
  };
}

/** "Meeting done" (optional, for the host's own list). */
export async function markVisitMet(id: string) {
  const user = await requireRole(...HOST_ROLES);
  if (typeof id !== "string" || !id) return { error: "Visit not found" };
  const done = await prisma.visitPass.updateMany({
    where: { id, hostProfileId: user.profileId, status: "INSIDE" },
    data: { status: "MET", metAt: new Date() },
  });
  if (done.count !== 1) return { error: "This visit was already updated." };
  void notifyHost(user.profileId);
  return { success: true };
}

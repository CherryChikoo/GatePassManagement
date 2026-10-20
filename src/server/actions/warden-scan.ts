"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole, type AuthUser } from "@/lib/auth/helpers";
import { verifyScannedQr } from "@/lib/qr/token";
import { revalidatePath } from "next/cache";
import { notifyPassHolder } from "@/lib/realtime/notify";
import { istDayRange } from "@/lib/time/ist";

/**
 * Hostel passes (passKind "HOSTEL"): a hosteller going from college to the
 * hostel. The HOD approves; the hostel warden scans the QR on arrival.
 * A warden handles their own hostellers (or hostellers with no warden set).
 */

const ROLL_RE = /^[A-Za-z0-9/_-]{2,30}$/;

async function wardenId(user: AuthUser): Promise<string | null> {
  const w = await prisma.warden.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
  return w?.id ?? null;
}

const passSelect = {
  id: true, status: true, purpose: true, expectedExit: true, approvedAt: true, passKind: true, createdAt: true,
  wardenScannedAt: true,
  qr: { select: { id: true, active: true, expiresAt: true } },
  approval: { select: { faculty: { select: { profile: { select: { name: true } } } } } },
  student: {
    select: {
      id: true, wardenId: true, studentRoll: true, department: true, year: true, semester: true,
      roomNumber: true, hostelBlock: true, hostelType: true,
      profile: { select: { name: true, phone: true } },
    },
  },
} as const;

/** Checks a scanned QR (or a typed roll number) and returns the pass for the warden. */
export async function verifyHostelPass(input: string) {
  const user = await requireRole("WARDEN");
  const myWardenId = await wardenId(user);
  if (!myWardenId) return { valid: false, error: "Your warden record was not found. Contact the administrator." };
  if (typeof input !== "string" || !input.trim()) return { valid: false, error: "Scan a QR code or enter a roll number" };
  const value = input.trim();

  let permissionId: string | null = null;
  let scannedTokenId: string | null = null;
  if (value.startsWith("GP1.") || value.split(".").length === 3) {
    const result = await verifyScannedQr(value);
    if (!result.valid || !result.payload) return { valid: false, error: result.error || "Invalid QR code" };
    if (!result.payload.live) return { valid: false, error: "Outdated QR code. Ask the student to open their live pass screen." };
    permissionId = result.payload.permissionId;
    scannedTokenId = result.payload.tokenId || null;
  } else if (ROLL_RE.test(value)) {
    const p = await prisma.permission.findFirst({
      where: { passKind: "HOSTEL", status: "APPROVED", student: { studentRoll: value.toUpperCase() } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    permissionId = p?.id ?? null;
  }
  if (!permissionId) return { valid: false, error: "No approved hostel pass found" };

  const pass = await prisma.permission.findUnique({ where: { id: permissionId }, select: passSelect });
  if (!pass || !pass.student) return { valid: false, error: "Pass not found" };
  if (scannedTokenId && pass.qr && pass.qr.id !== scannedTokenId) {
    return { valid: false, error: "Outdated QR code. Ask the student to refresh their pass screen." };
  }
  if (pass.passKind !== "HOSTEL") return { valid: false, error: "This is a gate pass. It is scanned by security at the gate." };
  if (pass.student.wardenId && pass.student.wardenId !== myWardenId) {
    return { valid: false, error: "This student belongs to another warden's hostel." };
  }
  if (pass.status === "COMPLETED" || pass.wardenScannedAt) return { valid: false, error: "Already scanned in at the hostel." };
  if (pass.status !== "APPROVED") {
    const reasons: Record<string, string> = {
      PENDING: "This pass is still waiting for the HOD's approval.",
      REJECTED: "This pass was rejected by the HOD.",
      CANCELLED: "This pass was cancelled.",
      EXPIRED: "This pass has expired.",
    };
    return { valid: false, error: reasons[pass.status] ?? "This pass cannot be used." };
  }
  if (!pass.qr?.active || pass.qr.expiresAt < new Date()) return { valid: false, error: "This pass has expired." };

  return {
    valid: true,
    pass: {
      id: pass.id,
      purpose: pass.purpose,
      expectedTime: pass.expectedExit?.toISOString() ?? null,
      approvedAt: pass.approvedAt?.toISOString() ?? null,
      approvedBy: pass.approval?.faculty?.profile?.name ?? "HOD",
      validUntil: pass.qr.expiresAt.toISOString(),
    },
    student: {
      name: pass.student.profile.name,
      phone: pass.student.profile.phone,
      roll: pass.student.studentRoll,
      department: pass.student.department,
      year: pass.student.year,
      semester: pass.student.semester,
      room: pass.student.roomNumber,
      block: pass.student.hostelBlock,
    },
  };
}

/** Warden confirms the student has reached the hostel. */
export async function confirmHostelArrival(permissionId: string) {
  const user = await requireRole("WARDEN");
  const myWardenId = await wardenId(user);
  if (!myWardenId) return { error: "Your warden record was not found." };
  if (typeof permissionId !== "string" || !permissionId) return { error: "Pass not found" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"hostel-arrival:" + permissionId}))`;
      const pass = await tx.permission.findUnique({
        where: { id: permissionId },
        select: { status: true, passKind: true, wardenScannedAt: true, qr: { select: { id: true, active: true, expiresAt: true } }, student: { select: { wardenId: true } } },
      });
      if (!pass || pass.passKind !== "HOSTEL") throw new Error("Hostel pass not found");
      if (pass.student?.wardenId && pass.student.wardenId !== myWardenId) throw new Error("This student belongs to another warden's hostel");
      if (pass.wardenScannedAt || pass.status === "COMPLETED") throw new Error("Already scanned in at the hostel");
      if (pass.status !== "APPROVED") throw new Error("This pass is not approved");
      if (!pass.qr?.active || pass.qr.expiresAt < new Date()) throw new Error("This pass has expired");

      await tx.permission.update({
        where: { id: permissionId },
        data: { status: "COMPLETED", wardenScannedAt: new Date(), wardenScannedById: myWardenId },
      });
      await tx.qrCredential.update({ where: { id: pass.qr.id }, data: { active: false, usedForEntry: true } });
    });
  } catch (err: any) {
    return { error: err?.message || "Could not record the arrival" };
  }

  revalidatePath("/warden");
  revalidatePath("/warden/scan");
  revalidatePath("/student");
  notifyPassHolder(permissionId);
  return { success: true };
}

/** Today's hostel passes for this warden's hostellers: approved (on the way) and arrived. */
export async function getHostelPassesToday() {
  const user = await requireRole("WARDEN");
  const myWardenId = await wardenId(user);
  if (!myWardenId) return { expected: [], arrived: [] };
  const { start, end } = istDayRange();

  const rows = await prisma.permission.findMany({
    where: {
      passKind: "HOSTEL",
      student: { OR: [{ wardenId: myWardenId }, { wardenId: null, studentType: "HOSTELLER" }] },
      OR: [{ status: "APPROVED" }, { wardenScannedAt: { gte: start, lt: end } }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: passSelect,
  });

  const toRow = (p: (typeof rows)[number]) => ({
    id: p.id,
    name: p.student?.profile.name ?? "",
    roll: p.student?.studentRoll ?? "",
    room: p.student?.roomNumber ?? null,
    purpose: p.purpose,
    approvedBy: p.approval?.faculty?.profile?.name ?? "HOD",
    approvedAt: p.approvedAt?.toISOString() ?? null,
    arrivedAt: p.wardenScannedAt?.toISOString() ?? null,
  });
  return {
    expected: rows.filter((p) => p.status === "APPROVED" && !p.wardenScannedAt).map(toRow),
    arrived: rows.filter((p) => p.wardenScannedAt).map(toRow),
  };
}

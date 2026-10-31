"use server";

/**
 * Visitor self check-in, Security's side (see src/lib/visits/requests.ts):
 * the check-in QR, arrivals waiting at the gate, Accept / Reject, the
 * visitor's Exit QR, and the parent search of the Visitors Book form.
 *
 * Accept and the exit reuse the normal actions (registerOutsider /
 * createRegisterEntry, markOutsiderExited / completeRegisterEntry), so the
 * records, meeting codes and live updates are exactly as when typed by hand.
 */
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { notifyLive } from "@/lib/realtime/notify";
import { createSignedPhotoUrl, isSafeStoragePath } from "@/lib/storage/storage-admin";
import { generateCheckInToken, verifyVisitExitQr } from "@/lib/qr/token";
import { resolveHost } from "@/lib/visits/passes";
import { checkRateLimit } from "@/lib/auth/rate-limiter";
import { getRegisterAccess } from "@/lib/registers/access";
import { PARENT_SELECT } from "@/lib/students/parents";
import {
  ARRIVALS_TOPIC,
  PENDING_MAX_MS,
  REQUEST_SELECT,
  SENT_AGAIN,
  isCheckInRegister,
  visitExitWay,
  visitPassOf,
  visitState,
  insideSince,
  type CheckInRegister,
  type VisitRequestRow,
} from "@/lib/visits/requests";
import { registerOutsider, markOutsiderExited } from "./outsiders";
import { createRegisterEntry, completeRegisterEntry } from "./registers";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PHONE_RE = /^\+?[0-9][0-9\s-]{8,16}[0-9]$/;

const str = (v: unknown) => (typeof v === "string" ? v : "");

// ─── Show QR ─────────────────────────────────────────────────────────────────

/** The check-in QR for this guard's screen (valid 5 minutes; refresh about every 4). */
export async function getCheckInQr(register: CheckInRegister): Promise<{ token: string; expiresAt: string } | { error: string }> {
  const user = await requireRole("SECURITY");
  if (!isCheckInRegister(register)) return { error: "Unknown register" };
  const { token, expiresAt } = generateCheckInToken(register, user.profileId);
  return { token, expiresAt: expiresAt.toISOString() };
}

// ─── Arrivals ────────────────────────────────────────────────────────────────

export type Arrival = {
  id: string;
  register: CheckInRegister;
  createdAt: string;
  name: string;
  phone: string;
  /** What the visitor typed (the register's field keys) */
  data: Record<string, unknown>;
  hostName: string | null;
  officeName: string | null;
  gate: string | null;
  /** Sent from this guard's own QR */
  mine: boolean;
};

const recentPending = (register?: CheckInRegister) => ({
  status: "PENDING",
  createdAt: { gte: new Date(Date.now() - PENDING_MAX_MS) },
  ...(register ? { register } : {}),
});

/** Visitors waiting at the gate for this register (sent in the last hour), newest first. */
export async function listArrivals(register: CheckInRegister): Promise<Arrival[]> {
  const user = await requireRole("SECURITY", "ADMIN");
  if (!isCheckInRegister(register)) return [];
  const rows = await prisma.visitRequest.findMany({
    where: recentPending(register),
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, register: true, createdAt: true, visitorName: true, visitorPhone: true, data: true, gate: true, issuedById: true,
      host: { select: { name: true } },
      office: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    register,
    createdAt: r.createdAt.toISOString(),
    name: r.visitorName,
    phone: r.visitorPhone,
    data: (r.data ?? {}) as Record<string, unknown>,
    hostName: r.host?.name ?? null,
    officeName: r.office?.name ?? null,
    gate: r.gate,
    mine: r.issuedById === user.profileId,
  }));
}

export type ArrivalCounts = {
  VISITORS: number;
  ADMISSION: number;
  /** Newest waiting request (to notice a new one) */
  latest: { id: string; register: CheckInRegister; createdAt: string } | null;
};

/** How many are waiting per register (Security's pop-up and the hub tiles). One small query. */
export async function countArrivals(): Promise<ArrivalCounts> {
  await requireRole("SECURITY", "ADMIN");
  const rows = await prisma.visitRequest.findMany({
    where: recentPending(),
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, register: true, createdAt: true },
  });
  const counts: ArrivalCounts = { VISITORS: 0, ADMISSION: 0, latest: null };
  for (const r of rows) {
    if (!isCheckInRegister(r.register)) continue;
    counts[r.register]++;
    if (!counts.latest) counts.latest = { id: r.id, register: r.register, createdAt: r.createdAt.toISOString() };
  }
  return counts;
}

const acceptSchema = z.object({
  photoUrl: z.string().max(300),
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  vehicleNumber: z.string().trim().max(30).optional(),
});

/** Back to waiting when making the record failed (only if nothing was linked yet). */
async function unclaim(id: string) {
  await prisma.visitRequest
    .updateMany({
      where: { id, status: "ACCEPTED", outsiderId: null, registerEntryId: null },
      data: { status: "PENDING", decidedById: null, decidedByName: null, decidedAt: null, photoUrl: null },
    })
    .catch(() => {});
}

/**
 * Security lets the visitor in: with the photo just taken, and the name /
 * mobile / vehicle corrected if needed. Makes the normal Visitors Book visitor
 * or Admission Book record (with the meeting code when they came to meet someone).
 */
export async function acceptArrival(
  id: string,
  input: { photoUrl: string; name?: string; phone?: string; vehicleNumber?: string }
): Promise<{ success: true; register: CheckInRegister; recordId: string } | { error: string }> {
  const user = await requireRole("SECURITY", "ADMIN");
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Request not found" };
  const parsed = acceptSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: "Please check the details" };
  const fix = parsed.data;
  if (!fix.photoUrl || !fix.photoUrl.startsWith("outsiders/") || !isSafeStoragePath(fix.photoUrl)) {
    return { error: "Take the visitor's photo before letting them in" };
  }
  if (fix.name !== undefined && fix.name.length < 2) return { error: "Visitor name is required" };
  if (fix.phone && !PHONE_RE.test(fix.phone)) return { error: "Enter a valid phone number (10–15 digits)" };

  const req = await prisma.visitRequest.findUnique({
    where: { id },
    select: { id: true, register: true, status: true, rejectReason: true, createdAt: true, data: true, hostProfileId: true, gate: true, visitorName: true, visitorPhone: true },
  });
  if (!req || !isCheckInRegister(req.register)) return { error: "Request not found" };
  if (req.status === "ACCEPTED" || req.status === "EXITED") return { error: "This visitor has already been let in." };
  if (req.status === "REJECTED" && req.rejectReason === SENT_AGAIN) {
    return { error: "The visitor sent their details again. Open their newest request." };
  }
  if (req.status === "REJECTED") return { error: "This request was already turned away." };
  if (Date.now() - req.createdAt.getTime() > PENDING_MAX_MS) {
    return { error: "This request is more than an hour old. Ask the visitor to scan the QR again." };
  }
  // Same rule as adding an Admission record by hand (checked before claiming, so nothing is half done)
  if (req.register === "ADMISSION" && !(await getRegisterAccess(user)).canCreate("ADMISSION")) {
    return { error: "You are not allowed to add to the Admission Book." };
  }

  // Only one guard can accept it (a double tap or two screens)
  const claimed = await prisma.visitRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "ACCEPTED", decidedById: user.profileId, decidedByName: user.name, decidedAt: new Date(), photoUrl: fix.photoUrl },
  });
  if (claimed.count !== 1) return { error: "Another guard has already handled this visitor." };

  const data = (req.data ?? {}) as Record<string, unknown>;
  const name = fix.name || req.visitorName;
  const phone = fix.phone || req.visitorPhone;
  let host: Awaited<ReturnType<typeof resolveHost>> = null;
  let link: { outsiderId: string } | { registerEntryId: string };

  // 1) Make the visitor / Admission record. Until it exists, any failure puts the request back to waiting.
  try {
    // The person to meet may have been removed meanwhile: then let in without a meeting code
    host = req.hostProfileId ? await resolveHost(req.hostProfileId) : null;
    if (req.register === "VISITORS") {
      const res = await registerOutsider({
        name,
        phone,
        category: str(data.category) || "GUEST",
        purpose: str(data.purpose),
        visitingStudent: str(data.visitingStudent),
        department: str(data.department),
        address: str(data.address),
        remarks: str(data.remarks),
        vehicleNumber: (fix.vehicleNumber || str(data.vehicleNumber)).toUpperCase().replace(/^ON FOOT$/, "On foot"),
        gate: req.gate ?? "",
        photoUrl: fix.photoUrl,
        hostProfileId: host?.id ?? "",
      });
      if (!res.success || !res.outsiderId) {
        await unclaim(id);
        return { error: res.error || "Failed to register visitor." };
      }
      link = { outsiderId: res.outsiderId };
    } else {
      const clientToken = `vr-${id}`;
      const res = await createRegisterEntry(
        "ADMISSION",
        { fields: { ...data, parentName: name, parentMobile: phone }, direction: "IN", ...(host ? { visitHost: host.id } : {}) } as Parameters<typeof createRegisterEntry>[1],
        clientToken
      );
      if ("error" in res) {
        await unclaim(id);
        return { error: String(res.error) };
      }
      const entryId =
        ("id" in res ? res.id : undefined) ??
        (await prisma.registerEntry.findUnique({ where: { clientToken }, select: { id: true } }))?.id;
      if (!entryId) {
        await unclaim(id);
        return { error: "Could not save the record. Please try again." };
      }
      link = { registerEntryId: entryId };
    }
  } catch (err: any) {
    await unclaim(id);
    // The same visitor was let in moments ago (from another request)
    if (err?.code === "P2002") return { error: "This visitor was let in a moment ago. Check Inside now." };
    console.error("[visit] accept failed:", err?.message);
    return { error: "Could not let the visitor in. Please try again." };
  }

  // 2) The record exists (the visitor is in the book): never put the request back
  // to waiting now — that would let them in twice. Link it, trying once more on a blip.
  const linkData = { ...link, visitorName: name, visitorPhone: phone, hostProfileId: host?.id ?? null };
  try {
    await prisma.visitRequest.update({ where: { id }, data: linkData });
  } catch {
    await prisma.visitRequest.update({ where: { id }, data: linkData }).catch((err: any) => {
      console.error("[visit] accepted but not linked (record already made):", id, err?.message);
    });
  }
  notifyLive(ARRIVALS_TOPIC);
  return { success: true, register: req.register, recordId: "outsiderId" in link ? link.outsiderId : link.registerEntryId };
}

/** Security turns the request away (the phone says "Please speak to the security officer"). */
export async function rejectArrival(id: string, reason: string): Promise<{ success: true } | { error: string }> {
  const user = await requireRole("SECURITY", "ADMIN");
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Request not found" };
  const why = typeof reason === "string" ? reason.trim().slice(0, 200) : "";
  if (why.length < 2) return { error: "Choose or write a reason" };
  const res = await prisma.visitRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", rejectReason: why, decidedById: user.profileId, decidedByName: user.name, decidedAt: new Date() },
  });
  if (res.count !== 1) return { error: "Another guard has already handled this visitor." };
  notifyLive(ARRIVALS_TOPIC);
  return { success: true };
}

// ─── Exit QR (scanned on Scan QR) ────────────────────────────────────────────

async function requestFromExitQr(token: string): Promise<{ row: VisitRequestRow } | { error: string }> {
  const v = verifyVisitExitQr(token);
  if (!v.valid) return { error: v.error };
  const row = await prisma.visitRequest.findUnique({ where: { id: v.requestId }, select: REQUEST_SELECT });
  if (!row || !isCheckInRegister(row.register)) return { error: "Visitor not found" };
  const state = visitState(row);
  if (state === "EXITED") return { error: "This visitor's exit is already recorded." };
  if (state !== "INSIDE") return { error: "This visitor was not let in." };
  const way = visitExitWay(row);
  if (way.kind === "SECURITY" || !way.unlocked) return { error: "This visitor cannot leave with a QR. Use Mark exit in Inside now." };
  return { row };
}

export type VisitorExitCard = {
  valid: true;
  kind: "VISITOR_EXIT";
  /** Pass back to allowVisitorExit */
  token: string;
  visitor: {
    requestId: string;
    register: CheckInRegister;
    name: string;
    phone: string;
    /** Signed photo URL (1 hour), or null */
    photoUrl: string | null;
    category: string | null;
    vehicleNumber: string | null;
    purpose: string | null;
    /** Who they met (left with that person's code), or the office they visited */
    hostName: string | null;
    officeName: string | null;
    exitMethod: "CODE" | "OFFICE";
    /** When they were let in (ISO) */
    insideSince: string | null;
    gate: string | null;
  };
};

/** What Security sees after scanning a visitor's Exit QR (verifyQrScan's GX1 branch). */
export async function describeVisitorExitQr(token: string): Promise<VisitorExitCard | { valid: false; error: string }> {
  await requireRole("SECURITY", "ADMIN");
  if (typeof token !== "string") return { valid: false, error: "Invalid QR code" };
  const found = await requestFromExitQr(token);
  if ("error" in found) return { valid: false, error: found.error };
  const r = found.row;
  const data = (r.data ?? {}) as Record<string, unknown>;
  const way = visitExitWay(r);
  const path = r.outsider?.photoUrl ?? r.photoUrl;
  const visitors = r.register === "VISITORS";
  return {
    valid: true,
    kind: "VISITOR_EXIT",
    token: token.trim(),
    visitor: {
      requestId: r.id,
      register: r.register as CheckInRegister,
      name: r.visitorName,
      phone: r.visitorPhone,
      photoUrl: path ? await createSignedPhotoUrl(path) : null,
      category: visitors ? str(data.category) || "GUEST" : null,
      vehicleNumber: visitors ? str(data.vehicleNumber) || null : null,
      purpose: str(data.purpose) || null,
      hostName: way.kind === "CODE" ? way.hostName : null,
      officeName: way.kind === "OFFICE" ? way.officeName || null : null,
      exitMethod: way.kind === "CODE" ? "CODE" : "OFFICE",
      insideSince: insideSince(r),
      gate: r.gate,
    },
  };
}

/**
 * Security taps "Allow exit" on a scanned Exit QR: the visitor is marked out
 * (Visitors Book) or Out is recorded (Admission Book), closing the meeting
 * code as used.
 */
export async function allowVisitorExit(token: string): Promise<{ success: true; name: string; register: CheckInRegister } | { error: string }> {
  await requireRole("SECURITY", "ADMIN");
  if (typeof token !== "string") return { error: "Invalid QR code" };
  const found = await requestFromExitQr(token);
  if ("error" in found) return { error: found.error };
  const r = found.row;

  // The visitor proved the meeting code on their phone: close it with that code
  const passRef = visitPassOf(r);
  const pass = passRef && passRef.status !== "EXITED"
    ? await prisma.visitPass.findUnique({ where: { id: passRef.id }, select: { code: true } })
    : null;

  if (r.outsiderId) {
    const res = await markOutsiderExited(r.outsiderId, pass ? { code: pass.code } : undefined);
    if (!res.success) return { error: res.error || "Could not mark the exit." };
  } else if (r.registerEntryId) {
    const res = await completeRegisterEntry(r.registerEntryId, { markMovement: true, ...(pass ? { visitCode: pass.code } : {}) }, `vx-${r.id}`);
    if ("error" in res && res.error) return { error: String(res.error) };
  } else {
    return { error: "Visitor not found" };
  }

  await prisma.visitRequest.updateMany({ where: { id: r.id, status: "ACCEPTED" }, data: { status: "EXITED" } });
  return { success: true, name: r.visitorName, register: r.register as CheckInRegister };
}

/** Photo taken at check-in, for a Visitors Book visitor or Admission Book record made from one. */
export async function getCheckInPhotoUrl(recordId: string): Promise<string | null> {
  await requireRole("SECURITY", "ADMIN", "SECURITY_SUPERVISOR");
  if (typeof recordId !== "string" || !UUID_RE.test(recordId)) return null;
  const r = await prisma.visitRequest.findFirst({
    where: { OR: [{ registerEntryId: recordId }, { outsiderId: recordId }] },
    select: { photoUrl: true },
  });
  return r?.photoUrl ? createSignedPhotoUrl(r.photoUrl) : null;
}

// ─── Parent of a student (Visitors Book form) ────────────────────────────────

export type StudentParents = {
  id: string;
  name: string;
  roll: string;
  department: string | null;
  year: number | null;
  section: string | null;
  studentType: "DAY_SCHOLAR" | "HOSTELLER";
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
  homeAddress: string | null;
  parentVehicle: string | null;
};

/** Up to 10 active students by roll number (starts with) or name (contains), with their parents' details. */
export async function searchStudentParents(query: string): Promise<StudentParents[]> {
  const user = await requireRole("SECURITY", "ADMIN");
  const q = typeof query === "string" ? query.trim().slice(0, 50) : "";
  // Roll numbers (they have digits) from 2 characters; names from 3 letters, so
  // short searches cannot list every family's mobile number and address
  if (q.length < (/\d/.test(q) ? 2 : 3)) return [];
  // Normal typing at the gate stays far below this; it stops anyone collecting all parents' details
  const limit = checkRateLimit(`parent-search:${user.profileId}`, { maxAttempts: 120, windowMs: 10 * 60_000, blockDurationMs: 10 * 60_000 });
  if (!limit.allowed) return [];
  const rows = await prisma.student.findMany({
    where: {
      profile: { active: true },
      OR: [
        { studentRoll: { startsWith: q, mode: "insensitive" } },
        { profile: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true, studentRoll: true, department: true, year: true, section: true, studentType: true,
      profile: { select: { name: true } },
      ...PARENT_SELECT,
    },
    orderBy: { studentRoll: "asc" },
    take: 10,
  });
  return rows.map(({ profile, studentRoll, ...s }) => ({ ...s, name: profile.name, roll: studentRoll }));
}

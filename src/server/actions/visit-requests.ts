"use server";

/**
 * Visitor self check-in, Security's side (see src/lib/visits/requests.ts):
 * the check-in QR, arrivals waiting at the gate, Accept / Reject, and the
 * parent search of the Visitors Book form.
 *
 * Accept reuses the normal actions (registerOutsider / createRegisterEntry), so
 * the records, meeting codes and live updates are exactly as when typed by
 * hand. Leaving is Security's own Mark exit / Out in Inside now.
 */
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { notifyLive } from "@/lib/realtime/notify";
import { createSignedPhotoUrl, isSafeStoragePath } from "@/lib/storage/storage-admin";
import { generateCheckInToken } from "@/lib/qr/token";
import { resolveHost } from "@/lib/visits/passes";
import { checkRateLimit } from "@/lib/auth/rate-limiter";
import { getRegisterAccess } from "@/lib/registers/access";
import { PARENT_SELECT } from "@/lib/students/parents";
import { ARRIVALS_TOPIC, PENDING_MAX_MS, SENT_AGAIN, isCheckInRegister, type CheckInRegister } from "@/lib/visits/requests";
import { registerOutsider } from "./outsiders";
import { createRegisterEntry } from "./registers";

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

/** Security turns the request away (the visitor is told at the gate). */
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

// ─── Check-in photo ──────────────────────────────────────────────────────────

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

/**
 * Up to 10 active students, with their parents' details: by roll number (starts
 * with) when the search has a digit, otherwise by name (contains).
 */
export async function searchStudentParents(query: string): Promise<StudentParents[]> {
  const user = await requireRole("SECURITY", "ADMIN");
  const q = typeof query === "string" ? query.trim().slice(0, 50) : "";
  const looksLikeRoll = /\d/.test(q);
  // Roll numbers (they have digits) from 2 characters; names from 3 letters, so
  // short searches cannot list every family's mobile number and address
  if (q.length < (looksLikeRoll ? 2 : 3)) return [];
  // Fast typing at the gate stays below this (the browser also keeps earlier
  // answers); it stops anyone collecting all parents' details
  const limit = checkRateLimit(`parent-search:${user.profileId}`, { maxAttempts: 300, windowMs: 10 * 60_000, blockDurationMs: 10 * 60_000 });
  if (!limit.allowed) return [];
  const rows = await prisma.student.findMany({
    // Roll numbers are saved in CAPITALS: a case-sensitive "starts with" can
    // use the roll number's index instead of reading every student
    where: looksLikeRoll
      ? { studentRoll: { startsWith: q.toUpperCase() }, profile: { active: true } }
      : { profile: { active: true, name: { contains: q, mode: "insensitive" } } },
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

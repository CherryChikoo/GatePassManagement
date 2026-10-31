/**
 * Visitor self check-in with a QR code (server only).
 *
 * Security shows a QR (Show QR) -> the visitor scans it with their phone camera
 * and fills the Visitors Book / Admission Book form there -> Security sees the
 * request, takes the photo and accepts it (a normal visitor / Admission record
 * is made, see src/server/actions/visit-requests.ts) or rejects it.
 *
 * The phone has no login: it follows its visit with a random secret made when
 * the form is sent (kept on the phone; only its SHA-256 hash is stored). With it
 * the phone asks for its status, types the meeting code it got from the person
 * it met, or scans an office's QR poster; either unlocks an Exit QR (GX1) that
 * Security scans at the gate. Visitors with neither leave through Security's
 * own "Mark exit".
 *
 * Used by the public routes under src/app/api/visit/ (no login, rate limited).
 * Never gives out a host's phone / email or the meeting code.
 */
import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, type RateLimitConfig } from "@/lib/auth/rate-limiter";
import { notifyLive } from "@/lib/realtime/notify";
import { generateVisitExitQr, verifyCheckInToken, type CheckInRegister } from "@/lib/qr/token";
import { HOST_ROLES, MAX_CODE_TRIES, checkVisitExit, resolveHost } from "@/lib/visits/passes";
import { REGISTER_BY_KEY, pendingActions, type EntryRegister } from "@/lib/registers/definitions";
import { effectiveData, validateNewRecord, type RegisterData } from "@/lib/registers/validate";

export type { CheckInRegister } from "@/lib/qr/token";

export const CHECKIN_REGISTERS = ["VISITORS", "ADMISSION"] as const satisfies readonly CheckInRegister[];
export const isCheckInRegister = (v: unknown): v is CheckInRegister => v === "VISITORS" || v === "ADMISSION";

/** A request nobody accepted within an hour has expired (the visitor has to scan again) */
export const PENDING_MAX_MS = 60 * 60_000;
/** The form can still be sent this long after its QR expired (time to fill it in) */
export const SUBMIT_GRACE_MS = 30 * 60_000;
/** Reason on a waiting request its own phone replaced by sending the form again */
export const SENT_AGAIN = "Sent again";
/** People waiting from one guard's QR at once (more is a forwarded link being abused) */
const MAX_WAITING_PER_GUARD = 25;
/** Just accepted: the visitor record is being made (a moment) */
const ACCEPTING_MS = 2 * 60_000;

/** Live topic for new / decided requests (Security's Show QR screen and arrival pop-up) */
export const ARRIVALS_TOPIC = "arrivals";

export const VISITOR_CATEGORIES = ["GUEST", "PARENT", "VENDOR", "WORKER"] as const;
const PHONE_RE = /^\+?[0-9][0-9\s-]{8,16}[0-9]$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

const ADMISSION_DEF = REGISTER_BY_KEY.ADMISSION as EntryRegister;
/** Admission fields the server fills itself (never typed on the phone) */
const ADMISSION_SERVER_KEYS = new Set(["visitDate", "timeIn", "timeOut", "direction"]);

// ─── Phone secret ────────────────────────────────────────────────────────────

/** 32 random bytes (base64url, 43 characters): only the phone keeps it */
export function newPhoneSecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: hashPhoneSecret(secret) };
}

export function hashPhoneSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function isPhoneSecret(v: unknown): v is string {
  return typeof v === "string" && SECRET_RE.test(v);
}

// ─── Public route helpers ────────────────────────────────────────────────────

export const NO_STORE = { "Cache-Control": "private, no-store" };

export function visitJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Per-instance limits (see rate-limiter.ts). Per IP they are generous: many
 * visitors share the college Wi-Fi or a mobile network's address. Per secret /
 * QR they are stricter.
 */
const windowOf = (maxAttempts: number, minutes = 10): RateLimitConfig => ({ maxAttempts, windowMs: minutes * 60_000 });
export const VISIT_LIMITS = {
  formIp: windowOf(1000),
  submitIp: windowOf(300),
  submitToken: windowOf(40),
  statusIp: windowOf(6000),
  statusSecret: windowOf(200),
  codeIp: windowOf(200),
  codeSecret: windowOf(12),
  officeIp: windowOf(300),
  officeSecret: windowOf(20),
} as const;

/** True when any of these limits is used up (every one is counted). */
export function overLimit(checks: [string, RateLimitConfig][]): boolean {
  let blocked = false;
  for (const [key, config] of checks) if (!checkRateLimit(`visit:${key}`, config).allowed) blocked = true;
  return blocked;
}

export const TOO_MANY = "Too many tries. Please wait a few minutes and try again.";

/** JSON body of at most `max` characters, or null */
export async function readJsonBody(req: Request, max = 20_000): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (!text || text.length > max) return null;
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ─── Form data for the phone ─────────────────────────────────────────────────

const ROLE_TITLE: Record<string, string> = {
  FACULTY: "Faculty",
  FACULTY_ADMIN: "Head of Department",
  DEAN: "Dean",
  DIRECTOR: "Director",
  WARDEN: "Warden",
  ADMIN: "Administration",
  SECURITY_SUPERVISOR: "Security Supervisor",
};

export type PublicHost = { id: string; name: string; title: string; department: string | null };
export type PublicOffice = { id: string; name: string };

/** Faculty / staff a visitor can come to meet: names only (never phone / email). */
export async function listPublicHosts(): Promise<PublicHost[]> {
  const people = await prisma.profile.findMany({
    where: { active: true, role: { in: [...HOST_ROLES] } },
    select: {
      id: true,
      name: true,
      role: true,
      designation: true,
      faculty: { select: { designation: true, department: true } },
      warden: { select: { hostelBlock: true } },
    },
    orderBy: { name: "asc" },
    take: 3000,
  });
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    title: p.faculty?.designation?.trim() || p.designation?.trim() || ROLE_TITLE[p.role] || p.role,
    department: p.faculty?.department ?? (p.warden?.hostelBlock ? `Hostel ${p.warden.hostelBlock}` : null),
  }));
}

export async function listActiveOffices(): Promise<PublicOffice[]> {
  return prisma.office.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });
}

export type VisitFormResult =
  | { ok: true; register: CheckInRegister; gate: string | null; hosts: PublicHost[]; offices: PublicOffice[]; expiresAt: string; submitBy: string }
  | { ok: false; error: "expired" | "invalid" };

/** GET /api/visit/form: what the phone needs to show the form of the scanned QR. */
export async function visitForm(token: unknown): Promise<VisitFormResult> {
  const t = verifyCheckInToken(token);
  if (!t.ok) return { ok: false, error: t.error };
  const [hosts, offices, guard] = await Promise.all([listPublicHosts(), listActiveOffices(), checkInGuard(t.guardProfileId)]);
  if (!guard) return { ok: false, error: "invalid" };
  return {
    ok: true,
    register: t.register,
    gate: guard.gate,
    hosts,
    offices,
    expiresAt: t.expiresAt.toISOString(),
    submitBy: new Date(t.expiresAt.getTime() + SUBMIT_GRACE_MS).toISOString(),
  };
}

/** The guard whose QR was scanned, if still an active Security account (with their gate). */
async function checkInGuard(profileId: string) {
  const p = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { id: true, role: true, active: true, securityStaff: { select: { gate: { select: { name: true } } } } },
  });
  if (!p || !p.active || p.role !== "SECURITY") return null;
  return { id: p.id, gate: p.securityStaff?.gate?.name ?? null };
}

// ─── Sending the form ────────────────────────────────────────────────────────

const LONG = "Some details are too long. Please shorten them.";
const optionalText = (max: number) => z.string().trim().max(max, LONG).optional();

/** Visitors Book, as typed on the phone (the same fields as Security's form, minus photo / gate / time) */
const visitorsFormSchema = z.object({
  name: z.string({ error: "Enter your name" }).trim().min(2, "Enter your name").max(100, LONG),
  phone: z.string({ error: "Enter a valid phone number (10–15 digits)" }).trim().regex(PHONE_RE, "Enter a valid phone number (10–15 digits)"),
  vehicleNumber: optionalText(30),
  onFoot: z.boolean().optional(),
  category: z.enum(VISITOR_CATEGORIES, { error: "Choose who you are from the list" }).optional(),
  purpose: optionalText(200),
  visitingStudent: optionalText(100),
  department: optionalText(100),
  address: optionalText(300),
  remarks: optionalText(500),
});

export type VisitorsFormData = {
  name: string;
  phone: string;
  vehicleNumber: string;
  category: string;
  purpose: string;
  visitingStudent: string;
  department: string;
  address: string;
  remarks: string;
};

type CleanForm = { data: Record<string, unknown>; name: string; phone: string };

function cleanVisitorsForm(raw: unknown): CleanForm | { error: string } {
  const parsed = visitorsFormSchema.safeParse(raw ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Please check the details" };
  const f = parsed.data;
  const vehicle = f.onFoot ? "On foot" : (f.vehicleNumber ?? "").toUpperCase();
  if (!vehicle) return { error: "Enter the vehicle number, or choose On foot" };
  const data: VisitorsFormData = {
    name: f.name,
    phone: f.phone,
    vehicleNumber: vehicle,
    category: f.category ?? "GUEST",
    purpose: f.purpose ?? "",
    visitingStudent: f.visitingStudent ?? "",
    department: f.department ?? "",
    address: f.address ?? "",
    remarks: f.remarks ?? "",
  };
  return { data, name: f.name, phone: f.phone };
}

/** Admission Book: checked exactly like Security's own form (date / times are set at Accept) */
async function cleanAdmissionForm(raw: unknown): Promise<CleanForm | { error: string }> {
  const fields = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const res = await validateNewRecord(ADMISSION_DEF, { fields, direction: "IN" }, async () => null);
  if ("error" in res) return { error: res.error };
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(res.data)) if (!ADMISSION_SERVER_KEYS.has(k) && v !== null) data[k] = v;
  return { data, name: String(res.data.parentName ?? ""), phone: String(res.data.parentMobile ?? "") };
}

const submitSchema = z.object({
  t: z.string().max(200),
  /** The phone's current secret, when it sends its form again (only then is its waiting request replaced) */
  s: z.string().max(100).nullish(),
  data: z.record(z.string(), z.unknown()),
  hostProfileId: z.string().regex(UUID_RE).nullish().or(z.literal("")),
  officeId: z.string().regex(UUID_RE).nullish().or(z.literal("")),
});

export type SubmitResult = { ok: true; secret: string } | { ok: false; error: string };

/** POST /api/visit/submit: the visitor's form -> a waiting request for Security. */
export async function submitVisitRequest(body: unknown): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Please check the details" };
  const { t, s, data, hostProfileId, officeId } = parsed.data;

  const token = verifyCheckInToken(t, SUBMIT_GRACE_MS);
  if (!token.ok) return { ok: false, error: token.error === "expired" ? "expired" : "invalid" };

  const form = token.register === "VISITORS" ? cleanVisitorsForm(data) : await cleanAdmissionForm(data);
  if ("error" in form) return { ok: false, error: form.error };

  if (hostProfileId && officeId) return { ok: false, error: "Choose either a person to meet or an office, not both" };
  const [host, office, guard] = await Promise.all([
    hostProfileId ? resolveHost(hostProfileId) : null,
    officeId ? prisma.office.findFirst({ where: { id: officeId, active: true }, select: { id: true } }) : null,
    checkInGuard(token.guardProfileId),
  ]);
  if (hostProfileId && !host) return { ok: false, error: "Choose the person you are meeting from the list" };
  if (officeId && !office) return { ok: false, error: "Choose the office from the list" };
  if (!guard) return { ok: false, error: "invalid" };

  // A forwarded check-in link must not bury real visitors under junk: a guard's
  // QR holds at most this many people waiting at once
  const waitingHere = await prisma.visitRequest.count({
    where: { issuedById: guard.id, status: "PENDING", createdAt: { gte: new Date(Date.now() - PENDING_MAX_MS) } },
  });
  if (waitingHere >= MAX_WAITING_PER_GUARD) return { ok: false, error: "Too many people are waiting at the gate. Please speak to the security officer." };

  const { secret, hash } = newPhoneSecret();
  const fields = {
    data: form.data as Prisma.InputJsonValue,
    visitorName: form.name,
    visitorPhone: form.phone,
    hostProfileId: host?.id ?? null,
    officeId: office?.id ?? null,
    issuedById: guard.id,
    gate: guard.gate,
  };

  try {
    // This phone sends its form again while still waiting (a correction): its
    // own waiting request is closed as "Sent again" and the new one takes its
    // place. Only the phone holding that request's secret can do this — never
    // someone who merely knows the mobile number — and Security never accepts
    // details that changed while they were looking at them.
    if (isPhoneSecret(s)) {
      await prisma.visitRequest.updateMany({
        where: { secretHash: hashPhoneSecret(s), register: token.register, status: "PENDING" },
        data: { status: "REJECTED", rejectReason: SENT_AGAIN, decidedAt: new Date() },
      });
    }
    await prisma.visitRequest.create({ data: { ...fields, register: token.register, secretHash: hash } });
  } catch (err: any) {
    console.error("[visit] submit failed:", err?.message);
    return { ok: false, error: "Could not send. Please try again." };
  }

  notifyLive(ARRIVALS_TOPIC);
  return { ok: true, secret };
}

// ─── Following the visit ─────────────────────────────────────────────────────

const PASS_SELECT = { select: { id: true, status: true, attempts: true, hostName: true } } as const;

export const REQUEST_SELECT = {
  id: true,
  register: true,
  status: true,
  data: true,
  visitorName: true,
  visitorPhone: true,
  hostProfileId: true,
  officeId: true,
  gate: true,
  photoUrl: true,
  rejectReason: true,
  decidedAt: true,
  createdAt: true,
  outsiderId: true,
  registerEntryId: true,
  exitUnlockedAt: true,
  exitUnlockMethod: true,
  officeVisitedAt: true,
  host: { select: { name: true } },
  office: { select: { name: true } },
  outsider: { select: { status: true, entryTime: true, exitTime: true, photoUrl: true, visitPass: PASS_SELECT } },
  registerEntry: {
    select: {
      data: true,
      createdAt: true,
      supplements: { select: { kind: true, data: true, createdAt: true } },
      visitPass: PASS_SELECT,
    },
  },
} satisfies Prisma.VisitRequestSelect;

export type VisitRequestRow = Prisma.VisitRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

export type VisitState = "PENDING" | "INSIDE" | "REJECTED" | "EXITED" | "EXPIRED";

/**
 * Where the visit stands. Inside / left comes from the record made at Accept,
 * so Security's own "Mark exit" or the Admission Book's "Out" keep the phone
 * up to date.
 */
export function visitState(r: VisitRequestRow, now = Date.now()): VisitState {
  if (r.status === "REJECTED") return "REJECTED";
  if (r.status === "EXITED") return "EXITED";
  if (r.status === "PENDING") return now - r.createdAt.getTime() > PENDING_MAX_MS ? "EXPIRED" : "PENDING";
  // ACCEPTED
  if (r.outsider) return r.outsider.status === "INSIDE" ? "INSIDE" : "EXITED";
  if (r.registerEntry) {
    const current = effectiveData(ADMISSION_DEF, r.registerEntry.data as RegisterData, r.registerEntry.supplements);
    return pendingActions(ADMISSION_DEF, current).next ? "INSIDE" : "EXITED";
  }
  // Accepted a moment ago (record still being made), or the record was deleted by Main Admin
  return r.decidedAt && now - r.decidedAt.getTime() < ACCEPTING_MS ? "PENDING" : "EXITED";
}

/** The meeting code of the visit (once accepted), never with the code itself */
export function visitPassOf(r: VisitRequestRow) {
  return r.outsider?.visitPass ?? r.registerEntry?.visitPass ?? null;
}

export type VisitExitWay =
  | { kind: "CODE"; hostName: string; locked: boolean; triesLeft: number; unlocked: boolean }
  | { kind: "OFFICE"; officeName: string; visited: boolean; unlocked: boolean }
  | { kind: "SECURITY" };

/** How this visitor leaves: meeting code, office poster, or Security marks the exit. */
export function visitExitWay(r: VisitRequestRow): VisitExitWay {
  const linked = !!(r.outsider || r.registerEntry);
  const pass = visitPassOf(r);
  const unlocked = !!r.exitUnlockedAt;
  if (pass || (!linked && r.host)) {
    const attempts = pass?.attempts ?? 0;
    return {
      kind: "CODE",
      hostName: pass?.hostName ?? r.host?.name ?? "",
      locked: attempts >= MAX_CODE_TRIES,
      triesLeft: Math.max(0, MAX_CODE_TRIES - attempts),
      unlocked,
    };
  }
  if (r.office || r.officeVisitedAt) return { kind: "OFFICE", officeName: r.office?.name ?? "", visited: !!r.officeVisitedAt, unlocked };
  return { kind: "SECURITY" };
}

/** When the visitor was let in (ISO), once accepted */
export function insideSince(r: VisitRequestRow): string | null {
  const at = r.outsider?.entryTime ?? r.registerEntry?.createdAt ?? null;
  return at ? at.toISOString() : null;
}

export type VisitStatus = {
  ok: true;
  status: VisitState;
  register: CheckInRegister;
  name: string;
  rejectReason: string | null;
  /** When Security let them in (ISO), once inside */
  insideSince: string | null;
  exit: VisitExitWay;
  /** Exit QR to show Security (inside and exit unlocked); valid 2 minutes */
  exitQr?: string;
  exitQrExpiresAt?: string;
};

export function visitStatusOf(r: VisitRequestRow): VisitStatus {
  const status = visitState(r);
  const exit = visitExitWay(r);
  const out: VisitStatus = {
    ok: true,
    status,
    register: isCheckInRegister(r.register) ? r.register : "VISITORS",
    name: r.visitorName,
    rejectReason: status === "REJECTED" ? r.rejectReason : null,
    insideSince: status === "INSIDE" || status === "EXITED" ? insideSince(r) : null,
    exit,
  };
  if (status === "INSIDE" && exit.kind !== "SECURITY" && exit.unlocked) {
    const qr = generateVisitExitQr(r.id);
    out.exitQr = qr.token;
    out.exitQrExpiresAt = qr.expiresAt.toISOString();
  }
  return out;
}

export async function findRequestBySecret(secret: unknown): Promise<VisitRequestRow | null> {
  if (!isPhoneSecret(secret)) return null;
  return prisma.visitRequest.findUnique({ where: { secretHash: hashPhoneSecret(secret) }, select: REQUEST_SELECT });
}

export type VisitStatusResult = VisitStatus | { ok: false; error: string };

/** GET /api/visit/status */
export async function visitStatusBySecret(secret: unknown): Promise<VisitStatusResult> {
  const r = await findRequestBySecret(secret);
  return r ? visitStatusOf(r) : { ok: false, error: "not_found" };
}

export type VisitCodeResult = VisitStatus | { ok: false; error: string; locked?: boolean; triesLeft?: number };

/**
 * POST /api/visit/code: the visitor types the meeting code they got. A right
 * code unlocks the Exit QR (the meeting itself is closed when Security scans
 * it); a wrong one counts towards the lock, as at the gate.
 */
export async function unlockExitWithCode(secret: unknown, code: unknown): Promise<VisitCodeResult> {
  const r = await findRequestBySecret(secret);
  if (!r) return { ok: false, error: "not_found" };
  if (visitState(r) !== "INSIDE") return visitStatusOf(r);
  const passRef = visitPassOf(r);
  if (!passRef) return { ok: false, error: "No meeting code is needed. The security officer will mark your exit." };
  if (r.exitUnlockedAt) return visitStatusOf(r);

  // One try at a time per meeting code: many codes sent at once must still
  // count towards the lock one by one (the try count is read under the lock)
  const check = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"visit-pass:" + passRef.id}))`;
    const pass = await tx.visitPass.findUnique({
      where: { id: passRef.id },
      select: { id: true, code: true, status: true, attempts: true, hostName: true },
    });
    return checkVisitExit(pass, { code: typeof code === "string" ? code.slice(0, 20) : "" }, false, tx);
  });
  if (!check.ok) return { ok: false, error: check.error, locked: check.locked, triesLeft: check.triesLeft };

  await prisma.visitRequest.updateMany({
    where: { id: r.id, exitUnlockedAt: null },
    data: { exitUnlockedAt: new Date(), exitUnlockMethod: "CODE" },
  });
  const fresh = await prisma.visitRequest.findUnique({ where: { id: r.id }, select: REQUEST_SELECT });
  return fresh ? visitStatusOf(fresh) : { ok: false, error: "not_found" };
}

const POSTER_KEY_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function isPosterKey(v: unknown): v is string {
  return typeof v === "string" && POSTER_KEY_RE.test(v);
}

/** GET /api/visit/office: the poster's office name (for the page the poster opens) */
export async function officeByPosterKey(k: unknown): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  if (!isPosterKey(k)) return { ok: false, error: "invalid" };
  const o = await prisma.office.findUnique({ where: { posterKey: k }, select: { id: true, name: true, active: true } });
  return o && o.active ? { ok: true, id: o.id, name: o.name } : { ok: false, error: "invalid" };
}

/**
 * POST /api/visit/office: the visitor scanned an office's QR poster -> the
 * visit is recorded ("Visited <office>") and the Exit QR unlocked.
 */
export async function recordOfficeVisit(secret: unknown, k: unknown): Promise<VisitStatusResult> {
  const [r, office] = await Promise.all([findRequestBySecret(secret), officeByPosterKey(k)]);
  if (!r) return { ok: false, error: "not_found" };
  if (!office.ok) return { ok: false, error: "This office QR is not in use. Please ask the office staff." };
  const state = visitState(r);
  if (state === "PENDING") return { ok: false, error: "Your entry has not been accepted yet. Please wait for the security officer." };
  if (state !== "INSIDE") return visitStatusOf(r);
  // Came to meet someone: leaving needs their meeting code, not an office visit
  const pass = visitPassOf(r);
  if (pass && pass.status !== "EXITED") return { ok: false, error: "Please get the meeting code from the person you met." };
  if (r.officeId && r.officeId !== office.id) {
    return { ok: false, error: "This is a different office. Please scan the QR poster at the office you came to." };
  }

  const now = new Date();
  await prisma.visitRequest.update({
    where: { id: r.id },
    data: {
      officeId: office.id,
      officeVisitedAt: r.officeVisitedAt ?? now,
      ...(r.exitUnlockedAt ? {} : { exitUnlockedAt: now, exitUnlockMethod: "OFFICE" }),
    },
  });
  const fresh = await prisma.visitRequest.findUnique({ where: { id: r.id }, select: REQUEST_SELECT });
  return fresh ? visitStatusOf(fresh) : { ok: false, error: "not_found" };
}

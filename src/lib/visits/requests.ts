/**
 * Visitor self check-in with a QR code (server only).
 *
 * Security shows a QR (Show QR) -> a visitor who is not a parent scans it with
 * their phone camera and fills the Visitors Book / Admission Book form there ->
 * Security sees the request, takes the photo and accepts it (a normal visitor /
 * Admission record is made, see src/server/actions/visit-requests.ts) or
 * rejects it. The phone only shows "Your details are sent" (kept on the phone);
 * it never asks the server again.
 *
 * Leaving: Security marks the exit in Inside now (Mark exit / Out). A visitor
 * who met a faculty / staff member says that person's meeting code and
 * Security types it, exactly as for a visitor typed in by hand.
 *
 * Parents may scan the QR too (Security can also register them with the parent search).
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
import { verifyCheckInToken, type CheckInRegister } from "@/lib/qr/token";
import { HOST_ROLES, resolveHost } from "@/lib/visits/passes";
import { REGISTER_BY_KEY, type EntryRegister } from "@/lib/registers/definitions";
import { validateNewRecord } from "@/lib/registers/validate";

export type { CheckInRegister } from "@/lib/qr/token";

export const CHECKIN_REGISTERS = ["VISITORS", "ADMISSION"] as const satisfies readonly CheckInRegister[];
export const isCheckInRegister = (v: unknown): v is CheckInRegister => v === "VISITORS" || v === "ADMISSION";

/** A request nobody accepted within an hour has expired (the visitor has to scan again) */
export const PENDING_MAX_MS = 60 * 60_000;
/** The form can still be sent this long after its QR expired (time to fill it in) */
export const SUBMIT_GRACE_MS = 30 * 60_000;
/** Reason on a waiting request its own phone replaced by sending the form again (older requests only) */
export const SENT_AGAIN = "Sent again";

/** Live topic for new / decided requests (Security's Show QR screen and arrival pop-up) */
export const ARRIVALS_TOPIC = "arrivals";

/** Who can check in from the phone (the Visitors Book's categories) */
export const VISITOR_CATEGORIES = ["GUEST", "PARENT", "VENDOR", "WORKER"] as const;
const PHONE_RE = /^\+?[0-9][0-9\s-]{8,16}[0-9]$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

const ADMISSION_DEF = REGISTER_BY_KEY.ADMISSION as EntryRegister;
/** Admission fields the server fills itself (never typed on the phone) */
const ADMISSION_SERVER_KEYS = new Set(["visitDate", "timeIn", "timeOut", "direction"]);

/**
 * visit_requests.secret_hash is NOT NULL and unique: each request gets a
 * random value. Nothing is given to the phone and nothing reads it back.
 */
function randomRequestHash(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
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
 * visitors share the college Wi-Fi or a mobile network's address. Per QR they
 * are stricter.
 */
const windowOf = (maxAttempts: number, minutes = 10): RateLimitConfig => ({ maxAttempts, windowMs: minutes * 60_000 });
export const VISIT_LIMITS = {
  formIp: windowOf(1000),
  submitIp: windowOf(300),
  submitToken: windowOf(40),
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

export type VisitFormResult =
  | { ok: true; register: CheckInRegister; gate: string | null; hosts: PublicHost[]; expiresAt: string; submitBy: string }
  | { ok: false; error: "expired" | "invalid" };

/** GET /api/visit/form: what the phone needs to show the form of the scanned QR. */
export async function visitForm(token: unknown): Promise<VisitFormResult> {
  const t = verifyCheckInToken(token);
  if (!t.ok) return { ok: false, error: t.error };
  const [hosts, guard] = await Promise.all([listPublicHosts(), checkInGuard(t.guardProfileId)]);
  if (!guard) return { ok: false, error: "invalid" };
  return {
    ok: true,
    register: t.register,
    gate: guard.gate,
    hosts,
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
  data: z.record(z.string(), z.unknown()),
  hostProfileId: z.string().regex(UUID_RE).nullish().or(z.literal("")),
});

/** `at`: when the request was saved (ISO), for the phone's "sent" screen */
export type SubmitResult = { ok: true; name: string; at: string } | { ok: false; error: string };

/** POST /api/visit/submit: the visitor's form -> a waiting request for Security. */
export async function submitVisitRequest(body: unknown): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Please check the details" };
  const { t, data, hostProfileId } = parsed.data;

  const token = verifyCheckInToken(t, SUBMIT_GRACE_MS);
  if (!token.ok) return { ok: false, error: token.error === "expired" ? "expired" : "invalid" };

  const form = token.register === "VISITORS" ? cleanVisitorsForm(data) : await cleanAdmissionForm(data);
  if ("error" in form) return { ok: false, error: form.error };

  const [host, guard] = await Promise.all([
    hostProfileId ? resolveHost(hostProfileId) : null,
    checkInGuard(token.guardProfileId),
  ]);
  if (hostProfileId && !host) return { ok: false, error: "Choose the person you are meeting from the list" };
  if (!guard) return { ok: false, error: "invalid" };

  let createdAt: Date;
  try {
    const row = await prisma.visitRequest.create({
      data: {
        register: token.register,
        secretHash: randomRequestHash(),
        data: form.data as Prisma.InputJsonValue,
        visitorName: form.name,
        visitorPhone: form.phone,
        hostProfileId: host?.id ?? null,
        issuedById: guard.id,
        gate: guard.gate,
      },
      select: { createdAt: true },
    });
    createdAt = row.createdAt;
  } catch (err: any) {
    console.error("[visit] submit failed:", err?.message);
    return { ok: false, error: "Could not send. Please try again." };
  }

  notifyLive(ARRIVALS_TOPIC);
  return { ok: true, name: form.name, at: createdAt.toISOString() };
}

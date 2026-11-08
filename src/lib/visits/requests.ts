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
 * Parents may scan the QR too: they type the student's roll number, the phone
 * shows only the student's name / class and which parents are saved (never
 * their names, mobiles or address), and the server fills the parent's details
 * from the student's record when the form is sent (Security can also register
 * them with the parent search).
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
import { PATTERNS } from "@/lib/constants";
import { PARENT_SELECT } from "@/lib/students/parents";
import {
  VISITOR_CATEGORY_KEYS,
  VISITOR_CATEGORY_RULES,
  comingForFields,
  isComingFor,
  missingComingForDetail,
  missingVisitorDetail,
} from "@/lib/visits/visitor-categories";

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
export const VISITOR_CATEGORIES = VISITOR_CATEGORY_KEYS;
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
  /** A parent's roll-number search (one per tap of Find) */
  studentIp: windowOf(300),
  studentToken: windowOf(60),
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
  ESTATE_MANAGER: "Estate Manager",
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

// ─── Parents: the student by roll number ─────────────────────────────────────

export const PARENT_WHO = ["FATHER", "MOTHER", "GUARDIAN"] as const;
export type ParentWho = (typeof PARENT_WHO)[number];
const isParentWho = (v: unknown): v is ParentWho => typeof v === "string" && (PARENT_WHO as readonly string[]).includes(v);

const NO_STUDENT = "No student found with this roll number";
const BAD_ROLL = "Enter a valid roll number";

/** A roll number as saved (CAPITALS, no spaces), or null when it cannot be one */
function cleanRoll(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const roll = v.replace(/\s+/g, "").toUpperCase();
  return PATTERNS.STUDENT_ROLL.test(roll) ? roll : null;
}

/** An active student by exact roll number (unique index), with the parents' details (server only) */
const STUDENT_FOR_VISIT_SELECT = {
  studentRoll: true,
  department: true,
  year: true,
  profile: { select: { name: true } },
  ...PARENT_SELECT,
} as const;
function findStudentForVisit(roll: string) {
  return prisma.student.findFirst({
    where: { studentRoll: roll, profile: { active: true } },
    select: STUDENT_FOR_VISIT_SELECT,
  });
}
type StudentForVisit = NonNullable<Awaited<ReturnType<typeof findStudentForVisit>>>;

/**
 * The parent's saved details, only when the form can be filled from them
 * completely (name, a valid mobile and the home address); otherwise the parent
 * types their own details.
 */
function savedParent(s: StudentForVisit, who: ParentWho): { name: string; phone: string; address: string } | null {
  const [name, phone] =
    who === "FATHER" ? [s.fatherName, s.fatherPhone] : who === "MOTHER" ? [s.motherName, s.motherPhone] : [s.guardianName, s.guardianPhone];
  const n = name?.trim() ?? "";
  const p = phone?.trim() ?? "";
  const address = s.homeAddress?.trim() ?? "";
  if (n.length < 2 || n.length > 100 || !PHONE_RE.test(p) || !address || address.length > 300) return null;
  return { name: n, phone: p, address };
}

/**
 * GET /api/visit/student: what a parent's phone may know about the student.
 * NEVER the parents' names, mobiles or address: only which of them are saved.
 */
export type VisitStudentMatch = {
  roll: string;
  studentName: string;
  department: string | null;
  year: number | null;
  has: { father: boolean; mother: boolean; guardian: boolean };
};
/**
 * `students`: one (roll number) or a few (name) to pick from. The first one is
 * also sent at the top level, for a phone that opened the form before names
 * could be searched.
 */
export type VisitStudentResult =
  | ({ ok: true; students: VisitStudentMatch[] } & Omit<VisitStudentMatch, "roll">)
  | { ok: false; error: string };

/** A name search needs this many letters, and sends at most this many students */
const NAME_MIN = 3;
const NAME_MAX_ROWS = 5;
const NO_NAME = "No student found with this name. Check the spelling or type the roll number.";
const SHORT_NAME = "Type at least 3 letters of the student's name";

const asMatch = (s: StudentForVisit): VisitStudentMatch => ({
  roll: s.studentRoll,
  studentName: s.profile.name,
  department: s.department,
  year: s.year,
  has: { father: !!savedParent(s, "FATHER"), mother: !!savedParent(s, "MOTHER"), guardian: !!savedParent(s, "GUARDIAN") },
});

/** The student by roll number (has a digit) or by name (a few at most, A-Z) */
export async function lookupVisitStudent(token: unknown, query: unknown): Promise<VisitStudentResult> {
  // Same check as sending the form (time to fill it in after opening it)
  const t = verifyCheckInToken(token, SUBMIT_GRACE_MS);
  if (!t.ok) return { ok: false, error: t.error };
  if (t.register !== "VISITORS") return { ok: false, error: "invalid" };
  const q = typeof query === "string" ? query.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  const byRoll = /\d/.test(q);
  let find: Promise<StudentForVisit[]>;
  if (byRoll) {
    const r = cleanRoll(q);
    if (!r) return { ok: false, error: BAD_ROLL };
    find = findStudentForVisit(r).then((s) => (s ? [s] : []));
  } else {
    if (q.replace(/[^\p{L}]/gu, "").length < NAME_MIN) return { ok: false, error: SHORT_NAME };
    find = prisma.student.findMany({
      where: { profile: { active: true, name: { contains: q, mode: "insensitive" } } },
      select: STUDENT_FOR_VISIT_SELECT,
      orderBy: { studentRoll: "asc" },
      take: NAME_MAX_ROWS,
    });
  }
  const [rows, guard] = await Promise.all([find, checkInGuard(t.guardProfileId)]);
  if (!guard) return { ok: false, error: "invalid" };
  if (rows.length === 0) return { ok: false, error: byRoll ? NO_STUDENT : NO_NAME };
  const students = rows.map(asMatch);
  const { roll: _roll, ...first } = students[0];
  return { ok: true, students, ...first };
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

/**
 * `name` / `phone`: the visitor's (kept on the request for Security).
 * `shownName`: what the phone may show on its "sent" screen when it is not the
 * visitor's own name (a parent picked from the student's record: the student).
 */
type CleanForm = { data: Record<string, unknown>; name: string; phone: string; shownName?: string };

/**
 * Visitors Book from the phone. A parent sends the student's roll number and
 * either `parentWho` (Father / Mother / Guardian: name, mobile, address and the
 * usual vehicle come from the student's record) or their own typed details;
 * the student, department and purpose are always filled here.
 */
async function cleanVisitorsForm(raw: unknown, hostId: string | null): Promise<CleanForm | { error: string }> {
  const input: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  const hostProfileId = hostId;
  let studentName: string | undefined;
  // The simple phone form: "Coming for" decides category / purpose / person to visit
  const comingFor = isComingFor(input.comingFor) ? input.comingFor : null;
  if (comingFor === "PARENT") input.category = "PARENT";

  if (input.category === "PARENT") {
    input.purpose = VISITOR_CATEGORY_RULES.PARENT.defaultPurpose;
    const rollGiven = typeof input.studentRoll === "string" && input.studentRoll.trim() !== "";
    const who = input.parentWho;
    if (rollGiven) {
      const roll = cleanRoll(input.studentRoll);
      if (!roll) return { error: BAD_ROLL };
      const s = await findStudentForVisit(roll);
      if (!s) return { error: NO_STUDENT };
      if (who !== undefined && who !== null && who !== "") {
        const parent = isParentWho(who) ? savedParent(s, who) : null;
        if (!parent) return { error: "Your details are not saved for this student. Please type them." };
        input.name = parent.name;
        input.phone = parent.phone;
        input.address = parent.address;
        // Today's answer on the phone (vehicle or on foot) wins; the usual vehicle on
        // record only fills in when the phone gave neither
        const typedVehicle = typeof input.vehicleNumber === "string" ? input.vehicleNumber.trim() : "";
        const usual = (s.parentVehicle ?? "").trim().toUpperCase();
        if (!input.onFoot && !typedVehicle && usual) {
          if (usual === "ON FOOT") {
            input.onFoot = true;
            input.vehicleNumber = "";
          } else if (usual.length <= 30) {
            input.vehicleNumber = usual;
          }
        }
      }
      input.visitingStudent = `${s.profile.name} (${s.studentRoll})`;
      input.department = s.department ?? "";
      studentName = s.profile.name;
    } else if (who !== undefined && who !== null && who !== "") {
      return { error: "Find the student first" };
    }
  }

  if (comingFor) {
    const detail = typeof input.detail === "string" ? input.detail : "";
    const host = hostProfileId || (typeof input.hostProfileId === "string" ? input.hostProfileId : "");
    const student = typeof input.visitingStudent === "string" && input.visitingStudent.trim() ? input.visitingStudent : detail;
    const lacking = missingComingForDetail(comingFor, { detail, hostProfileId: host, student });
    if (lacking) return { error: lacking };
    const f = comingForFields(comingFor, { detail, hostProfileId: host, student });
    input.category = f.category;
    input.purpose = f.purpose;
    input.visitingStudent = f.visitingStudent;
    input.remarks = "";
  }

  const missing = missingVisitorDetail({ ...input, hostProfileId });
  if (missing) return { error: missing };
  const parsed = visitorsFormSchema.safeParse(input);
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
  return { data, name: f.name, phone: f.phone, shownName: studentName };
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

/**
 * `at`: when the request was saved (ISO), for the phone's "sent" screen.
 * `forStudent`: `name` is the student's (a parent found by roll number: their own
 * saved details are never sent to the phone).
 */
export type SubmitResult = { ok: true; name: string; at: string; forStudent?: true } | { ok: false; error: string };

/** POST /api/visit/submit: the visitor's form -> a waiting request for Security. */
export async function submitVisitRequest(body: unknown): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Please check the details" };
  const { t, data, hostProfileId } = parsed.data;

  const token = verifyCheckInToken(t, SUBMIT_GRACE_MS);
  if (!token.ok) return { ok: false, error: token.error === "expired" ? "expired" : "invalid" };

  const form =
    token.register === "VISITORS" ? await cleanVisitorsForm(data, hostProfileId || null) : await cleanAdmissionForm(data);
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
  return form.shownName
    ? { ok: true, name: form.shownName, at: createdAt.toISOString(), forStudent: true }
    : { ok: true, name: form.name, at: createdAt.toISOString() };
}

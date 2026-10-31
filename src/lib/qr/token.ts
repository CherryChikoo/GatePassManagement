import { SignJWT, jwtVerify } from "jose";
import { createHmac, timingSafeEqual } from "node:crypto";

if (!process.env.QR_JWT_SECRET) {
  throw new Error(
    "FATAL: QR_JWT_SECRET environment variable is required. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
}

const QR_SECRET = new TextEncoder().encode(process.env.QR_JWT_SECRET);
const LIVE_TOKEN_TTL = "60s";

export interface QrPayload {
  permissionId: string;
  tokenId: string;
  studentId: string;
  expiresAt: string;
  /** true for the rotating 60-second tokens shown on screen */
  live: boolean;
}

/**
 * Generate the stored (server-side) QR credential token for a permission.
 * This token is never shown to users; screens display rotating live tokens.
 */
export async function generateQrToken(
  permissionId: string,
  studentId: string,
  expiresAt: Date
): Promise<{ token: string; tokenId: string }> {
  const tokenId = crypto.randomUUID();

  const token = await new SignJWT({
    permissionId,
    tokenId,
    studentId,
    expiresAt: expiresAt.toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setJti(tokenId)
    .sign(QR_SECRET);

  return { token, tokenId };
}

/**
 * Generate a rotating, 60-second QR token for display on the pass holder's screen.
 */
export async function generateLiveQrJwt(input: {
  permissionId: string;
  tokenId: string;
  ownerId: string;
  expiresAt: Date;
}): Promise<string> {
  return new SignJWT({
    permissionId: input.permissionId,
    tokenId: input.tokenId,
    studentId: input.ownerId,
    expiresAt: input.expiresAt.toISOString(),
    live: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(LIVE_TOKEN_TTL)
    .sign(QR_SECRET);
}

/**
 * Verify and decode a QR token (signature + JWT exp + embedded pass expiry).
 */
export async function verifyQrToken(
  token: string
): Promise<{ valid: boolean; payload?: QrPayload; error?: string }> {
  try {
    const { payload } = await jwtVerify(token, QR_SECRET, { algorithms: ["HS256"] });

    if (typeof payload.permissionId !== "string" || typeof payload.expiresAt !== "string") {
      return { valid: false, error: "Invalid QR code" };
    }

    const qrPayload: QrPayload = {
      permissionId: payload.permissionId,
      tokenId: String(payload.tokenId ?? ""),
      studentId: String(payload.studentId ?? ""),
      expiresAt: payload.expiresAt,
      live: payload.live === true,
    };

    const passExpiry = new Date(qrPayload.expiresAt);
    if (Number.isNaN(passExpiry.getTime()) || passExpiry < new Date()) {
      return { valid: false, error: "QR code has expired" };
    }

    return { valid: true, payload: qrPayload };
  } catch (error: any) {
    if (error?.code === "ERR_JWT_EXPIRED") {
      return { valid: false, error: "QR code has expired. Ask the pass holder to refresh their screen." };
    }
    return { valid: false, error: "Invalid or tampered QR code" };
  }
}

// ──────────────────────────────────────────────────────────────
// Compact live QR code
//
//   GP1.<pass id, 32 hex>.<QR credential id, 32 hex>.<expiry, base36 seconds>.<signature>
//
// About 110 characters instead of a ~360-character JWT, so the QR has far fewer
// dots and scans quickly from a phone screen. Signed with the same secret
// (HMAC-SHA256, 128-bit tag) and valid for 60 seconds.
// ──────────────────────────────────────────────────────────────

const COMPACT_PREFIX = "GP1";
const COMPACT_TTL_SECONDS = 60;
const HEX32 = /^[0-9a-f]{32}$/;

function compactSignature(body: string): string {
  return createHmac("sha256", QR_SECRET).update(body).digest().subarray(0, 16).toString("base64url");
}

const toHex32 = (uuid: string) => uuid.replace(/-/g, "").toLowerCase();
const fromHex32 = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

/** Rotating 60-second code shown on the pass holder's screen. */
export function generateCompactLiveQr(input: { permissionId: string; tokenId: string; expiresAt: Date }): string {
  const passEnd = Math.floor(input.expiresAt.getTime() / 1000);
  const exp = Math.min(Math.floor(Date.now() / 1000) + COMPACT_TTL_SECONDS, passEnd);
  const body = `${COMPACT_PREFIX}.${toHex32(input.permissionId)}.${toHex32(input.tokenId)}.${exp.toString(36)}`;
  return `${body}.${compactSignature(body)}`;
}

/**
 * Verifies a scanned code: the compact format above, or a legacy JWT.
 * Returns the pass id and the QR credential id it was issued for.
 */
export async function verifyScannedQr(
  value: string
): Promise<{ valid: boolean; payload?: Pick<QrPayload, "permissionId" | "tokenId" | "live">; error?: string }> {
  const v = value.trim();
  if (v.startsWith(`${COMPACT_PREFIX}.`)) {
    const parts = v.split(".");
    if (parts.length !== 5) return { valid: false, error: "Invalid QR code" };
    const [, perm, tok, exp36, sig] = parts;
    if (!HEX32.test(perm) || !HEX32.test(tok) || !/^[0-9a-z]{1,10}$/.test(exp36)) return { valid: false, error: "Invalid QR code" };
    const expected = Buffer.from(compactSignature(`${COMPACT_PREFIX}.${perm}.${tok}.${exp36}`));
    const given = Buffer.from(sig);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return { valid: false, error: "Invalid or tampered QR code" };
    }
    if (parseInt(exp36, 36) * 1000 < Date.now()) {
      return { valid: false, error: "QR code has expired. Ask the pass holder to refresh their screen." };
    }
    return { valid: true, payload: { permissionId: fromHex32(perm), tokenId: fromHex32(tok), live: true } };
  }
  if (v.split(".").length === 3) {
    const r = await verifyQrToken(v);
    return r.valid && r.payload
      ? { valid: true, payload: { permissionId: r.payload.permissionId, tokenId: r.payload.tokenId, live: r.payload.live } }
      : { valid: false, error: r.error };
  }
  return { valid: false, error: "Not a Gate Pass QR code" };
}

// ──────────────────────────────────────────────────────────────
// Visitor self check-in codes (src/lib/visits/requests.ts)
//
//   GV1.<V|A>.<guard's profile id, 32 hex>.<expiry, base36 seconds>.<signature>
//     Check-in QR on Security's Show QR screen (V = Visitors Book, A = Admission
//     Book), shown as <site>/v/<token>. Valid 5 minutes; the screen refreshes it.
//   GX1.<check-in request id, 32 hex>.<expiry, base36 seconds>.<signature>
//     Exit QR on the visitor's phone, scanned by Security. Valid 2 minutes.
//
// Same secret and signature as GP1; the different prefixes keep each kind of
// code from ever being accepted as another.
// ──────────────────────────────────────────────────────────────

const CHECKIN_PREFIX = "GV1";
const CHECKIN_TTL_SECONDS = 5 * 60;
const VISIT_EXIT_PREFIX = "GX1";
const VISIT_EXIT_TTL_SECONDS = 2 * 60;
const EXP36 = /^[0-9a-z]{1,10}$/;

export type CheckInRegister = "VISITORS" | "ADMISSION";
const REGISTER_LETTER: Record<CheckInRegister, string> = { VISITORS: "V", ADMISSION: "A" };

function signedCompact(body: string): string {
  return `${body}.${compactSignature(body)}`;
}

/** The signature part matches the body (timing-safe). */
function compactSignatureOk(body: string, sig: string): boolean {
  const expected = Buffer.from(compactSignature(body));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Check-in QR for one register, issued to the guard showing it. */
export function generateCheckInToken(register: CheckInRegister, guardProfileId: string): { token: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + CHECKIN_TTL_SECONDS;
  const token = signedCompact(`${CHECKIN_PREFIX}.${REGISTER_LETTER[register]}.${toHex32(guardProfileId)}.${exp.toString(36)}`);
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Reads a check-in token. `graceMs` keeps an expired token usable a little
 * longer (sending the form: time to fill it in after opening it).
 */
export function verifyCheckInToken(
  value: unknown,
  graceMs = 0
): { ok: true; register: CheckInRegister; guardProfileId: string; expiresAt: Date } | { ok: false; error: "invalid" | "expired" } {
  if (typeof value !== "string" || value.length > 200) return { ok: false, error: "invalid" };
  const parts = value.trim().split(".");
  if (parts.length !== 5 || parts[0] !== CHECKIN_PREFIX) return { ok: false, error: "invalid" };
  const [, letter, guard, exp36, sig] = parts;
  const register = letter === "V" ? "VISITORS" : letter === "A" ? "ADMISSION" : null;
  if (!register || !HEX32.test(guard) || !EXP36.test(exp36)) return { ok: false, error: "invalid" };
  if (!compactSignatureOk(`${CHECKIN_PREFIX}.${letter}.${guard}.${exp36}`, sig)) return { ok: false, error: "invalid" };
  const expiresAt = new Date(parseInt(exp36, 36) * 1000);
  if (expiresAt.getTime() + graceMs < Date.now()) return { ok: false, error: "expired" };
  return { ok: true, register, guardProfileId: fromHex32(guard), expiresAt };
}

/** Exit QR for a visitor who is inside and may leave. */
export function generateVisitExitQr(requestId: string): { token: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + VISIT_EXIT_TTL_SECONDS;
  return { token: signedCompact(`${VISIT_EXIT_PREFIX}.${toHex32(requestId)}.${exp.toString(36)}`), expiresAt: new Date(exp * 1000) };
}

export function isVisitExitQr(value: unknown): boolean {
  return typeof value === "string" && value.trim().startsWith(`${VISIT_EXIT_PREFIX}.`);
}

/** Reads a scanned Exit QR: the check-in request it was issued for. */
export function verifyVisitExitQr(value: unknown): { valid: true; requestId: string } | { valid: false; error: string } {
  if (typeof value !== "string" || value.length > 200) return { valid: false, error: "Invalid QR code" };
  const parts = value.trim().split(".");
  if (parts.length !== 4 || parts[0] !== VISIT_EXIT_PREFIX) return { valid: false, error: "Invalid QR code" };
  const [, id, exp36, sig] = parts;
  if (!HEX32.test(id) || !EXP36.test(exp36)) return { valid: false, error: "Invalid QR code" };
  if (!compactSignatureOk(`${VISIT_EXIT_PREFIX}.${id}.${exp36}`, sig)) return { valid: false, error: "Invalid or tampered QR code" };
  if (parseInt(exp36, 36) * 1000 < Date.now()) {
    return { valid: false, error: "This exit QR has expired. Ask the visitor to open it again on their phone." };
  }
  return { valid: true, requestId: fromHex32(id) };
}

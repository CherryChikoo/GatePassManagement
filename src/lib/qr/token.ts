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

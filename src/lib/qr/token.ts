import { SignJWT, jwtVerify } from "jose";

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

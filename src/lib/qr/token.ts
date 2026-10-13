import { SignJWT, jwtVerify } from "jose";

if (!process.env.QR_JWT_SECRET) {
  throw new Error(
    "FATAL: QR_JWT_SECRET environment variable is required. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
}

const QR_SECRET = new TextEncoder().encode(process.env.QR_JWT_SECRET);

export interface QrPayload {
  permissionId: string;
  tokenId: string;
  studentId: string;
  expiresAt: string;
}

/**
 * Generate a signed QR token for a permission
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
 * Verify and decode a QR token
 */
export async function verifyQrToken(
  token: string
): Promise<{ valid: boolean; payload?: QrPayload; error?: string }> {
  try {
    const { payload } = await jwtVerify(token, QR_SECRET);

    const qrPayload: QrPayload = {
      permissionId: payload.permissionId as string,
      tokenId: payload.tokenId as string,
      studentId: payload.studentId as string,
      expiresAt: payload.expiresAt as string,
    };

    // Check expiration
    if (new Date(qrPayload.expiresAt) < new Date()) {
      return { valid: false, error: "QR code has expired" };
    }

    return { valid: true, payload: qrPayload };
  } catch (error) {
    return { valid: false, error: "Invalid or tampered QR code" };
  }
}

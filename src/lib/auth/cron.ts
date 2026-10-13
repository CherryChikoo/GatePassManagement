import { timingSafeEqual } from "crypto";

/**
 * Validates a cron request. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`;
 * manual triggers may use the `x-cron-secret` header. Constant-time comparison.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const provided = request.headers.get("x-cron-secret") || bearer;
  if (!provided) return false;

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

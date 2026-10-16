import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";
import { autoExpireOutdatedPermissions } from "@/lib/permissions/auto-expire";

/**
 * Daily expiry job, scheduled for 00:00 IST (18:30 UTC) in vercel.json.
 * Expires passes whose QR window has ended or whose scheduled IST day is over.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or `x-cron-secret`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    logger.warn("[EXPIRE-REQUESTS] Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await autoExpireOutdatedPermissions(true);
    // The job reports its own failures in `result` (it doesn't throw): pass them on,
    // so a failed run shows up as a failed cron in Vercel instead of a green tick.
    const ok = (result as { success?: boolean } | undefined)?.success !== false;
    if (ok) logger.info("[EXPIRE-REQUESTS] Finished expiration job", result);
    else logger.error("[EXPIRE-REQUESTS] Expiration job failed", undefined, result as any);
    return NextResponse.json(
      { success: ok, timestamp: new Date().toISOString(), result },
      { status: ok ? 200 : 500 }
    );
  } catch (error: any) {
    logger.error("[EXPIRE-REQUESTS] Fatal error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

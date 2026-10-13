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
    logger.info("[EXPIRE-REQUESTS] Finished expiration job", result);
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), result });
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

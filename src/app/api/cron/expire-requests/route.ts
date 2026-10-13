import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { timingSafeEqual } from "crypto";
import { logger } from "@/lib/logger";
import { autoExpireOutdatedPermissions } from "@/lib/permissions/auto-expire";

/**
 * Auto-expire permission requests cron job
 * Expires pending requests that are older than 10 minutes
 * 
 * Security: Uses constant-time comparison and header-based authentication
 * 
 * Usage: 
 * curl -X GET https://your-domain.com/api/cron/expire-requests \
 *   -H "x-cron-secret: YOUR_CRON_SECRET"
 */

export async function GET(request: NextRequest) {
  try {
    // 1. Verify cron secret (prevent unauthorized access)
    const authHeader = request.headers.get("authorization");
    const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const providedSecret = request.headers.get("x-cron-secret") || bearerSecret;
    const expectedSecret = process.env.CRON_SECRET;

    if (!providedSecret || !expectedSecret) {
      logger.error('[EXPIRE-REQUESTS] Missing cron secret');
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401 }
      );
    }

    // Use constant-time comparison to prevent timing attacks
    try {
      const providedBuffer = Buffer.from(providedSecret, 'utf8');
      const expectedBuffer = Buffer.from(expectedSecret, 'utf8');

      if (
        providedBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(providedBuffer, expectedBuffer)
      ) {
        logger.error('[EXPIRE-REQUESTS] Invalid cron secret');
        return NextResponse.json(
          { error: "Unauthorized" }, 
          { status: 401 }
        );
      }
    } catch (err) {
      logger.error('[EXPIRE-REQUESTS] Error comparing secrets', err);
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401 }
      );
    }

    logger.info('[EXPIRE-REQUESTS] Starting auto-expiration job (Midnight & Time-limit Cron)...');

    // Run full forced expiration: both time limit passed and midnight passed
    const expireResult = await autoExpireOutdatedPermissions(true);

    logger.info(`[EXPIRE-REQUESTS] Finished expiration job`, expireResult);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result: expireResult,
      message: `Expired outdated requests successfully`,
    });
  } catch (error: any) {
    logger.error("[EXPIRE-REQUESTS] Fatal error", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Disable caching for cron jobs
export const dynamic = 'force-dynamic';
export const revalidate = 0;

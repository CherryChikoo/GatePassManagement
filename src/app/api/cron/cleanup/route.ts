import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteOldPhotos } from "@/lib/storage/image-upload";
import { timingSafeEqual } from "crypto";
import { logger } from "@/lib/logger";

/**
 * Automated cleanup cron job
 * Deletes old permissions, movements, QR codes, and photos
 * 
 * Security: Uses constant-time comparison and header-based authentication
 * 
 * Usage: 
 * curl -X GET https://your-domain.com/api/cron/cleanup \
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
      logger.error('[CLEANUP] Missing cron secret');
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
        logger.error('[CLEANUP] Invalid cron secret');
        return NextResponse.json(
          { error: "Unauthorized" }, 
          { status: 401 }
        );
      }
    } catch (err) {
      logger.error('[CLEANUP] Error comparing secrets', err);
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401 }
      );
    }

    logger.info('[CLEANUP] Starting cleanup job...');

    const results = {
      deletedPermissions: 0,
      deletedMovements: 0,
      deletedQRs: 0,
      deletedPhotos: 0,
      errors: [] as string[],
    };

    // 2. Delete completed permissions older than 6 months
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const deletedPerms = await prisma.permission.deleteMany({
        where: {
          status: { in: ["COMPLETED", "EXPIRED"] },
          createdAt: { lt: sixMonthsAgo },
        },
      });

      results.deletedPermissions = deletedPerms.count;
      logger.info(`[CLEANUP] Deleted ${deletedPerms.count} old permissions`);
    } catch (err: any) {
      const errorMsg = `Permission cleanup: ${err.message}`;
      results.errors.push(errorMsg);
      logger.error(`[CLEANUP] ${errorMsg}`, err);
    }

    // 3. Delete movements older than 1 year
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const deletedMovs = await prisma.movement.deleteMany({
        where: {
          createdAt: { lt: oneYearAgo },
        },
      });

      results.deletedMovements = deletedMovs.count;
      logger.info(`[CLEANUP] Deleted ${deletedMovs.count} old movements`);
    } catch (err: any) {
      const errorMsg = `Movement cleanup: ${err.message}`;
      results.errors.push(errorMsg);
      logger.error(`[CLEANUP] ${errorMsg}`, err);
    }

    // 4. Delete expired QR credentials older than 30 days
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deletedQRs = await prisma.qrCredential.deleteMany({
        where: {
          expiresAt: { lt: thirtyDaysAgo },
          active: false,
        },
      });

      results.deletedQRs = deletedQRs.count;
      logger.info(`[CLEANUP] Deleted ${deletedQRs.count} old QR codes`);
    } catch (err: any) {
      const errorMsg = `QR cleanup: ${err.message}`;
      results.errors.push(errorMsg);
      logger.error(`[CLEANUP] ${errorMsg}`, err);
    }

    // 5. Delete exit photos older than 90 days (from Supabase Storage)
    try {
      const photoResult = await deleteOldPhotos(90);
      if (photoResult.error) {
        results.errors.push(`Photo cleanup: ${photoResult.error}`);
      } else {
        results.deletedPhotos = photoResult.deleted;
      }
      logger.info(`[CLEANUP] Deleted ${photoResult.deleted} old photos`);
    } catch (err: any) {
      const errorMsg = `Photo cleanup: ${err.message}`;
      results.errors.push(errorMsg);
      logger.error(`[CLEANUP] ${errorMsg}`, err);
    }

    logger.info('[CLEANUP] Cleanup job completed', results);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    logger.error("[CLEANUP] Fatal error", error);
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

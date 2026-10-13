import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteOldPhotos } from "@/lib/storage/storage-admin";
import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";
import { RETENTION } from "@/lib/constants";

/**
 * Automated cleanup cron job.
 * Removes stale, finished records that carry no gate history, expired QR
 * credentials, and old photos. Gate movement history is kept for
 * RETENTION.OLD_MOVEMENTS_YEARS.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or `x-cron-secret`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    logger.warn("[CLEANUP] Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    deletedPermissions: 0,
    deletedMovements: 0,
    deletedQRs: 0,
    deletedPhotos: 0,
    errors: [] as string[],
  };

  try {
    logger.info("[CLEANUP] Starting cleanup job...");

    // 1. Movements older than the retention window (must go before their permissions: FK)
    try {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - RETENTION.OLD_MOVEMENTS_YEARS);
      const deleted = await prisma.movement.deleteMany({ where: { createdAt: { lt: cutoff } } });
      results.deletedMovements = deleted.count;
    } catch (err: any) {
      results.errors.push(`Movement cleanup: ${err.message}`);
      logger.error("[CLEANUP] Movement cleanup failed", err);
    }

    // 2. Finished permissions older than N months that no longer have gate movements
    try {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - RETENTION.COMPLETED_PERMISSIONS_MONTHS);
      const deleted = await prisma.permission.deleteMany({
        where: {
          status: { in: ["COMPLETED", "EXPIRED", "CANCELLED", "REJECTED"] },
          createdAt: { lt: cutoff },
          movements: { none: {} },
        },
      });
      results.deletedPermissions = deleted.count;
    } catch (err: any) {
      results.errors.push(`Permission cleanup: ${err.message}`);
      logger.error("[CLEANUP] Permission cleanup failed", err);
    }

    // 3. Inactive QR credentials that expired long ago
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RETENTION.EXPIRED_QR_CODES_DAYS);
      const deleted = await prisma.qrCredential.deleteMany({
        where: { expiresAt: { lt: cutoff }, active: false },
      });
      results.deletedQRs = deleted.count;
    } catch (err: any) {
      results.errors.push(`QR cleanup: ${err.message}`);
      logger.error("[CLEANUP] QR cleanup failed", err);
    }

    // 4. Old photos in Supabase Storage
    const photoResult = await deleteOldPhotos(RETENTION.EXIT_PHOTOS_DAYS);
    if (photoResult.error) results.errors.push(`Photo cleanup: ${photoResult.error}`);
    results.deletedPhotos = photoResult.deleted;

    logger.info("[CLEANUP] Cleanup job completed", results);
    return NextResponse.json({ success: results.errors.length === 0, timestamp: new Date().toISOString(), results });
  } catch (error: any) {
    logger.error("[CLEANUP] Fatal error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

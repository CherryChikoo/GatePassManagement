import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteOldPhotos } from "@/lib/storage/storage-admin";
import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";
import { RETENTION } from "@/lib/constants";
import { getSyncReport, reconcilePortalWithLogins } from "@/lib/accounts/sync";

/**
 * Automated cleanup cron job.
 * Removes expired QR credentials and old gate photos, and re-checks account
 * sync. Pass, movement and register records are permanent and never deleted.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or `x-cron-secret`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    logger.warn("[CLEANUP] Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    deletedQRs: 0,
    deletedPhotos: 0,
    errors: [] as string[],
  };

  try {
    logger.info("[CLEANUP] Starting cleanup job...");

    // Passes, gate movements, approvals and register records are permanent
    // (see prisma/migrations/registers_immutability.sql) and are never deleted here.

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

    // 4. Old visitor photos (student gate photos are permanent)
    const photoResult = await deleteOldPhotos(RETENTION.EXIT_PHOTOS_DAYS);
    if (photoResult.error) results.errors.push(`Photo cleanup: ${photoResult.error}`);
    results.deletedPhotos = photoResult.deleted;

    // 5. Portal ⇄ Supabase Auth safety net (database triggers handle it live)
    let accountSync: Record<string, unknown> = {};
    try {
      const fixed = await reconcilePortalWithLogins();
      const after = await getSyncReport();
      accountSync = {
        ...fixed,
        loginsWithoutPortalAccount: after.loginWithoutPortal.map((l) => l.email),
        inSync: after.inSync,
      };
      if (!after.inSync) logger.warn("[CLEANUP] Accounts still out of sync — review in Admin → Users", accountSync);
    } catch (err: any) {
      results.errors.push(`Account sync: ${err.message}`);
      logger.error("[CLEANUP] Account sync failed", err);
    }

    logger.info("[CLEANUP] Cleanup job completed", { ...results, accountSync });
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

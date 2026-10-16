import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteOldPhotos } from "@/lib/storage/storage-admin";
import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";
import { RETENTION } from "@/lib/constants";
import { getSyncReport } from "@/lib/accounts/sync";

/**
 * Automated cleanup cron job.
 * Removes expired QR credentials and old visitor photos, and reports (never
 * fixes) account sync. Pass, movement and register records are permanent.
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

    // 5. Portal ⇄ Supabase Auth check — REPORT ONLY. Database triggers keep the two
    // in sync live; anything left over is fixed by an admin in Admin → Users
    // ("Fix portal accounts"), never deleted automatically at night.
    // Counts only: no names or email addresses in the logs.
    let accountSync: Record<string, unknown> = {};
    try {
      const report = await getSyncReport();
      accountSync = {
        inSync: report.inSync,
        portalWithoutLogin: report.portalWithoutLogin.length,
        loginWithoutPortal: report.loginWithoutPortal.length,
        emailMismatch: report.emailMismatch.length,
      };
      if (!report.inSync) logger.warn("[CLEANUP] Accounts out of sync — review in Admin → Users", accountSync);
    } catch (err: any) {
      results.errors.push(`Account sync: ${err.message}`);
      logger.error("[CLEANUP] Account sync failed", err);
    }

    logger.info("[CLEANUP] Cleanup job completed", { ...results, accountSync });
    const ok = results.errors.length === 0;
    return NextResponse.json(
      { success: ok, timestamp: new Date().toISOString(), results },
      { status: ok ? 200 : 500 }
    );
  } catch (error: any) {
    logger.error("[CLEANUP] Fatal error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

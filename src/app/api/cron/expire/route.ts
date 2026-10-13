import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/cron/expire
 * Scheduled via vercel.json to run every day at midnight.
 * 
 * Requirements:
 * "every day at when 12 am hit all requests will be expired"
 */
export async function GET(request: Request) {
  // Ensure the request is authorized
  const authHeader = request.headers.get("authorization");
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (
    !expectedSecret ||
    (authHeader !== `Bearer ${expectedSecret}` && cronSecretHeader !== expectedSecret)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Mark all un-exited PENDING or APPROVED requests as EXPIRED
    const permissions = await prisma.permission.updateMany({
      where: {
        status: { in: ["PENDING", "APPROVED"] },
      },
      data: {
        status: "EXPIRED",
      },
    });

    // 2. Deactivate any dangling unused QR codes
    const qrs = await prisma.qrCredential.updateMany({
      where: {
        active: true,
        usedForExit: false,
      },
      data: {
        active: false,
      },
    });

    return NextResponse.json({ 
      success: true, 
      expiredPermissions: permissions.count,
      deactivatedQRs: qrs.count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[Cron Expire Error]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

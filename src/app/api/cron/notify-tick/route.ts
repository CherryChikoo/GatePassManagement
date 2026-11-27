import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";
import { runNotifyTick } from "@/lib/notifications/timers";

/**
 * Timed alerts tick (overstaying visitors, overdue passes, curfew, morning
 * summary, approver reminders, estate to-verify). Called every 5 minutes by
 * Supabase pg_cron (see prisma/migrations/notification_timers.sql) because
 * Vercel's free plan only runs daily crons. Safe to run any number of times:
 * every alert has a dedupe key.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`.
 */
async function tick(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    logger.warn("[NOTIFY-TICK] Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sent = await runNotifyTick();
  return NextResponse.json({ ok: true, sent });
}

export const GET = tick;
export const POST = tick;

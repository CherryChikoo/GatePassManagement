/**
 * Timing of the timed alerts (one row, id "default", edited by Admin).
 * Works with the defaults when the row is missing: it is created on first use.
 */
import { prisma } from "@/lib/db/prisma";

export type NotificationTimers = {
  overstayHours: number;
  reminderMinutes: number;
  curfewTime: string;
  summaryTime: string;
  summariesOn: boolean;
  menteeAlertsOn: boolean;
};

export const DEFAULT_TIMERS: NotificationTimers = {
  overstayHours: 3,
  reminderMinutes: 60,
  curfewTime: "21:00",
  summaryTime: "08:00",
  summariesOn: true,
  menteeAlertsOn: false,
};

export async function getNotificationTimers(): Promise<NotificationTimers> {
  try {
    // upsert with no changes = create when missing, safe if two requests race
    const row = await prisma.notificationConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
    return {
      overstayHours: row.overstayHours,
      reminderMinutes: row.reminderMinutes,
      curfewTime: row.curfewTime,
      summaryTime: row.summaryTime,
      summariesOn: row.summariesOn,
      menteeAlertsOn: row.menteeAlertsOn,
    };
  } catch {
    // Table not created yet (SQL not run): carry on with the defaults
    return DEFAULT_TIMERS;
  }
}

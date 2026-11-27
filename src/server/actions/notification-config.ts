"use server";

/** Admin → Notifications: timing of the timed alerts (one settings row). */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";
import { isValidTime } from "@/lib/time/ist";
import { getNotificationTimers, type NotificationTimers } from "@/lib/notifications/config";

export async function getNotificationSettings(): Promise<NotificationTimers> {
  await requireRole("ADMIN");
  return getNotificationTimers();
}

export async function saveNotificationSettings(input: NotificationTimers): Promise<{ success: true } | { error: string }> {
  await requireRole("ADMIN");
  const hours = Number(input.overstayHours);
  const minutes = Number(input.reminderMinutes);
  if (!Number.isInteger(hours) || hours < 1 || hours > 12) return { error: "Overstay hours must be 1 to 12" };
  if (![30, 60, 120].includes(minutes)) return { error: "Reminder must be every 30, 60 or 120 minutes" };
  if (!isValidTime(input.curfewTime) || !isValidTime(input.summaryTime)) return { error: "Enter valid times" };
  const data = {
    overstayHours: hours,
    reminderMinutes: minutes,
    curfewTime: input.curfewTime.trim(),
    summaryTime: input.summaryTime.trim(),
    summariesOn: !!input.summariesOn,
    menteeAlertsOn: !!input.menteeAlertsOn,
  };
  try {
    await prisma.notificationConfig.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  } catch {
    return { error: "Could not save. Has notification_timers.sql been run?" };
  }
  revalidatePath("/admin/notifications");
  return { success: true };
}

import { requireRole } from "@/lib/auth/helpers";
import { getNotificationTimers } from "@/lib/notifications/config";
import { NotificationsClient } from "./client";

export default async function AdminNotificationsPage() {
  await requireRole("ADMIN");
  return <NotificationsClient initial={await getNotificationTimers()} />;
}

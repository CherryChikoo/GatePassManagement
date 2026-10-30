import { requireRole } from "@/lib/auth/helpers";
import { ActivityClient } from "./client";

/** The day's activity loads in the browser (ActivityClient), so this page opens at once. */
export default async function AdminActivityPage() {
  const user = await requireRole("ADMIN");
  return <ActivityClient user={user} />;
}

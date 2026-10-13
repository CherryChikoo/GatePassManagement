import { requireRole } from "@/lib/auth/helpers";
import { WardenDashboardClient } from "./client";

export default async function WardenDashboardPage() {
  const user = await requireRole("WARDEN");
  return <WardenDashboardClient user={user} />;
}

import { requireRole } from "@/lib/auth/helpers";
import { SecurityDashboardClient } from "./client";

export default async function SecurityDashboardPage() {
  const user = await requireRole("SECURITY");
  return <SecurityDashboardClient user={user} />;
}

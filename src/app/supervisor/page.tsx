import { requireRole } from "@/lib/auth/helpers";
import { SupervisorDashboardClient } from "./client";

export default async function SupervisorDashboardPage() {
  const user = await requireRole("SECURITY_SUPERVISOR");
  return <SupervisorDashboardClient user={{ name: user.name }} />;
}

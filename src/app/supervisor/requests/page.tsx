import { requireRole } from "@/lib/auth/helpers";
import { SupervisorRequestsClient } from "./client";

export default async function SupervisorRequestsPage() {
  await requireRole("SECURITY_SUPERVISOR");
  return <SupervisorRequestsClient />;
}

import { requireRole } from "@/lib/auth/helpers";
import { ExecutiveFacultyClient } from "@/components/dashboard/executive-faculty-client";

export default async function SupervisorFacultyPage() {
  await requireRole("SECURITY_SUPERVISOR");
  return <ExecutiveFacultyClient role="SECURITY_SUPERVISOR" />;
}

import { requireRole } from "@/lib/auth/helpers";
import { ExecutiveStudentsClient } from "@/components/dashboard/executive-students-client";

export default async function SupervisorStudentsPage() {
  await requireRole("SECURITY_SUPERVISOR");
  return <ExecutiveStudentsClient role="SECURITY_SUPERVISOR" roleTitle="Security Supervisor" />;
}

import { requireRole } from "@/lib/auth/helpers";
import { ExecutiveStudentsClient } from "@/components/dashboard/executive-students-client";

export default async function DirectorStudentsPage() {
  await requireRole("DIRECTOR");
  return <ExecutiveStudentsClient role="DIRECTOR" roleTitle="Director Oversight" />;
}

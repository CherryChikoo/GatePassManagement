import { requireRole } from "@/lib/auth/helpers";
import { ExecutiveStudentsClient } from "@/components/dashboard/executive-students-client";

export default async function DeanStudentsPage() {
  await requireRole("DEAN");
  return <ExecutiveStudentsClient role="DEAN" roleTitle="Dean Oversight" />;
}

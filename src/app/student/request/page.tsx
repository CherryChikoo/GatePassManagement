import { requireRole } from "@/lib/auth/helpers";
import { getStudentFormData } from "@/server/actions/permissions";
import { RequestFormClient } from "./client";

export default async function StudentRequestPage() {
  const user = await requireRole("STUDENT");
  const formData = await getStudentFormData();

  if (!formData) {
    return <div className="p-8 text-center text-zinc-400">Student record not found. Contact the administrator.</div>;
  }

  return (
    <RequestFormClient
      user={user}
      assignedApprover={formData.assignedApprover}
      isHosteller={formData.isHosteller}
    />
  );
}

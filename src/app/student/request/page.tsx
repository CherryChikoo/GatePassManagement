import { requireRole } from "@/lib/auth/helpers";
import { getStudentFormData } from "@/server/actions/permissions";
import { RequestFormClient } from "./client";

export default async function StudentRequestPage() {
  const user = await requireRole("STUDENT");
  const formData = await getStudentFormData();

  if (!formData) {
    return <div>Loading...</div>;
  }

  return (
    <RequestFormClient
      user={user}
      approvers={formData.approvers}
      isHosteller={formData.isHosteller}
    />
  );
}

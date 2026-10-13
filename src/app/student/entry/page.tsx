import { requireRole } from "@/lib/auth/helpers";
import { getStudentFormData } from "@/server/actions/permissions";
import { EntryRequestClient } from "./client";

export default async function EntryRequestPage() {
  const user = await requireRole("STUDENT");
  const formData = await getStudentFormData();

  if (!formData) {
    return <div>Loading...</div>;
  }

  return (
    <EntryRequestClient
      user={user}
      approvers={formData.approvers}
      isHosteller={formData.isHosteller}
    />
  );
}

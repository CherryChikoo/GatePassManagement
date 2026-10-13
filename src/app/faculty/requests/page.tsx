import { requireRole } from "@/lib/auth/helpers";
import { FacultyRequestsClient } from "./client";

export default async function FacultyRequestsPage() {
  const user = await requireRole("FACULTY");
  return <FacultyRequestsClient user={user} />;
}

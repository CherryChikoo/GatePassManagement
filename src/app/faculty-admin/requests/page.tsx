import { requireRole } from "@/lib/auth/helpers";
import { FacultyAdminRequestsClient } from "./client";

export default async function FacultyAdminRequestsPage() {
  await requireRole("FACULTY_ADMIN");
  return <FacultyAdminRequestsClient />;
}

import { requireRole } from "@/lib/auth/helpers";
import { FacultyAdminDashboardClient } from "./client";

export default async function FacultyAdminPage() {
  const user = await requireRole("FACULTY_ADMIN");
  return <FacultyAdminDashboardClient user={user} />;
}

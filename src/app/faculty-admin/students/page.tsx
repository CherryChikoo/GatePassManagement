import { requireRole } from "@/lib/auth/helpers";
import { FacultyStudentsClient } from "@/app/faculty/students/client";

export default async function FacultyAdminStudentsPage() {
  const user = await requireRole("FACULTY_ADMIN");
  return <FacultyStudentsClient user={user} detailBasePath="/faculty-admin/students" />;
}

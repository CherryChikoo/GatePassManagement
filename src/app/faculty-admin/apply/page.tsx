import { requireRole } from "@/lib/auth/helpers";
import { FacultyApplyClient } from "@/app/faculty/apply/client";

export default async function FacultyAdminApplyPage() {
  await requireRole("FACULTY_ADMIN");
  return <FacultyApplyClient />;
}

import { requireRole } from "@/lib/auth/helpers";
import { FacultyAdminFacultyClient } from "./client";

export default async function FacultyAdminFacultyPage() {
  const user = await requireRole("FACULTY_ADMIN");
  return <FacultyAdminFacultyClient user={user} />;
}

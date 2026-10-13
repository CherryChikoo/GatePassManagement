import { requireRole } from "@/lib/auth/helpers";
import { FacultyStudentsClient } from "./client";

export default async function FacultyStudentsPage() {
  const user = await requireRole("FACULTY");
  return <FacultyStudentsClient user={user} />;
}

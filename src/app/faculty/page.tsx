import { requireRole } from "@/lib/auth/helpers";
import { FacultyDashboardClient } from "./client";

export default async function FacultyDashboardPage() {
  const user = await requireRole("FACULTY");
  return <FacultyDashboardClient user={user} />;
}

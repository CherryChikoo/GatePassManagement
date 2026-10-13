import { requireRole } from "@/lib/auth/helpers";
import { StudentDashboardClient } from "./client";

export default async function StudentDashboardPage() {
  const user = await requireRole("STUDENT");
  return <StudentDashboardClient user={user} />;
}

import { requireRole } from "@/lib/auth/helpers";
import { AdminDashboardClient } from "./client";

export default async function AdminDashboardPage() {
  const user = await requireRole("ADMIN");
  return <AdminDashboardClient user={user} />;
}

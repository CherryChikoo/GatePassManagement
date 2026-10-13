import { requireRole } from "@/lib/auth/helpers";
import { DeanDashboardClient } from "./client";

export default async function DeanPage() {
  const user = await requireRole("DEAN");
  return <DeanDashboardClient user={user} />;
}

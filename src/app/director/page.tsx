import { requireRole } from "@/lib/auth/helpers";
import { DirectorDashboardClient } from "./client";

export default async function DirectorPage() {
  const user = await requireRole("DIRECTOR");
  return <DirectorDashboardClient user={user} />;
}

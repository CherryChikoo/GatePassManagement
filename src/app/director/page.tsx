import { requireRole } from "@/lib/auth/helpers";
import { getLeadershipTitle } from "@/lib/auth/titles";
import { DirectorDashboardClient } from "./client";

export default async function DirectorPage() {
  const user = await requireRole("DIRECTOR");
  const title = await getLeadershipTitle(user.profileId, "DIRECTOR");
  return <DirectorDashboardClient user={user} title={title} />;
}

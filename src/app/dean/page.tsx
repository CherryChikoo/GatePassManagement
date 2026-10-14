import { requireRole } from "@/lib/auth/helpers";
import { getLeadershipTitle } from "@/lib/auth/titles";
import { DeanDashboardClient } from "./client";

export default async function DeanPage() {
  const user = await requireRole("DEAN");
  const title = await getLeadershipTitle(user.profileId, "DEAN");
  return <DeanDashboardClient user={user} title={title} />;
}

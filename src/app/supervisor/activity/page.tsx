import { requireRole } from "@/lib/auth/helpers";
import { loadCampusActivity } from "@/lib/activity/campus-activity";
import { ExecutiveActivityClient } from "@/components/dashboard/executive-activity-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SupervisorActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const { date } = await searchParams;
  const user = await requireRole("SECURITY_SUPERVISOR");
  const activity = await loadCampusActivity(date);

  return <ExecutiveActivityClient role="SECURITY_SUPERVISOR" user={user} {...activity} />;
}

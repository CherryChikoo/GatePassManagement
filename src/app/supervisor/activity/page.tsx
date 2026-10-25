import { requireRole } from "@/lib/auth/helpers";
import { ExecutiveActivityClient } from "@/components/dashboard/executive-activity-client";

/** The day's activity loads in the browser (ExecutiveActivityClient), so this page opens at once. */
export default async function SupervisorActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const { date } = await searchParams;
  const user = await requireRole("SECURITY_SUPERVISOR");

  return <ExecutiveActivityClient role="SECURITY_SUPERVISOR" user={user} initialDate={date} />;
}

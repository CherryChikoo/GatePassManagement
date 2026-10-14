import { requireRole } from "@/lib/auth/helpers";
import { loadCampusActivity } from "@/lib/activity/campus-activity";
import { DeanActivityClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DeanActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const { date } = await searchParams;
  const user = await requireRole("DEAN");
  const activity = await loadCampusActivity(date);

  return <DeanActivityClient user={user} {...activity} />;
}

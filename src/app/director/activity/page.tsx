import { requireRole } from "@/lib/auth/helpers";
import { loadCampusActivity } from "@/lib/activity/campus-activity";
import { DirectorActivityClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DirectorActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const { date } = await searchParams;
  const user = await requireRole("DIRECTOR");
  const activity = await loadCampusActivity(date);

  return <DirectorActivityClient user={user} {...activity} />;
}

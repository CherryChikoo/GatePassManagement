import { requireRole } from "@/lib/auth/helpers";
import { DirectorActivityClient } from "./client";

/** The day's activity loads in the browser (ExecutiveActivityClient), so this page opens at once. */
export default async function DirectorActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const { date } = await searchParams;
  const user = await requireRole("DIRECTOR");

  return <DirectorActivityClient user={user} initialDate={date} />;
}

import { requireRole } from "@/lib/auth/helpers";
import { DeanActivityClient } from "./client";

/** The day's activity loads in the browser (ExecutiveActivityClient), so this page opens at once. */
export default async function DeanActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const { date } = await searchParams;
  const user = await requireRole("DEAN");

  return <DeanActivityClient user={user} initialDate={date} />;
}

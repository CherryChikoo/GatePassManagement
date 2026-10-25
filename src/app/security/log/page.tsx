import { requireRole } from "@/lib/auth/helpers";
import { SecurityLogClient } from "./client";

/**
 * Gate Log (Security). The day's log loads in the browser from the gate
 * cache (src/lib/gate-cache.ts): the screen opens at once and fetches only
 * when the day was not seen yet or a gate scan / visitor changed it.
 */
export default async function SecurityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  await requireRole("SECURITY");
  return <SecurityLogClient initialDate={typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined} />;
}

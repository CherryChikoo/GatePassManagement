import { requireRole } from "@/lib/auth/helpers";
import { OutsidersClient } from "./client";

/**
 * Visitors (Security): one screen — who is inside now, today's log, and New
 * visitor. The lists load in the browser from the gate cache
 * (src/lib/gate-cache.ts): the screen opens at once, showing the last copy,
 * and fetches only when a visitor was registered / let out somewhere.
 * ?view=new opens the form, ?view=log the log (links from the Registers list).
 */
export default async function OutsidersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireRole("SECURITY");
  const { view } = await searchParams;
  const initialView = view === "new" ? "new" : view === "log" ? "log" : "inside";
  return <OutsidersClient user={user} initialView={initialView} />;
}

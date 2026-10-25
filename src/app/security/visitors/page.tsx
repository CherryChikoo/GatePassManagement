import { requireRole } from "@/lib/auth/helpers";
import { OutsidersClient } from "./client";

/**
 * Visitors (Security). The lists load in the browser from the gate cache
 * (src/lib/gate-cache.ts): the screen opens at once, showing the last copy,
 * and fetches only when a visitor was registered / let out somewhere.
 */
export default async function OutsidersPage() {
  const user = await requireRole("SECURITY");
  return <OutsidersClient user={user} />;
}

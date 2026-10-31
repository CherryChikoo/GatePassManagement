import { requireRole } from "@/lib/auth/helpers";
import { OutsidersClient } from "./client";

/**
 * Visitors (Security): 4 big buttons — Show QR (the visitor fills the form on
 * their phone), Type it myself (New visitor), Inside now, Old records. Each
 * opens its screen in the browser (?view=qr|new|inside|log, so links to
 * ?view=new / ?view=log still work). The lists load from the gate cache
 * (src/lib/gate-cache.ts): a screen opens at once, showing the last copy, and
 * fetches only when a visitor was registered / let out somewhere.
 */
export default async function OutsidersPage() {
  await requireRole("SECURITY");
  return <OutsidersClient />;
}

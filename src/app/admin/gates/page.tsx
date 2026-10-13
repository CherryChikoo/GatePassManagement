import { requireRole } from "@/lib/auth/helpers";
import { getAdminGates } from "@/server/actions/admin";
import { GatesClient } from "./client";

export default async function AdminGatesPage() {
  const user = await requireRole("ADMIN");
  const gates = await getAdminGates();
  return <GatesClient user={user} gates={gates} />;
}

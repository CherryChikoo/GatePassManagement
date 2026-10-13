import { requireRole } from "@/lib/auth/helpers";
import { WardenRequestsClient } from "./client";

export default async function WardenRequestsPage() {
  const user = await requireRole("WARDEN");
  return <WardenRequestsClient user={user} />;
}

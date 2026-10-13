import { requireRole } from "@/lib/auth/helpers";
import { DeanRequestsClient } from "./client";

export default async function DeanRequestsPage() {
  const user = await requireRole("DEAN");
  return <DeanRequestsClient />;
}

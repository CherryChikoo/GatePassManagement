import { requireRole } from "@/lib/auth/helpers";
import { DirectorRequestsClient } from "./client";

export default async function DirectorRequestsPage() {
  const user = await requireRole("DIRECTOR");
  return <DirectorRequestsClient />;
}

import { requireRole } from "@/lib/auth/helpers";
import { WardenStudentsClient } from "./client";

export default async function WardenStudentsPage() {
  const user = await requireRole("WARDEN");
  return <WardenStudentsClient user={user} />;
}

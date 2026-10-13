import { requireRole } from "@/lib/auth/helpers";
import { DeanHodsClient } from "./client";

export default async function DeanHodsPage() {
  const user = await requireRole("DEAN");
  return <DeanHodsClient />;
}

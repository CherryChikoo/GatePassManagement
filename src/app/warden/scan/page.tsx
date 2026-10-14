import { requireRole } from "@/lib/auth/helpers";
import { WardenScanClient } from "./client";

export default async function WardenScanPage() {
  await requireRole("WARDEN");
  return <WardenScanClient />;
}

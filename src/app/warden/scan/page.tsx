import { requireRole } from "@/lib/auth/helpers";
import { WardenScanClient } from "./client";

export default async function WardenScanPage({ searchParams }: { searchParams: Promise<{ scan?: string }> }) {
  await requireRole("WARDEN");
  const { scan } = await searchParams;
  // Opened from a "Scan" button: go straight to the camera
  return <WardenScanClient autoStart={scan === "1"} />;
}

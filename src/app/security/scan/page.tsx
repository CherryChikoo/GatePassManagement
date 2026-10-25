import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { ScanClient } from "./client";

/** Active gates, read fresh (a tiny table; the page itself is pre-loaded by the bottom bar) */
function activeGates() {
  return prisma.gate.findMany({
    where: { active: true },
    select: { id: true, name: true, location: true },
  });
}

export default async function SecurityScanPage({ searchParams }: { searchParams: Promise<{ scan?: string }> }) {
  const user = await requireRole("SECURITY");
  const { scan } = await searchParams;
  const gates = await activeGates();
  // Opened from a "Scan" button (?scan=1): go straight to the camera
  return <ScanClient user={user} gates={gates} autoStart={scan === "1"} />;
}

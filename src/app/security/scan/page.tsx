import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { ScanClient } from "./client";

export default async function SecurityScanPage({ searchParams }: { searchParams: Promise<{ scan?: string }> }) {
  const user = await requireRole("SECURITY");
  const { scan } = await searchParams;
  const gates = await prisma.gate.findMany({
    where: { active: true },
    select: { id: true, name: true, location: true },
  });
  // Opened from a "Scan" button (?scan=1): go straight to the camera
  return <ScanClient user={user} gates={gates} autoStart={scan === "1"} />;
}

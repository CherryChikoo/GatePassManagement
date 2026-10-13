import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/prisma";
import { ScanClient } from "./client";

export default async function SecurityScanPage() {
  const user = await requireRole("SECURITY");
  const gates = await prisma.gate.findMany({
    where: { active: true },
    select: { id: true, name: true, location: true },
  });
  return <ScanClient user={user} gates={gates} />;
}

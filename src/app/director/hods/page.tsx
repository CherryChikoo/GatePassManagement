import { requireRole } from "@/lib/auth/helpers";
import { DirectorHodsClient } from "./client";

export default async function DirectorHodsPage() {
  const user = await requireRole("DIRECTOR");
  return <DirectorHodsClient />;
}

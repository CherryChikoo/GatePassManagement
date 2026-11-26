import { requireRole } from "@/lib/auth/helpers";
import { PromotionClient } from "./client";

export default async function AdminPromotionPage() {
  await requireRole("ADMIN");
  return <PromotionClient />;
}

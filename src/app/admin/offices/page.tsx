import { requireRole } from "@/lib/auth/helpers";
import { listOffices, type OfficeRow } from "@/server/actions/offices";
import { OfficesClient } from "./client";

export default async function AdminOfficesPage() {
  await requireRole("ADMIN");
  // The offices table may not exist yet (database update not run): the page
  // still opens and says the list could not be loaded
  let offices: OfficeRow[] | null = null;
  try {
    offices = await listOffices();
  } catch (err) {
    console.error("[admin/offices] listOffices failed:", err);
  }
  return <OfficesClient offices={offices} />;
}

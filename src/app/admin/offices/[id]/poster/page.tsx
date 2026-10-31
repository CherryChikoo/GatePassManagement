import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { listOffices, type OfficeRow } from "@/server/actions/offices";
import { OfficePosterClient } from "./client";

export default async function OfficePosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("ADMIN");
  // A few dozen offices at most: the full list is cheaper than another server function
  let office: OfficeRow | null | undefined;
  try {
    office = (await listOffices()).find((o) => o.id === id);
  } catch (err) {
    console.error("[admin/offices/poster] listOffices failed:", err);
    office = null;
  }
  if (office === undefined) notFound();
  return <OfficePosterClient office={office} />;
}

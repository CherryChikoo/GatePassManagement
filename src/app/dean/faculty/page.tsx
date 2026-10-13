import { requireRole } from "@/lib/auth/helpers";
import { DeanFacultyClient } from "./client";

export default async function DeanFacultyPage() {
  const user = await requireRole("DEAN");
  return <DeanFacultyClient />;
}

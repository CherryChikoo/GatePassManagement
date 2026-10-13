import { requireRole } from "@/lib/auth/helpers";
import { FacultyApplyClient } from "./client";

export default async function FacultyApplyPage() {
  await requireRole("FACULTY");
  return <FacultyApplyClient />;
}

import { requireRole } from "@/lib/auth/helpers";
import { DirectorFacultyClient } from "./client";

export default async function DirectorFacultyPage() {
  const user = await requireRole("DIRECTOR");
  return <DirectorFacultyClient />;
}

import { requireRole } from "@/lib/auth/helpers";
import { HodActivityClient } from "./client";

/** The day's department activity loads in the browser (HodActivityClient), so this page opens at once. */
export default async function FacultyAdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const { date } = await searchParams;
  const user = await requireRole("FACULTY_ADMIN");
  return <HodActivityClient user={user} initialDate={date} />;
}

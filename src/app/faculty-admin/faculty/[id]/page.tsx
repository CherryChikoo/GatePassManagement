import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { getFacultyPassHistory } from "@/server/actions/faculty-permissions";
import { FacultyPassHistoryClient } from "./client";

export default async function FacultyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole("FACULTY_ADMIN", "ADMIN");

  const res = await getFacultyPassHistory(id);

  if (!res || res.error || !res.faculty) {
    notFound();
  }

  return (
    <FacultyPassHistoryClient
      faculty={res.faculty}
      permissions={res.permissions || []}
      stats={res.stats || { total: 0, approved: 0, rejected: 0, pending: 0 }}
    />
  );
}

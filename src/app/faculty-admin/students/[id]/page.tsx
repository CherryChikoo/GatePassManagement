import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { getUserFullHistory, getAllFaculty, getAllWardens, getAllGates } from "@/server/actions/admin";
import { UserDetailClient } from "@/app/admin/users/[id]/client";

export default async function HodStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await requireRole("FACULTY_ADMIN");

  // getUserFullHistory enforces department scope and returns null otherwise
  const [targetUser, faculty, wardens, gates] = await Promise.all([
    getUserFullHistory(id),
    getAllFaculty(),
    getAllWardens(),
    getAllGates(),
  ]);

  if (!targetUser) {
    notFound();
  }

  return (
    <UserDetailClient
      currentUser={currentUser}
      targetUser={targetUser}
      faculty={faculty}
      wardens={wardens}
      gates={gates}
    />
  );
}

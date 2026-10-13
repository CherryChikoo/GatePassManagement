import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { getUserFullHistory, getAllFaculty, getAllWardens, getAllGates } from "@/server/actions/admin";
import { UserDetailClient } from "./client";

export default async function UserDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await requireRole("ADMIN", "FACULTY", "WARDEN");

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

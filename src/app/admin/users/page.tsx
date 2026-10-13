import { requireRole } from "@/lib/auth/helpers";
import { getUsers, getAllFaculty, getAllWardens, getAllGates } from "@/server/actions/admin";
import { UserManagementClient } from "./client";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; role?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = parseInt(resolvedParams.page || "1");
  const roleFilter = resolvedParams.role && resolvedParams.role !== "ALL" ? resolvedParams.role : "STUDENT";

  const user = await requireRole("ADMIN");
  const [usersData, faculty, wardens, gates] = await Promise.all([
    getUsers(page, 15, roleFilter), // Changed from 25 to 15
    getAllFaculty(),
    getAllWardens(),
    getAllGates(),
  ]);

  return (
    <UserManagementClient
      user={user}
      initialUsers={usersData}
      faculty={faculty}
      wardens={wardens}
      gates={gates}
      currentPage={page}
      currentRole={roleFilter}
    />
  );
}

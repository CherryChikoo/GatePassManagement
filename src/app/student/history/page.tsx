import { requireRole } from "@/lib/auth/helpers";
import { getStudentHistory } from "@/server/actions/permissions";
import { HistoryClient } from "./client";

export default async function StudentHistoryPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireRole("STUDENT");
  const currentPage = Number(searchParams.page) || 1;
  const initialData = await getStudentHistory(currentPage);

  return (
    <HistoryClient
      user={user}
      initialData={initialData}
      currentPage={currentPage}
    />
  );
}

import { requireRole } from "@/lib/auth/helpers";
import { getSecurityLogData } from "@/server/actions/security";
import { SecurityLogClient } from "./client";

export default async function SecurityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const resolvedParams = await searchParams;
  const user = await requireRole("SECURITY");
  
  const data = await getSecurityLogData(resolvedParams.date);

  return (
    <SecurityLogClient 
      user={user} 
      studentEntries={data.studentEntries}
      studentExits={data.studentExits}
      outsiderVisits={data.outsiderVisits}
      selectedDate={data.selectedDate}
    />
  );
}

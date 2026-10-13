import { requireRole } from "@/lib/auth/helpers";
import { getOutsiders } from "@/server/actions/outsiders";
import { OutsidersClient } from "./client";

export default async function OutsidersPage() {
  const user = await requireRole("SECURITY");
  const data = await getOutsiders();
  
  return (
    <OutsidersClient 
      user={user} 
      inside={data.inside || []} 
      history={data.history || []} 
    />
  );
}

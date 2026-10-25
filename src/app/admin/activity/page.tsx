import { requireRole } from "@/lib/auth/helpers";
import { getActivityData } from "@/server/actions/admin";
import { ActivityClient } from "./client";

export default async function AdminActivityPage() {
  const user = await requireRole("ADMIN");
  const data = await getActivityData();

  return <ActivityClient user={user} data={data} loadedAt={Date.now()} />;
}

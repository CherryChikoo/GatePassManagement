import { getAuthUser, getRoleDashboardPath } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  redirect(getRoleDashboardPath(user.role));
}

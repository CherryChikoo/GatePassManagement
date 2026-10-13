import { redirect } from "next/navigation";
import { getAuthUser, getRoleDashboardPath } from "@/lib/auth/helpers";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

/**
 * One signed-in user per browser: if a session already exists, go to that
 * user's dashboard instead of allowing a second login in another tab.
 * (Sign out first to switch accounts.)
 */
export default async function LoginPage() {
  const user = await getAuthUser();
  if (user) {
    redirect(getRoleDashboardPath(user.role));
  }
  return <LoginForm />;
}

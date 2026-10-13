import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/helpers";
import { DashboardLayout } from "@/components/dashboard/layout";
import { logoutAction } from "@/server/actions/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("gatepass_sidebar_collapsed")?.value === "true";

  const user = await requireAuth();

  return (
    <DashboardLayout
      defaultCollapsed={isCollapsed}
      role={user.role}
      userName={user.name}
      userEmail={user.email}
      onLogout={logoutAction}
    >
      {children}
    </DashboardLayout>
  );
}

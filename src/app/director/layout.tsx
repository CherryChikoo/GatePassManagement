import { cookies } from "next/headers";
import { DashboardLayout } from "@/components/dashboard/layout";
import { requireRole } from "@/lib/auth/helpers";
import { logoutAction } from "@/server/actions/auth";
import { StoreHydrator } from "@/components/providers/store-hydrator";
import { getLeadershipTitle } from "@/lib/auth/titles";

export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("gatepass_sidebar_collapsed")?.value === "true";

  const user = await requireRole("DIRECTOR");
  const roleTitle = await getLeadershipTitle(user.profileId, "DIRECTOR");

  return (
    <DashboardLayout
      defaultCollapsed={isCollapsed}
      role={user.role}
      userName={user.name}
      userEmail={user.email}
      onLogout={logoutAction}
      roleTitle={roleTitle}
    >
      <StoreHydrator user={{ name: user.name, email: user.email, role: user.role, profileId: user.profileId }} />
      {children}
    </DashboardLayout>
  );
}

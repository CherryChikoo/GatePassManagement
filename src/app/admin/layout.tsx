import { cookies } from "next/headers";
import { getRoleLine } from "@/lib/auth/titles";
import { DashboardLayout, adminNavItems } from "@/components/dashboard/layout";
import { requireRole, avatarUrlFor } from "@/lib/auth/helpers";
import { logoutAction } from "@/server/actions/auth";
import { StoreHydrator } from "@/components/providers/store-hydrator";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("gatepass_sidebar_collapsed")?.value === "true";

  const user = await requireRole("ADMIN");
  // Under "Gate Pass": their designation / role (e.g. "Head of Department · CSE")
  const roleTitle = await getRoleLine(user.profileId, user.role);
  
  return (
    <DashboardLayout defaultCollapsed={isCollapsed}
      role={user.role}
      userName={user.name}
      userEmail={user.email}
      onLogout={logoutAction}
      avatarUrl={avatarUrlFor(user)}
      roleTitle={roleTitle}
    >
      <StoreHydrator user={{ name: user.name, email: user.email, role: user.role, profileId: user.profileId }} />
      {children}
    </DashboardLayout>
  );
}

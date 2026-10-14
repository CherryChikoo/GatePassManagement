import { cookies } from "next/headers";
import { DashboardLayout } from "@/components/dashboard/layout";
import { requireRole } from "@/lib/auth/helpers";
import { logoutAction } from "@/server/actions/auth";
import { StoreHydrator } from "@/components/providers/store-hydrator";

/** Security Supervisor area — read-only oversight (no approve / reject). */
export default async function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("gatepass_sidebar_collapsed")?.value === "true";

  const user = await requireRole("SECURITY_SUPERVISOR");

  return (
    <DashboardLayout
      defaultCollapsed={isCollapsed}
      role={user.role}
      userName={user.name}
      userEmail={user.email}
      onLogout={logoutAction}
    >
      <StoreHydrator user={{ name: user.name, email: user.email, role: user.role, profileId: user.profileId }} />
      {children}
    </DashboardLayout>
  );
}

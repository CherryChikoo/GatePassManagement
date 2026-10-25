import { cookies } from "next/headers";
import { getRoleLine } from "@/lib/auth/titles";
import { requireRole, avatarUrlFor } from "@/lib/auth/helpers";
import { DashboardLayout } from "@/components/dashboard/layout";
import { logoutAction } from "@/server/actions/auth";
import { LanguageProvider } from "@/components/providers/language-provider";
import { HOST_ROLES } from "@/lib/visits/passes";

/** "My visitors" for every staff role that visitors can come to meet (shared like Settings). */
export default async function MyVisitorsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("gatepass_sidebar_collapsed")?.value === "true";
  const user = await requireRole(...HOST_ROLES);
  const roleTitle = await getRoleLine(user.profileId, user.role);

  return (
    <LanguageProvider initialLang="en">
      <DashboardLayout
        defaultCollapsed={isCollapsed}
        role={user.role}
        userName={user.name}
        userEmail={user.email}
        onLogout={logoutAction}
        avatarUrl={avatarUrlFor(user)}
        roleTitle={roleTitle}
      >
        {children}
      </DashboardLayout>
    </LanguageProvider>
  );
}

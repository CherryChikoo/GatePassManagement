import { cookies } from "next/headers";
import { getRoleLine } from "@/lib/auth/titles";
import { DashboardLayout, securityNavItems } from "@/components/dashboard/layout";
import { requireRole, avatarUrlFor } from "@/lib/auth/helpers";
import { logoutAction } from "@/server/actions/auth";
import { StoreHydrator } from "@/components/providers/store-hydrator";
import { LanguageProvider } from "@/components/providers/language-provider";
import { SecurityText } from "@/components/providers/security-text";
import { GateWarmup } from "@/components/providers/gate-warmup";
import { ArrivalAlert } from "@/components/visits/arrival-alert";
import { LANG_COOKIE, securityLang } from "@/lib/i18n";

export default async function SecurityLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("gatepass_sidebar_collapsed")?.value === "true";

  const user = await requireRole("SECURITY");
  // Under "Gate Pass": their designation / role (e.g. "Head of Department · CSE")
  const roleTitle = await getRoleLine(user.profileId, user.role);
  // Telugu is offered only to Security (incl. Head Security); every other role stays in English
  const lang = securityLang(cookieStore.get(LANG_COOKIE)?.value);

  return (
    <LanguageProvider initialLang={lang}>
    {/* Larger text on every Security screen */}
    <SecurityText>
    <DashboardLayout defaultCollapsed={isCollapsed}
      role={user.role}
      userName={user.name}
      userEmail={user.email}
      onLogout={logoutAction}
      avatarUrl={avatarUrlFor(user)}
      roleTitle={roleTitle}
    >
      <StoreHydrator user={{ name: user.name, email: user.email, role: user.role, profileId: user.profileId }} />
      <GateWarmup />
      {/* "New visitor waiting at the gate": visitors who filled the form on their phone */}
      <ArrivalAlert />
      {children}
    </DashboardLayout>
    </SecurityText>
    </LanguageProvider>
  );
}

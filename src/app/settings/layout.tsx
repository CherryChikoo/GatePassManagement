import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/helpers";
import { DashboardLayout } from "@/components/dashboard/layout";
import { logoutAction } from "@/server/actions/auth";
import { LanguageProvider } from "@/components/providers/language-provider";
import { LANG_COOKIE, normalizeLang } from "@/lib/i18n";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("gatepass_sidebar_collapsed")?.value === "true";

  const user = await requireAuth();
  // Telugu is offered only to Security (incl. Head Security); every other role stays in English
  const lang = user.role === "SECURITY" ? normalizeLang(cookieStore.get(LANG_COOKIE)?.value) : "en";

  return (
    <LanguageProvider initialLang={lang}>
    <DashboardLayout
      defaultCollapsed={isCollapsed}
      role={user.role}
      userName={user.name}
      userEmail={user.email}
      onLogout={logoutAction}
    >
      {children}
    </DashboardLayout>
    </LanguageProvider>
  );
}

import { cookies } from "next/headers";
import { getRoleLine } from "@/lib/auth/titles";
import { requireAuth, avatarUrlFor } from "@/lib/auth/helpers";
import { DashboardLayout } from "@/components/dashboard/layout";
import { StudentShell } from "@/components/dashboard/student-shell";
import { logoutAction } from "@/server/actions/auth";
import { LanguageProvider } from "@/components/providers/language-provider";
import { SecurityText } from "@/components/providers/security-text";
import { LANG_COOKIE, securityLang } from "@/lib/i18n";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("gatepass_sidebar_collapsed")?.value === "true";

  const user = await requireAuth();
  // Under "Gate Pass": their designation / role (e.g. "Head of Department · CSE")
  const roleTitle = await getRoleLine(user.profileId, user.role);
  // Telugu is offered only to Security (incl. Head Security); every other role stays in English
  const lang = user.role === "SECURITY" ? securityLang(cookieStore.get(LANG_COOKIE)?.value) : "en";

  // Students keep their own single-screen shell (no staff sidebar)
  if (user.role === "STUDENT") {
    return (
      <LanguageProvider initialLang="en">
        <StudentShell userName={user.name} userEmail={user.email} avatarUrl={avatarUrlFor(user)} onLogout={logoutAction}>
          {children}
        </StudentShell>
      </LanguageProvider>
    );
  }

  const page = (
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
  );
  // Security: larger text, like their other screens
  return (
    <LanguageProvider initialLang={lang}>
      {user.role === "SECURITY" ? <SecurityText>{page}</SecurityText> : page}
    </LanguageProvider>
  );
}

import { cookies } from "next/headers";
import { LanguageProvider } from "@/components/providers/language-provider";
import { PhoneShell } from "@/components/visit-phone/phone-shell";
import { LANG_COOKIE, securityLang } from "@/lib/i18n";

/**
 * Layout of the visitor's phone pages (/v/…, /o/…): public, no login.
 * Telugu by default, like the gate (English once chosen on this phone).
 */
export async function VisitPhoneLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const lang = securityLang(cookieStore.get(LANG_COOKIE)?.value);
  return (
    <LanguageProvider initialLang={lang}>
      <PhoneShell>{children}</PhoneShell>
    </LanguageProvider>
  );
}

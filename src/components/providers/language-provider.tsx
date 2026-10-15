"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANG_COOKIE, LANGS, translate, type Lang, type Translate } from "@/lib/i18n";

type LanguageContextValue = { lang: Lang; setLang: (lang: Lang) => void; t: Translate };

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: (text, vars) => translate("en", text, vars),
});

export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const router = useRouter();

  // Mark the page language while this area is open; back to English when leaving it
  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "en";
    };
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      // Server-rendered headings pick up the new language too
      router.refresh();
    },
    [router]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, t: (text, vars) => translate(lang, text, vars) }),
    [lang, setLang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}

/** Translator for Client Components: `const t = useT(); t("Dashboard")` */
export function useT(): Translate {
  return useContext(LanguageContext).t;
}

/** English / తెలుగు switch (segmented pill). */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label="Language / భాష"
      className={cn("inline-flex items-center gap-0.5 rounded-full border border-zinc-800 bg-zinc-900 p-0.5 text-xs", className)}
    >
      <Languages className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-zinc-500 hidden sm:block" aria-hidden="true" />
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => l.code !== lang && setLang(l.code)}
          aria-pressed={lang === l.code}
          lang={l.code}
          className={cn(
            "rounded-full px-2.5 py-1.5 font-medium transition-colors",
            lang === l.code ? "bg-orange-500/10 text-orange-400" : "text-zinc-500 hover:text-zinc-200"
          )}
        >
          {l.code === "en" ? (
            <>
              <span className="sm:hidden">EN</span>
              <span className="hidden sm:inline">{l.label}</span>
            </>
          ) : (
            l.label
          )}
        </button>
      ))}
    </div>
  );
}

/** Translated text that works anywhere, including inside Server Components: `<T>Dashboard</T>` */
export function T({ children, vars }: { children: string; vars?: Record<string, string | number> }) {
  return <>{useT()(children, vars)}</>;
}

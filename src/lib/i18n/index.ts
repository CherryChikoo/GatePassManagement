import { te } from "./te";

/**
 * Interface language (Telugu is offered to Security only — see app/security/layout.tsx).
 * English text is the key: anything without a Telugu
 * entry simply shows in English, so a missing translation never breaks a page.
 */
export type Lang = "en" | "te";

export const LANG_COOKIE = "gp_lang";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు" },
];

/** Security's language: Telugu unless English was chosen on this device (cookie "en") */
export function securityLang(value: string | null | undefined): Lang {
  return value === "en" ? "en" : "te";
}

export function normalizeLang(value: string | null | undefined): Lang {
  return value === "te" ? "te" : "en";
}

export type Translate = (text: string, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  let out = lang === "te" ? te[text] ?? text : text;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

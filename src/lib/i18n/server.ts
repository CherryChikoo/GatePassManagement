import { cookies } from "next/headers";
import { LANG_COOKIE, normalizeLang, translate, type Lang, type Translate } from "./index";

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return normalizeLang(store.get(LANG_COOKIE)?.value);
}

/** Translator for Server Components. */
export async function getT(): Promise<Translate> {
  const lang = await getLang();
  return (text, vars) => translate(lang, text, vars);
}

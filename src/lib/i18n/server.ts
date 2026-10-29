import { cookies } from "next/headers";
import { LANG_COOKIE, securityLang, translate, type Lang, type Translate } from "./index";

/** Used by Security pages only (Telugu is offered to Security): Telugu unless English was chosen */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return securityLang(store.get(LANG_COOKIE)?.value);
}

/** Translator for Server Components. */
export async function getT(): Promise<Translate> {
  const lang = await getLang();
  return (text, vars) => translate(lang, text, vars);
}

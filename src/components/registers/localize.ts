import type { FieldDef, RegisterDef } from "@/lib/registers/definitions";
import type { Translate } from "@/lib/i18n";
import { formatFieldValue } from "./format";

/**
 * A display copy of a register with its titles, labels, hints and placeholders
 * translated. Select option VALUES are left as they are (they are what gets
 * saved and validated); option text is translated where it is shown.
 */
export function localizeRegister<T extends RegisterDef>(def: T, t: Translate): T {
  const field = (f: FieldDef): FieldDef => ({
    ...f,
    label: t(f.label),
    placeholder: f.placeholder && t(f.placeholder),
    hint: f.hint && t(f.hint),
  });
  const out: any = { ...def, title: t(def.title), description: t(def.description) };
  if (def.kind === "entry") {
    out.fields = def.fields.map(field);
    out.groups = def.groups?.map((g) => ({ ...g, label: t(g.label), itemLabel: t(g.itemLabel), fields: g.fields.map(field) }));
    out.movement = def.movement && {
      ...def.movement,
      in: { ...def.movement.in, label: t(def.movement.in.label) },
      out: { ...def.movement.out, label: t(def.movement.out.label) },
    };
    out.fixed = def.fixed?.map((x) => ({ ...x, label: t(x.label), value: t(x.value) }));
  }
  return out;
}

/** A saved value as shown to the reader: choices (select / yes-no) are translated. */
export function displayValue(f: FieldDef, v: unknown, t: Translate): string {
  const s = formatFieldValue(f, v);
  if (f.type === "select" || f.type === "yesno") return t(s);
  return countsText(s, t) ?? s;
}

/**
 * Worker counts saved as "Peddamestri × 4, Cooli × 2" shown clearly, each
 * type in the guard's language: "పెద్దమేస్త్రి → 4 · కూలీ → 2". Null when the text is not counts.
 */
export function countsText(s: string, t: Translate): string | null {
  const parts = s.split(/,\s*/);
  const pairs = parts.map((p) => /^(.+?) × (\d+)$/.exec(p.trim()));
  if (parts.length === 0 || pairs.some((m) => !m)) return null;
  return pairs.map((m) => `${t(m![1])} → ${m![2]}`).join("  ·  ");
}

/**
 * A message from the server (register save / Out / update) in the guard's
 * language, also when it carries a name or a number:
 * "Peddamestri: only 2 still inside" → "<type>: <only {n} still inside>",
 * "Bill Number is required" → "{field} is required".
 */
export function registerMessage(t: Translate, msg: string | null | undefined): string {
  if (!msg) return "";
  const whole = t(msg);
  if (whole !== msg) return whole;
  // One number in it: translated as a pattern ("only {n} still inside")
  const withNumber = (text: string): string => {
    const whole = t(text);
    if (whole !== text) return whole;
    const nums = text.match(/\d+/g);
    if (!nums || nums.length !== 1) return text;
    const pattern = text.replace(/\d+/, "{n}");
    return t(pattern) !== pattern ? t(pattern, { n: nums[0] }) : text;
  };
  const required = /^(.+) is required$/.exec(msg);
  if (required) return t("{field} is required", { field: t(required[1]) });
  const split = /^(.+?): (.+)$/.exec(msg);
  if (split) return `${t(split[1])}: ${withNumber(split[2])}`;
  return withNumber(msg);
}

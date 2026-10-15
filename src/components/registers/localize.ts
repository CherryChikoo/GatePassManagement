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
    out.fixed = def.fixed?.map((x) => ({ label: t(x.label), value: t(x.value) }));
  }
  return out;
}

/** A saved value as shown to the reader: choices (select / yes-no) are translated. */
export function displayValue(f: FieldDef, v: unknown, t: Translate): string {
  const s = formatFieldValue(f, v);
  return f.type === "select" || f.type === "yesno" ? t(s) : s;
}

/**
 * Voice filling: what a form asks for, in a shape the speech and AI steps use.
 *
 * Built from the same register definitions the forms render, so every register
 * (built-in or made in the register builder) supports voice without its own
 * code. The Visitors registration form has its own small spec here.
 *
 * Shared by the browser and the server: keep this file free of server imports.
 */
import type { EntryRegister, FieldDef, GroupDef } from "@/lib/registers/definitions";

/** Field types that can be filled from speech (dates/times are automatic, photos need the camera) */
const SPEAKABLE = new Set<FieldDef["type"]>(["text", "textarea", "number", "phone", "select", "yesno", "staff", "department", "person"]);

export type VoiceSpec = {
  /** Register key, or VISITOR_SPEC_KEY for the Visitors registration form */
  key: string;
  title: string;
  fields: FieldDef[];
  groups: GroupDef[];
  /** In / Out registers where a record may start with either side */
  direction?: { in: string; out: string };
};

export const VISITOR_SPEC_KEY = "VISITOR_FORM";

/** Fields of a register that a guard can fill by speaking. */
export function voiceSpecForRegister(def: EntryRegister): VoiceSpec {
  const m = def.movement;
  return {
    key: def.key,
    title: def.title,
    fields: def.fields.filter((f) => SPEAKABLE.has(f.type) && f.key !== m?.directionField),
    groups: (def.groups ?? [])
      .map((g) => ({ ...g, fields: g.fields.filter((f) => SPEAKABLE.has(f.type)) }))
      .filter((g) => g.fields.length > 0),
    ...(m && !m.single && m.firstDirections.length > 1 ? { direction: { in: m.in.label, out: m.out.label } } : {}),
  };
}

/** Visitor categories on the Visitors registration form */
export const VISITOR_CATEGORIES = ["GUEST", "PARENT", "VENDOR", "WORKER"] as const;

/** The Visitors registration form (src/app/security/visitors/client.tsx) */
export const VISITOR_SPEC: VoiceSpec = {
  key: VISITOR_SPEC_KEY,
  title: "Visitor registration",
  fields: [
    { key: "name", label: "Visitor name", type: "text" },
    { key: "phone", label: "Phone number", type: "phone" },
    { key: "category", label: "Category (GUEST visitor, PARENT guardian, VENDOR delivery, WORKER staff)", type: "select", options: [...VISITOR_CATEGORIES] },
    { key: "purpose", label: "Reason / purpose of visit", type: "text" },
    { key: "vehicleNumber", label: "Vehicle number of the visitor's bike, car or auto", type: "text" },
    { key: "onFoot", label: "Came on foot, no vehicle", type: "yesno" },
    { key: "visitingStudent", label: "Person to visit (name or roll number)", type: "text" },
    { key: "department", label: "Department being visited", type: "department" },
    { key: "address", label: "Visitor's home address (village, town or area they came from)", type: "text" },
    { key: "remarks", label: "Remarks (any other note the guard gave)", type: "text" },
  ],
  groups: [],
};

/**
 * Words that help speech recognition hear this form's terms correctly
 * (field names, choices). Sarvam accepts up to 50 terms of up to 64 characters.
 */
export function keytermsFor(spec: VoiceSpec): string[] {
  const terms = new Set<string>();
  const add = (s: string | undefined) => {
    const v = (s ?? "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (v && v.length <= 64) terms.add(v);
  };
  for (const f of [...spec.fields, ...spec.groups.flatMap((g) => g.fields)]) {
    add(f.label);
    if (f.type === "select") (f.options ?? []).forEach(add);
  }
  for (const g of spec.groups) add(g.itemLabel);
  return [...terms].slice(0, 50);
}

/** What the fill step returns: form values as the form keeps them (strings). */
export type VoiceFill = {
  fields: Record<string, string>;
  groups: Record<string, Record<string, string>[]>;
  direction?: "IN" | "OUT";
};

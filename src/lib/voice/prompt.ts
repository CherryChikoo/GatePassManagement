/**
 * Voice filling, step 2: turning what the guard said into form values.
 *
 * - buildFillRequest: the instructions and the JSON schema Gemini answers in
 *   (one property per field, choice lists as fixed options, lists as arrays).
 * - cleanFill: checks Gemini's answer field by field and converts it to the
 *   strings the form uses. Anything that does not fit (unknown choice, bad
 *   phone, extra keys) is dropped, so the form is left blank rather than wrong.
 *
 * Pure functions (no network, no server imports).
 */
import type { FieldDef } from "@/lib/registers/definitions";
import { DEPARTMENTS, listedDepartmentCode } from "@/lib/constants";
import type { VoiceFill, VoiceSpec } from "./spec";

export type StaffName = { id: string; name: string };

const INSTRUCTIONS = `You fill a security gate register form from what a guard said.
The words come from speech recognition in Telugu, English or a mix, so some words may be misheard (e.g. "swift" for "shift").

Rules:
1. Use only details the guard actually said. If a field was not mentioned, or what was said is unclear, leave that field out. Never guess or invent.
2. The guard may say things in any order and skip fields. Put each detail only in the field it belongs to; never put it in a different field just to use it.
3. Write everything in English: translate ordinary Telugu words (పని -> work, బ్యాంకు పని -> bank work), and spell names and places in English letters (రమేష్ -> Ramesh). Keep it short, as said.
4. Vehicle numbers in capitals like "AP 39 AB 1234" (a bike, car, auto or lorry number is the vehicle number). Phone numbers as digits only. Roll numbers and IDs without spaces, e.g. "23ME1A0507". Counts and readings as numbers.
5. For a field with fixed options, answer with exactly one of the listed options, or leave it out.
6. Remarks / notes fields: only what the guard said as a remark or note. Never put leftover details there (a vehicle number goes in the vehicle field, a roll number in its own field).
7. For a list (e.g. workers), add one item per person or thing mentioned, each with its own details. "Same" means the same value as the previous item.
8. Dates and times are recorded automatically: ignore them.`;

/** JSON schema for one field, or null when it is not filled from speech. */
function fieldSchema(f: FieldDef, staff: StaffName[]): Record<string, unknown> | null {
  const description = f.label;
  switch (f.type) {
    case "text":
    case "textarea":
    case "person":
      return { type: "string", description };
    case "phone":
      return { type: "string", description: `${description} (digits only)` };
    case "number":
      return { type: "number", description };
    case "yesno":
      return { type: "boolean", description };
    case "select": {
      const options = (f.options ?? []).filter(Boolean);
      if (!options.length) return null;
      return f.allowOther
        ? { type: "string", description: `${description}. One of: ${options.join(", ")}; or exactly what was said if none fits` }
        : { type: "string", enum: options, description };
    }
    case "department":
      return {
        type: "string",
        description: `${description}. Only if a department or office was named: its code (${DEPARTMENTS.map((d) => `${d.code} = ${d.name}`).join("; ")}), or the office name said. Never work it out from a roll number`,
      };
    case "staff":
      return staff.length ? { type: "string", enum: staff.map((s) => s.name), description: `${description} (a security staff member)` } : null;
    default:
      return null;
  }
}

/** The request body parts for Gemini: system instructions, user text, JSON schema. */
export function buildFillRequest(spec: VoiceSpec, transcript: string, staff: StaffName[] = []) {
  const properties: Record<string, unknown> = {};
  // In / Out goes first: when it came last, the model sometimes answered with
  // only the direction and left every other field out
  if (spec.direction) {
    properties.startsWith = {
      type: "string",
      enum: ["IN", "OUT"],
      description: `Whether this record starts with "${spec.direction.in}" (IN, coming in) or "${spec.direction.out}" (OUT, going out). Only if said`,
    };
  }
  for (const f of spec.fields) {
    const s = fieldSchema(f, staff);
    if (s) properties[f.key] = s;
  }
  for (const g of spec.groups) {
    const itemProps: Record<string, unknown> = {};
    for (const f of g.fields) {
      const s = fieldSchema(f, staff);
      if (s) itemProps[f.key] = s;
    }
    if (Object.keys(itemProps).length) {
      properties[g.key] = {
        type: "array",
        description: `${g.label}: one item per ${g.itemLabel.toLowerCase()} mentioned`,
        items: { type: "object", properties: itemProps },
        ...(g.max ? { maxItems: g.max } : {}),
      };
    }
  }
  return {
    system: INSTRUCTIONS,
    user: `Form: ${spec.title}\nWhat the guard said:\n"""\n${transcript}\n"""`,
    schema: { type: "object", properties },
  };
}

/** Indian registration numbers written one way: "ts07ef8888" -> "TS 07 EF 8888" (anything else as said). */
function vehicleNumber(s: string): string {
  const m = /^([A-Z]{2})\s*-?\s*(\d{1,2})\s*-?\s*([A-Z]{0,3})\s*-?\s*(\d{1,4})$/.exec(s.toUpperCase());
  return m ? [m[1], m[2].padStart(2, "0"), m[3], m[4]].filter(Boolean).join(" ") : s.slice(0, 200);
}

/** One value from Gemini -> the form's string value, or null to leave the field blank. */
function cleanValue(f: FieldDef, raw: unknown, staff: StaffName[]): string | null {
  if (raw === null || raw === undefined) return null;
  switch (f.type) {
    case "text":
    case "person":
    case "textarea": {
      if (typeof raw !== "string" && typeof raw !== "number") return null;
      const s = String(raw).replace(/\s+/g, " ").trim();
      if (!s) return null;
      if (/vehicle/i.test(f.key)) return vehicleNumber(s);
      return s.slice(0, f.type === "textarea" ? 1000 : 200);
    }
    case "phone": {
      const digits = String(raw).replace(/\D/g, "");
      // Indian mobile numbers may be said with the country code
      const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
      return local.length >= 10 && local.length <= 15 ? local : null;
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.]/g, ""));
      return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? String(n) : null;
    }
    case "yesno":
      if (raw === true || raw === "true" || raw === "yes") return "yes";
      if (raw === false || raw === "false" || raw === "no") return "no";
      return null;
    case "select": {
      const s = String(raw).trim();
      if (!s) return null;
      const match = (f.options ?? []).find((o) => o.toLowerCase() === s.toLowerCase());
      if (match) return match;
      return f.allowOther ? s.slice(0, 60) : null;
    }
    case "department": {
      const s = String(raw).trim();
      if (!s) return null;
      return listedDepartmentCode(s) ?? s.slice(0, 100);
    }
    case "staff": {
      const s = String(raw).trim().toLowerCase();
      const hit = staff.find((x) => x.name.toLowerCase() === s);
      return hit ? hit.id : null;
    }
    default:
      return null;
  }
}

/** Gemini's JSON answer -> form values. Unknown keys and values that do not fit are dropped. */
export function cleanFill(spec: VoiceSpec, answer: unknown, staff: StaffName[] = []): VoiceFill {
  const obj = answer && typeof answer === "object" && !Array.isArray(answer) ? (answer as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = cleanValue(f, obj[f.key], staff);
    if (v !== null) fields[f.key] = v;
  }
  const groups: Record<string, Record<string, string>[]> = {};
  for (const g of spec.groups) {
    const list = Array.isArray(obj[g.key]) ? (obj[g.key] as unknown[]) : [];
    const rows: Record<string, string>[] = [];
    for (const item of list.slice(0, g.max ?? 100)) {
      if (!item || typeof item !== "object") continue;
      const row: Record<string, string> = {};
      for (const f of g.fields) {
        const v = cleanValue(f, (item as Record<string, unknown>)[f.key], staff);
        if (v !== null) row[f.key] = v;
      }
      if (Object.keys(row).length) rows.push(row);
    }
    if (rows.length) groups[g.key] = rows;
  }
  const dir = obj.startsWith;
  return {
    fields,
    groups,
    ...(spec.direction && (dir === "IN" || dir === "OUT") ? { direction: dir } : {}),
  };
}

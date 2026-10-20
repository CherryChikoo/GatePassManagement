/**
 * Registers created in the portal (CustomRegister rows) are turned into the
 * same EntryRegister shape as the built-in ones, so every screen, the
 * validation, search, history and admin edit work for them unchanged.
 *
 * Shared by the browser and the server: keep this file free of server imports.
 */
import type { EntryRegister, FieldDef, FieldType, GroupDef, RegisterKey } from "./definitions";

/** Field types the register builder offers (date and time are always automatic) */
export const BUILDER_FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "phone", label: "Phone number" },
  { value: "select", label: "Choice list" },
  { value: "department", label: "Department" },
  { value: "person", label: "Faculty / Staff (from list)" },
  { value: "yesno", label: "Yes / No" },
] as const;
export type BuilderFieldType = (typeof BUILDER_FIELD_TYPES)[number]["value"];

/**
 * Added from the builder's own sections (not the field-type list):
 * - "status": Yes / No buttons on the saved record, with its own button words
 *   in `options` ([yes, no]) — e.g. Payment completed: Paid / Not paid
 * - "remarks": a Remarks section on the saved record, added or changed later
 */
export const SECTION_FIELD_TYPES = ["status", "remarks"] as const;

export type CustomField = {
  key: string;
  label: string;
  /** "photo" is added by the builder's photo / signature switches (not a pickable type) */
  type: BuilderFieldType | "photo" | (typeof SECTION_FIELD_TYPES)[number];
  options?: string[];
  /** A signature: a photo of the named person, always required */
  signature?: boolean;
};

/** Field types allowed inside a list (one row per worker, item…) */
export const LIST_FIELD_TYPES = BUILDER_FIELD_TYPES.filter((t) => t.value !== "textarea" && t.value !== "person");

/** Builder-only types become a stored field type plus the "updatable" flag */
function fieldShape(type: string): Pick<FieldDef, "type" | "updatable"> {
  if (type === "status") return { type: "yesno", updatable: true };
  if (type === "remarks") return { type: "textarea", updatable: true };
  return { type: type as FieldType };
}

/**
 * A repeating list inside a register (like "Workers"): stored as one entry of
 * the register's fields with type "group".
 */
export type CustomList = {
  key: string;
  type: "group";
  label: string;
  itemLabel: string;
  /** Most rows per record (null: no limit) */
  max: number | null;
  /** Each row gets an In-time (now) and an Out-time (marked later) */
  timed: boolean;
  fields: CustomField[];
  required: string[];
};

/** Key of the first-version single "Signature (photo of the person)" field */
export const SIGNATURE_KEY = "signature";

/** Is this saved field a signature (photo of a named person)? */
export function isSignatureField(f: { key?: string; type?: string; signature?: boolean }): boolean {
  return f.type === "photo" && (f.signature === true || f.key === SIGNATURE_KEY);
}

export type CustomRegisterRow = {
  id: string;
  key: string;
  slug: string;
  title: string;
  description: string;
  fields: unknown;
  required: string[];
  hasInOut: boolean;
  active: boolean;
};

export const CUSTOM_KEY_PREFIX = "CUSTOM_";
export const CUSTOM_SLUG_PREFIX = "custom-";

export function isCustomRegisterKey(key: string): boolean {
  return key.startsWith(CUSTOM_KEY_PREFIX);
}

/** Field keys are generated from the label: "Driver Name" → "driver_name" (unique). */
export function fieldKeyFromLabel(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "field";
  // Never collide with the automatic fields
  const reserved = new Set(["date", "time", "time_in", "time_out", "direction", "photo", "signature"]);
  let key = reserved.has(base) ? `${base}_1` : base;
  let n = 2;
  while (taken.has(key) || reserved.has(key)) key = `${base}_${n++}`;
  taken.add(key);
  return key;
}

function parseFields(raw: unknown): CustomField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is CustomField => !!f && typeof f === "object" && typeof (f as any).key === "string" && typeof (f as any).label === "string")
    .filter((f) => (f as any).type !== "group")
    .map((f) => ({
      key: f.key,
      label: f.label,
      type: (f.type === "photo" || (SECTION_FIELD_TYPES as readonly string[]).includes(f.type) || BUILDER_FIELD_TYPES.some((t) => t.value === f.type)
        ? f.type
        : "text") as CustomField["type"],
      ...((f.type === "select" || f.type === "status") && Array.isArray(f.options) ? { options: f.options.filter((o) => typeof o === "string") } : {}),
      ...(f.signature === true ? { signature: true } : {}),
    }));
}

/** The register's lists (type "group" entries). */
export function parseLists(raw: unknown): CustomList[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g: any) => g && typeof g === "object" && g.type === "group" && typeof g.key === "string" && typeof g.label === "string")
    .map((g: any) => ({
      key: g.key,
      type: "group" as const,
      label: g.label,
      itemLabel: typeof g.itemLabel === "string" && g.itemLabel ? g.itemLabel : g.label,
      max: typeof g.max === "number" && g.max > 0 ? g.max : null,
      timed: g.timed === true,
      fields: parseFields(g.fields),
      required: Array.isArray(g.required) ? g.required.filter((k: unknown) => typeof k === "string") : [],
    }))
    .filter((g) => g.fields.length > 0);
}

function listToGroup(g: CustomList): GroupDef {
  return {
    key: g.key,
    label: g.label,
    itemLabel: g.itemLabel,
    max: g.max,
    required: g.required.filter((k) => g.fields.some((f) => f.key === k)),
    fields: [
      ...g.fields.map((f) => ({ key: f.key, label: f.label, type: f.type as FieldType, ...(f.options ? { options: f.options } : {}) })),
      // In now, out marked later from the record (like Workers in the labour books)
      ...(g.timed
        ? [
            { key: "inTime", label: "In-Time", type: "time" as FieldType },
            { key: "outTime", label: "Out-Time", type: "time" as FieldType, completion: true },
          ]
        : []),
    ],
  };
}

/** CustomRegister row → the standard register definition. */
export function customToDef(row: CustomRegisterRow, number = 100): EntryRegister {
  const userFields: FieldDef[] = parseFields(row.fields).map((f) => ({
    key: f.key,
    label: f.label,
    ...fieldShape(f.type),
    ...(f.options ? { options: f.options } : {}),
  }));

  const timeFields: FieldDef[] = row.hasInOut
    ? [
        { key: "time_out", label: "Time Out", type: "time" },
        { key: "time_in", label: "Time In", type: "time" },
      ]
    : [{ key: "time", label: "Time", type: "time" }];

  // Table columns: the first fields (a Yes / No status gets its own column already)
  const shown = userFields.filter((f) => f.type !== "photo" && !(f.updatable && f.type === "yesno")).slice(0, 3).map((f) => f.key);
  const groups = parseLists(row.fields).map(listToGroup);
  return {
    kind: "entry",
    key: row.key as RegisterKey,
    number,
    title: row.title,
    description: row.description,
    fields: [{ key: "date", label: "Date", type: "date" }, ...userFields, ...timeFields],
    required: row.required.filter((k) => userFields.some((f) => f.key === k)),
    ...(groups.length ? { groups } : {}),
    ...(row.hasInOut
      ? {
          movement: {
            in: { label: "In", timeKey: "time_in" },
            out: { label: "Out", timeKey: "time_out" },
            firstDirections: ["IN", "OUT"] as ("IN" | "OUT")[],
          },
        }
      : {}),
    listFields: row.hasInOut ? [...shown, "time_out", "time_in"] : [...shown, "time"],
  };
}

/** URL slug of any register key: "CAR_BOOK" → "car-book", "CUSTOM_7K2F9Q" → "custom-7k2f9q" */
export function slugForKey(key: string): string {
  return isCustomRegisterKey(key)
    ? CUSTOM_SLUG_PREFIX + key.slice(CUSTOM_KEY_PREFIX.length).toLowerCase()
    : key.toLowerCase().replace(/_/g, "-");
}

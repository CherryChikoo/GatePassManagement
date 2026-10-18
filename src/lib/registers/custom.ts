/**
 * Registers created in the portal (CustomRegister rows) are turned into the
 * same EntryRegister shape as the built-in ones, so every screen, the
 * validation, search, history and admin edit work for them unchanged.
 *
 * Shared by the browser and the server: keep this file free of server imports.
 */
import type { EntryRegister, FieldDef, FieldType, RegisterKey } from "./definitions";

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

export type CustomField = {
  key: string;
  label: string;
  /** "photo" is added by the builder's "Take a photo" switch (not a pickable type) */
  type: BuilderFieldType | "photo";
  options?: string[];
};

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
  const reserved = new Set(["date", "time", "time_in", "time_out", "direction", "photo"]);
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
    .map((f) => ({
      key: f.key,
      label: f.label,
      type: (f.type === "photo" || BUILDER_FIELD_TYPES.some((t) => t.value === f.type) ? f.type : "text") as CustomField["type"],
      ...(f.type === "select" && Array.isArray(f.options) ? { options: f.options.filter((o) => typeof o === "string") } : {}),
    }));
}

/** CustomRegister row → the standard register definition. */
export function customToDef(row: CustomRegisterRow, number = 100): EntryRegister {
  const userFields: FieldDef[] = parseFields(row.fields).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type as FieldType,
    ...(f.options ? { options: f.options } : {}),
  }));

  const timeFields: FieldDef[] = row.hasInOut
    ? [
        { key: "time_out", label: "Time Out", type: "time" },
        { key: "time_in", label: "Time In", type: "time" },
      ]
    : [{ key: "time", label: "Time", type: "time" }];

  const shown = userFields.filter((f) => f.type !== "photo").slice(0, 3).map((f) => f.key);
  return {
    kind: "entry",
    key: row.key as RegisterKey,
    number,
    title: row.title,
    description: row.description,
    fields: [{ key: "date", label: "Date", type: "date" }, ...userFields, ...timeFields],
    required: row.required.filter((k) => userFields.some((f) => f.key === k)),
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

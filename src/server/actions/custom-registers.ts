"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, type AuthUser } from "@/lib/auth/helpers";
import { REGISTERS } from "@/lib/registers/definitions";
import {
  BUILDER_FIELD_TYPES,
  CUSTOM_KEY_PREFIX,
  CUSTOM_SLUG_PREFIX,
  LIST_FIELD_TYPES,
  fieldKeyFromLabel,
  parseLists,
  type CustomField,
  type CustomList,
} from "@/lib/registers/custom";

/**
 * Registers created in the portal. The Main Admin and Security Supervisors design them;
 * Security fills them in; Admin and the Security Supervisor see them — like the
 * built-in registers.
 */

const fieldSchema = z.object({
  /** Kept for existing fields so their saved data stays attached */
  key: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  label: z.string().trim().min(1, "Every field needs a name").max(60, "Field names can be at most 60 characters"),
  type: z.enum(BUILDER_FIELD_TYPES.map((t) => t.value) as [string, ...string[]]),
  options: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  required: z.boolean().default(false),
});

/** A field inside a list (no long text / faculty picker in rows) */
const listFieldSchema = fieldSchema.extend({
  type: z.enum(LIST_FIELD_TYPES.map((t) => t.value) as [string, ...string[]]),
});

/** A repeating list, like "Workers" */
const listSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  label: z.string().trim().min(1, "Every list needs a name").max(60, "List names can be at most 60 characters"),
  itemLabel: z.string().trim().min(1, "Name one item of the list, e.g. Worker").max(40),
  max: z.number().int().min(1).max(500).nullable().default(null),
  timed: z.boolean().default(false),
  fields: z.array(listFieldSchema).min(1, "A list needs at least one field").max(10, "A list can have at most 10 fields"),
});

const registerSchema = z.object({
  title: z.string().trim().min(3, "Give the register a name (at least 3 characters)").max(80),
  description: z.string().trim().max(200).default(""),
  hasInOut: z.boolean().default(false),
  /** "Take a photo with each entry" (and whether it must be taken) */
  hasPhoto: z.boolean().default(false),
  photoRequired: z.boolean().default(false),
  /** Signatures: for each named person, Security takes a photo (always required) */
  signatures: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
        label: z.string().trim().min(1, "Give each signature a name, e.g. Contractor").max(60, "Signature names can be at most 60 characters"),
      })
    )
    .max(10, "A register can have at most 10 signatures")
    .default([]),
  /** Status buttons on the saved record, e.g. "Payment completed": Paid / Not paid */
  statuses: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
        label: z.string().trim().min(1, "Give each status a name, e.g. Payment completed").max(60, "Status names can be at most 60 characters"),
        yes: z.string().trim().min(1, "Name both buttons of each status").max(30, "Button words can be at most 30 characters"),
        no: z.string().trim().min(1, "Name both buttons of each status").max(30, "Button words can be at most 30 characters"),
      })
    )
    .max(5, "A register can have at most 5 statuses")
    .default([]),
  /** A Remarks section on the saved record, added or changed later */
  remarks: z.boolean().default(false),
  remarksKey: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  /** Repeating lists, like "Workers" */
  lists: z.array(listSchema).max(5, "A register can have at most 5 lists").default([]),
  fields: z.array(fieldSchema).min(1, "Add at least one field").max(25, "A register can have at most 25 fields"),
});

export type CustomRegisterInput = z.input<typeof registerSchema>;

/** Main Admin or a Security Supervisor (Head Security fills registers in, but doesn't design them) */
async function requireBuilder(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "SECURITY_SUPERVISOR")) {
    throw new Error("Only the Main Admin or a Security Supervisor can create or change registers.");
  }
  return user;
}

function revalidateRegisterPages() {
  revalidatePath("/security");
  revalidatePath("/admin/registers");
  revalidatePath("/supervisor/registers");
}

/** Validates the form design and builds the stored fields (stable keys). */
function buildFields(input: z.output<typeof registerSchema>, existingKeys: string[] = [], existingLists: CustomList[] = []) {
  const labels = new Set<string>();
  for (const f of input.fields) {
    const l = f.label.toLowerCase();
    if (labels.has(l)) return { error: `Two fields are named "${f.label}". Give each field a different name.` };
    labels.add(l);
    if (f.type === "select") {
      const opts = (f.options ?? []).filter(Boolean);
      if (opts.length < 2) return { error: `"${f.label}" is a choice list: add at least 2 choices.` };
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return { error: `"${f.label}" has the same choice twice.` };
    }
  }
  const taken = new Set<string>(existingKeys);
  const fields: CustomField[] = [];
  const required: string[] = [];
  for (const f of input.fields) {
    // Keep a known key (existing field); otherwise make one from the label
    const key = f.key && existingKeys.includes(f.key) ? f.key : fieldKeyFromLabel(f.label, taken);
    taken.add(key);
    fields.push({
      key,
      label: f.label,
      type: f.type as CustomField["type"],
      ...(f.type === "select" ? { options: (f.options ?? []).filter(Boolean) } : {}),
    });
    if (f.required) required.push(key);
  }
  // Photo: a fixed field at the end of the form
  if (input.hasPhoto) {
    fields.push({ key: "photo", label: "Photo", type: "photo" });
    if (input.photoRequired) required.push("photo");
  }
  // Signatures: one required photo per named person ("Contractor", "Supervisor"…)
  for (const sg of input.signatures) {
    const name = sg.label.toLowerCase();
    if (labels.has(name)) return { error: `"${sg.label}" is used twice. Give each field and signature a different name.` };
    labels.add(name);
    const key = sg.key && existingKeys.includes(sg.key) ? sg.key : fieldKeyFromLabel(`${sg.label} signature`, taken);
    taken.add(key);
    fields.push({ key, label: `${sg.label} — signature photo`, type: "photo", signature: true });
    required.push(key);
  }
  // Status buttons: Yes / No in the register's own words, changed later from the record
  for (const st of input.statuses) {
    const name = st.label.toLowerCase();
    if (labels.has(name)) return { error: `"${st.label}" is used twice. Give each field and status a different name.` };
    labels.add(name);
    if (st.yes.toLowerCase() === st.no.toLowerCase()) return { error: `"${st.label}": give the two buttons different words.` };
    const key = st.key && existingKeys.includes(st.key) ? st.key : fieldKeyFromLabel(st.label, taken);
    taken.add(key);
    fields.push({ key, label: st.label, type: "status", options: [st.yes, st.no] });
  }
  // Remarks section: written or changed later from the record
  if (input.remarks) {
    if (labels.has("remarks")) return { error: `A field is already named "Remarks". Remove it, or turn off the Remarks section.` };
    labels.add("remarks");
    const key = input.remarksKey && existingKeys.includes(input.remarksKey) ? input.remarksKey : fieldKeyFromLabel("Remarks", taken);
    taken.add(key);
    fields.push({ key, label: "Remarks", type: "remarks" });
  }

  // Lists: each one is stored as a "group" entry with its own field keys
  const lists: CustomList[] = [];
  const listNames = new Set<string>();
  for (const l of input.lists) {
    const name = l.label.toLowerCase();
    if (listNames.has(name) || labels.has(name)) return { error: `"${l.label}" is used twice. Give each list and field a different name.` };
    listNames.add(name);
    const inner = new Set<string>();
    for (const lf of l.fields) {
      const ln = lf.label.toLowerCase();
      if (inner.has(ln)) return { error: `The list "${l.label}" has two fields named "${lf.label}".` };
      inner.add(ln);
      if (lf.type === "select") {
        const opts = (lf.options ?? []).filter(Boolean);
        if (opts.length < 2) return { error: `"${lf.label}" in "${l.label}" is a choice list: add at least 2 choices.` };
      }
    }
    const old = existingLists.find((x) => x.key === l.key);
    const key = l.key && old ? l.key : fieldKeyFromLabel(l.label, taken);
    taken.add(key);
    const innerTaken = new Set<string>(["inTime", "outTime"]);
    const listFields: CustomField[] = [];
    const listRequired: string[] = [];
    for (const lf of l.fields) {
      const oldKeys = old?.fields.map((x) => x.key) ?? [];
      const fk = lf.key && oldKeys.includes(lf.key) ? lf.key : fieldKeyFromLabel(lf.label, innerTaken);
      innerTaken.add(fk);
      listFields.push({
        key: fk,
        label: lf.label,
        type: lf.type as CustomField["type"],
        ...(lf.type === "select" ? { options: (lf.options ?? []).filter(Boolean) } : {}),
      });
      if (lf.required) listRequired.push(fk);
    }
    lists.push({ key, type: "group", label: l.label, itemLabel: l.itemLabel, max: l.max ?? null, timed: l.timed, fields: listFields, required: listRequired });
  }
  return { fields: [...fields, ...lists] as unknown as CustomField[], required };
}

async function titleTaken(title: string, exceptId?: string): Promise<boolean> {
  const t = title.trim().toLowerCase();
  if (REGISTERS.some((r) => r.title.toLowerCase() === t)) return true;
  const other = await prisma.customRegister.findFirst({
    where: { title: { equals: title.trim(), mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!other;
}

export async function createCustomRegister(raw: CustomRegisterInput) {
  let user: AuthUser;
  try {
    user = await requireBuilder();
  } catch (err: any) {
    return { error: err?.message || "Not allowed" };
  }
  const parsed = registerSchema.safeParse(raw ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const built = buildFields(parsed.data);
  if ("error" in built) return { error: built.error };
  if (await titleTaken(parsed.data.title)) return { error: "A register with this name already exists." };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    try {
      const row = await prisma.customRegister.create({
        data: {
          key: CUSTOM_KEY_PREFIX + code,
          slug: CUSTOM_SLUG_PREFIX + code.toLowerCase(),
          title: parsed.data.title,
          description: parsed.data.description,
          hasInOut: parsed.data.hasInOut,
          fields: built.fields,
          required: built.required,
          createdById: user.profileId,
          createdByName: user.name,
        },
        select: { id: true, slug: true },
      });
      revalidateRegisterPages();
      return { success: true, id: row.id, slug: row.slug };
    } catch (err: any) {
      if (err?.code !== "P2002") {
        console.error("[createCustomRegister] failed:", err?.message);
        return { error: "Could not create the register. Please try again." };
      }
      // key/slug collision: try another code
    }
  }
  return { error: "Could not create the register. Please try again." };
}

export async function updateCustomRegister(id: string, raw: CustomRegisterInput) {
  try {
    await requireBuilder();
  } catch (err: any) {
    return { error: err?.message || "Not allowed" };
  }
  if (typeof id !== "string" || !id) return { error: "Register not found" };
  const existing = await prisma.customRegister.findUnique({ where: { id }, select: { id: true, key: true, fields: true, hasInOut: true } });
  if (!existing) return { error: "Register not found" };

  const parsed = registerSchema.safeParse(raw ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const existingKeys = Array.isArray(existing.fields) ? (existing.fields as any[]).map((f) => String(f?.key ?? "")).filter(Boolean) : [];
  const built = buildFields(parsed.data, existingKeys, parseLists(existing.fields));
  if ("error" in built) return { error: built.error };
  if (await titleTaken(parsed.data.title, id)) return { error: "A register with this name already exists." };

  // Switching In & Out on or off would change what existing records mean
  if (parsed.data.hasInOut !== existing.hasInOut) {
    const used = await prisma.registerEntry.count({ where: { register: existing.key } });
    if (used > 0) return { error: "In & Out can't be switched after entries have been saved. Create a new register instead." };
  }

  await prisma.customRegister.update({
    where: { id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      hasInOut: parsed.data.hasInOut,
      fields: built.fields,
      required: built.required,
    },
  });
  revalidateRegisterPages();
  return { success: true };
}

/** Disable (hide everywhere, records kept) or enable again. */
export async function setCustomRegisterActive(id: string, active: boolean) {
  try {
    await requireBuilder();
  } catch (err: any) {
    return { error: err?.message || "Not allowed" };
  }
  if (typeof id !== "string" || !id || typeof active !== "boolean") return { error: "Register not found" };
  await prisma.customRegister.update({ where: { id }, data: { active } }).catch(() => null);
  revalidateRegisterPages();
  return { success: true };
}

/** Delete only while it has no entries (saved records are never thrown away). */
export async function deleteCustomRegister(id: string) {
  try {
    await requireBuilder();
  } catch (err: any) {
    return { error: err?.message || "Not allowed" };
  }
  if (typeof id !== "string" || !id) return { error: "Register not found" };
  const row = await prisma.customRegister.findUnique({ where: { id }, select: { key: true } });
  if (!row) return { error: "Register not found" };
  const used = await prisma.registerEntry.count({ where: { register: row.key } });
  if (used > 0) return { error: "This register already has entries. Disable it instead — its records are kept." };
  await prisma.customRegister.delete({ where: { id } });
  revalidateRegisterPages();
  return { success: true };
}

/** All portal-created registers (incl. disabled) with their entry counts, for the builder. */
export async function listCustomRegisters() {
  await requireBuilder().catch(() => {
    throw new Error("Only the Main Admin or a Security Supervisor can manage registers.");
  });
  const rows = await prisma.customRegister.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, key: true, slug: true, title: true, description: true, fields: true, required: true,
      hasInOut: true, active: true, createdByName: true, createdAt: true,
    },
  });
  const counts = await prisma.registerEntry.groupBy({
    by: ["register"],
    where: { register: { in: rows.map((r) => r.key) }, kind: "ORIGINAL" },
    _count: { _all: true },
  });
  const byKey = new Map(counts.map((c) => [c.register, c._count._all]));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), entries: byKey.get(r.key) ?? 0 }));
}

/** Can the signed-in user design registers? (for showing the button) */
export async function canBuildRegisters(): Promise<boolean> {
  try {
    await requireBuilder();
    return true;
  } catch {
    return false;
  }
}

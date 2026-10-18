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
  fieldKeyFromLabel,
  type CustomField,
} from "@/lib/registers/custom";

/**
 * Registers created in the portal. Main Admin and Head Security design them;
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

const registerSchema = z.object({
  title: z.string().trim().min(3, "Give the register a name (at least 3 characters)").max(80),
  description: z.string().trim().max(200).default(""),
  hasInOut: z.boolean().default(false),
  /** "Take a photo with each entry" (and whether it must be taken) */
  hasPhoto: z.boolean().default(false),
  photoRequired: z.boolean().default(false),
  fields: z.array(fieldSchema).min(1, "Add at least one field").max(25, "A register can have at most 25 fields"),
});

export type CustomRegisterInput = z.input<typeof registerSchema>;

/** Main Admin, or a security account marked Head Security */
async function requireBuilder(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "SECURITY")) {
    throw new Error("Only the Main Admin or Head Security can create or change registers.");
  }
  if (user.role === "SECURITY") {
    const staff = await prisma.securityStaff.findUnique({ where: { profileId: user.profileId }, select: { isHead: true } });
    if (!staff?.isHead) throw new Error("Only the Main Admin or Head Security can create or change registers.");
  }
  return user;
}

function revalidateRegisterPages() {
  revalidatePath("/security");
  revalidatePath("/admin/registers");
  revalidatePath("/supervisor/registers");
}

/** Validates the form design and builds the stored fields (stable keys). */
function buildFields(input: z.output<typeof registerSchema>, existingKeys: string[] = []) {
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
  return { fields, required };
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
  const built = buildFields(parsed.data, existingKeys);
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
    throw new Error("Only the Main Admin or Head Security can manage registers.");
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

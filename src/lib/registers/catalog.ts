/**
 * Server-side list of every register: the built-in ones (definitions.ts) plus
 * the ones created in the portal (custom_registers). Read fresh on each
 * request (not kept in memory: another server instance would not see a new
 * register), so a new register shows up for every role straight away.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { REGISTERS, REGISTER_BY_KEY, isEntryRegister, registerFromSlug, type EntryRegister, type RegisterDef } from "./definitions";
import { CUSTOM_SLUG_PREFIX, customToDef, isCustomRegisterKey } from "./custom";

export { slugForKey } from "./custom";

type Db = PrismaClient | Prisma.TransactionClient;

const customSelect = {
  id: true, key: true, slug: true, title: true, description: true, fields: true, required: true, hasInOut: true, active: true,
} as const;

/** Built-in registers, then active custom registers (oldest first). */
export async function listAllRegisters(): Promise<RegisterDef[]> {
  const custom = await prisma.customRegister.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: customSelect,
  });
  return [...REGISTERS, ...custom.map((row, i) => customToDef(row, 100 + i))];
}

/** Entry register by key (built-in or an active custom one). */
export async function getEntryRegister(key: unknown, db: Db = prisma): Promise<EntryRegister | null> {
  if (typeof key !== "string" || !key) return null;
  if (!isCustomRegisterKey(key)) {
    const def = (REGISTER_BY_KEY as Record<string, RegisterDef>)[key];
    return def && isEntryRegister(def) ? def : null;
  }
  const row = await db.customRegister.findUnique({ where: { key }, select: customSelect });
  return row && row.active ? customToDef(row) : null;
}

/** Register by its URL slug (built-in or an active custom one). */
export async function getRegisterBySlug(slug: string): Promise<RegisterDef | null> {
  if (!slug.startsWith(CUSTOM_SLUG_PREFIX)) return registerFromSlug(slug);
  const row = await prisma.customRegister.findUnique({ where: { slug }, select: customSelect });
  return row && row.active ? customToDef(row) : null;
}


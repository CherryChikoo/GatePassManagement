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
// Registers made in the portal change rarely: kept for a minute, so opening the
// Security home / registers list needs no database wait (cleared when the Admin changes one)
let customCache: { at: number; rows: Promise<RegisterDef[]> } | null = null;
const CUSTOM_TTL_MS = 60_000;

/** The Admin added / changed / removed a register: the next list is read fresh. */
export function forgetCustomRegisters() {
  customCache = null;
}

export async function listAllRegisters(): Promise<RegisterDef[]> {
  if (!customCache || Date.now() - customCache.at > CUSTOM_TTL_MS) {
    const rows = prisma.customRegister
      .findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: customSelect })
      .then((custom) => custom.map((row, i) => customToDef(row, 100 + i)));
    customCache = { at: Date.now(), rows };
    // A failed read is not kept
    rows.catch(() => {
      if (customCache?.rows === rows) customCache = null;
    });
  }
  return [...REGISTERS, ...(await customCache.rows)];
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


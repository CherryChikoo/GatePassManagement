"use server";

/**
 * Offices visitors come to (Accounts, Exam cell…), kept by Main Admin. Each
 * has a printed QR poster (<site>/o/<posterKey>): a visitor scans it with their
 * phone to record the visit and unlock their Exit QR (src/lib/visits/requests.ts).
 * Offices have no logins.
 */
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/helpers";

export type OfficeRow = { id: string; name: string; posterKey: string; active: boolean; createdAt: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const SELECT = { id: true, name: true, posterKey: true, active: true, createdAt: true } as const;

/** 18 random bytes -> 24 characters (base64url), printed in the poster's QR */
const newPosterKey = () => randomBytes(18).toString("base64url");

const toRow = (o: { id: string; name: string; posterKey: string; active: boolean; createdAt: Date }): OfficeRow => ({
  ...o,
  createdAt: o.createdAt.toISOString(),
});

function cleanName(name: unknown): { name: string } | { error: string } {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (n.length < 2) return { error: "Enter the office name" };
  if (n.length > 60) return { error: "Office name: at most 60 characters" };
  return { name: n };
}

async function nameTaken(name: string, exceptId?: string) {
  const o = await prisma.office.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  return !!o;
}

function afterOfficeChange() {
  revalidatePath("/admin/offices");
}

/** Every office, active first, A-Z. */
export async function listOffices(): Promise<OfficeRow[]> {
  await requireRole("ADMIN");
  const rows = await prisma.office.findMany({ select: SELECT, orderBy: [{ active: "desc" }, { name: "asc" }], take: 500 });
  return rows.map(toRow);
}

export async function createOffice(name: string): Promise<{ success: true; office: OfficeRow } | { error: string }> {
  await requireRole("ADMIN");
  const n = cleanName(name);
  if ("error" in n) return n;
  if (await nameTaken(n.name)) return { error: "An office with this name already exists" };
  const office = await prisma.office.create({ data: { name: n.name, posterKey: newPosterKey() }, select: SELECT });
  afterOfficeChange();
  return { success: true, office: toRow(office) };
}

export async function renameOffice(id: string, name: string): Promise<{ success: true } | { error: string }> {
  await requireRole("ADMIN");
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Office not found" };
  const n = cleanName(name);
  if ("error" in n) return n;
  if (await nameTaken(n.name, id)) return { error: "An office with this name already exists" };
  const res = await prisma.office.updateMany({ where: { id }, data: { name: n.name } });
  if (res.count !== 1) return { error: "Office not found" };
  afterOfficeChange();
  return { success: true };
}

/** A switched-off office is hidden from the visitor's form and its poster stops working. */
export async function setOfficeActive(id: string, active: boolean): Promise<{ success: true } | { error: string }> {
  await requireRole("ADMIN");
  if (typeof id !== "string" || !UUID_RE.test(id) || typeof active !== "boolean") return { error: "Office not found" };
  const res = await prisma.office.updateMany({ where: { id }, data: { active } });
  if (res.count !== 1) return { error: "Office not found" };
  afterOfficeChange();
  return { success: true };
}

/** New poster QR (e.g. a poster was copied or misused): the old poster stops working. */
export async function newOfficePoster(id: string): Promise<{ success: true; posterKey: string } | { error: string }> {
  await requireRole("ADMIN");
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Office not found" };
  const posterKey = newPosterKey();
  const res = await prisma.office.updateMany({ where: { id }, data: { posterKey } });
  if (res.count !== 1) return { error: "Office not found" };
  afterOfficeChange();
  return { success: true, posterKey };
}

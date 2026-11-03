/**
 * Siros Venture labour: who is inside right now — the coolies (by number) and
 * contractors (by name) on entries of today or yesterday not yet marked Out.
 * They can't be put on another entry until that one is marked Out.
 */
import { prisma } from "@/lib/db/prisma";
import { istDateString, istDateToInstant } from "@/lib/time/ist";

const BOOK = "SIROS_DAILY_LABOUR";

export async function sirosInside(): Promise<{ coolies: string[]; contractors: string[] }> {
  const since = new Date(istDateToInstant(istDateString()).getTime() - 86_400_000);
  const rows = await prisma.registerEntry.findMany({
    where: { register: BOOK, kind: "ORIGINAL", entryDate: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { data: true, supplements: { select: { data: true } } },
  });
  const coolies = new Set<string>();
  const contractors = new Set<string>();
  for (const r of rows) {
    // Marked Out (or closed): everyone on it has left
    const out = r.supplements.some((s) => {
      const d = (s.data ?? {}) as Record<string, unknown>;
      return !!d.contractorOut || d.oneWay === true;
    });
    if (out) continue;
    const d = (r.data ?? {}) as { contractorName?: unknown; workers?: unknown };
    if (typeof d.contractorName === "string" && d.contractorName.trim()) contractors.add(d.contractorName.trim().toLowerCase());
    for (const w of Array.isArray(d.workers) ? (d.workers as Record<string, unknown>[]) : []) {
      if (w?.no !== undefined && w.no !== null && String(w.no).trim()) coolies.add(String(w.no).trim());
    }
  }
  return { coolies: [...coolies], contractors: [...contractors] };
}

/** A new entry with someone already inside: the message to show, else null. */
export async function sirosAlreadyInside(
  data: Record<string, unknown>,
  /** Already started (read in parallel with the other checks) */
  insideNow?: Promise<{ coolies: string[]; contractors: string[] }>
): Promise<string | null> {
  const inside = await (insideNow ?? sirosInside());
  const name = typeof data.contractorName === "string" ? data.contractorName.trim() : "";
  if (name && inside.contractors.includes(name.toLowerCase())) {
    return `${name} is already inside on another entry. Mark that entry Out first.`;
  }
  for (const w of Array.isArray(data.workers) ? (data.workers as Record<string, unknown>[]) : []) {
    const no = w?.no !== undefined && w.no !== null ? String(w.no).trim() : "";
    if (no && inside.coolies.includes(no)) {
      return `Coolie ${no} (${String(w.name ?? "")}) is already inside on another entry. Mark that entry Out first.`;
    }
  }
  return null;
}

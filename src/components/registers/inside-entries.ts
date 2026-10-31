/**
 * "Inside now" for an entry register with In / Out (the Admission Book):
 * records from today and yesterday whose Out is not recorded yet (someone let
 * in late in the evening must not vanish at midnight). Built from the same list
 * pages the register shows (browser cache, entry-list-cache.ts), so opening it
 * right after the register usually sends no request.
 */
import { pendingActions, type EntryRegister } from "@/lib/registers/definitions";
import { istDateString } from "@/lib/time/ist";
import { fetchEntryList } from "./entry-list-cache";

/** At most this many pages of today's records are read (25 each) */
const MAX_PAGES = 8;
/** Yesterday: only its latest records can still be inside */
const YESTERDAY_PAGES = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Came in and Out is still to be recorded */
export function isStillInside(def: EntryRegister, current: Record<string, unknown>) {
  return pendingActions(def, current).next?.direction === "OUT";
}

export type InsideEntries = {
  entries: any[];
  canOverrideVisit: boolean;
  /** Today had more records than were read (very busy day): the list may miss the earliest ones */
  partial: boolean;
};

/** One day's pages (up to maxPages) */
async function readDay(def: EntryRegister, date: string, maxPages: number, useCache: boolean) {
  const base = { register: def.key, date, q: "", shift: "" };
  const first = await fetchEntryList({ ...base, page: 1 }, useCache);
  const pages = Math.min(Math.ceil(first.total / Math.max(1, first.pageSize)), maxPages);
  const rest =
    pages > 1
      ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchEntryList({ ...base, page: i + 2 }, useCache)))
      : [];
  return { lists: [first, ...rest], first, partial: first.total > pages * first.pageSize };
}

/** useCache: a cached page that is still good is used without a request (see fetchEntryList). */
export async function fetchInsideEntries(def: EntryRegister, useCache: boolean): Promise<InsideEntries> {
  const now = new Date();
  const [today, yesterday] = await Promise.all([
    readDay(def, istDateString(now), MAX_PAGES, useCache),
    readDay(def, istDateString(new Date(now.getTime() - DAY_MS)), YESTERDAY_PAGES, useCache),
  ]);
  // A record saved between two pages can show on both: once only
  const seen = new Set<string>();
  const entries = [...today.lists, ...yesterday.lists]
    .flatMap((r) => r.entries)
    .filter((e) => !seen.has(e.id) && (seen.add(e.id), isStillInside(def, e.current)));
  return { entries, canOverrideVisit: !!today.first.canOverrideVisit, partial: today.partial };
}

/**
 * Browser-side cache for register lists (memory only, gone on reload/logout).
 *
 * - A list seen before is shown at once, then refreshed in the background.
 * - Tapping a register on the list starts its fetch while the page opens.
 * - The same request running twice is shared, not sent twice.
 *
 * Lists come from GET /api/registers/entries (parallel), not the server
 * action (queued behind other actions).
 */
import { istDateString } from "@/lib/time/ist";

export type EntryListParams = { register: string; date: string; q: string; page: number; shift: string };
export type EntryListData = { entries: any[]; total: number; pageSize: number };

/** stale: the register changed since (live update) — shown, but always fetched again */
type Hit = { data: EntryListData; at: number; stale?: boolean };

const MAX_KEYS = 40;
/** Older lists are not shown at all (a fresh load is waited for instead) */
const MAX_SHOW_AGE_MS = 10 * 60_000;

const cache = new Map<string, Hit>();
const inFlight = new Map<string, Promise<EntryListData>>();

const keyOf = (p: EntryListParams) => [p.register, p.date, p.q, p.page, p.shift].join("|");

/** Cached list for these filters, if recent enough to show while refreshing. */
export function peekEntryList(p: EntryListParams): EntryListData | null {
  const hit = cache.get(keyOf(p));
  return hit && Date.now() - hit.at < MAX_SHOW_AGE_MS ? hit.data : null;
}

/** Loads the list; a cached copy younger than `maxAgeMs` is returned without a request. */
export function fetchEntryList(p: EntryListParams, maxAgeMs = 0): Promise<EntryListData> {
  const key = keyOf(p);
  const hit = cache.get(key);
  if (hit && !hit.stale && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.data);
  const running = inFlight.get(key);
  if (running) return running;

  const qs = new URLSearchParams({ register: p.register, date: p.date, q: p.q, page: String(p.page), shift: p.shift });
  const req = fetch(`/api/registers/entries?${qs}`, { credentials: "include", cache: "no-store" })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.error) throw new Error(body?.error || "Could not load the register.");
      const data: EntryListData = { entries: body.entries, total: body.total, pageSize: body.pageSize };
      if (cache.size >= MAX_KEYS) cache.delete(cache.keys().next().value!);
      cache.set(key, { data, at: Date.now() });
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, req);
  return req;
}

/** Start loading a register's default view (today, first page) before it opens. */
export function prefetchEntryList(register: string) {
  fetchEntryList({ register, date: istDateString(), q: "", page: 1, shift: "" }, 20_000).catch(() => {});
}

/**
 * Live update: these registers changed elsewhere ("*" = maybe all). Their
 * cached lists still show at once when opened, then the fresh copy follows.
 */
export function markEntryListsStale(registers: string[] | "*") {
  for (const [key, hit] of cache) {
    if (registers === "*" || registers.some((r) => key.startsWith(`${r}|`))) hit.stale = true;
  }
}

/** Forget a register's cached lists after it changed (save, edit, delete…). */
export function invalidateEntryLists(register: string) {
  for (const key of cache.keys()) if (key.startsWith(`${register}|`)) cache.delete(key);
}

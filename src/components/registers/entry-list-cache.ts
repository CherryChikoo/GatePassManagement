/**
 * Browser-side cache for register lists (memory only, gone on reload/logout).
 *
 * - A list seen before is shown at once, then refreshed in the background.
 * - Tapping a register on the list starts its fetch while the page opens.
 * - The same request running twice is shared, not sent twice.
 *
 * - While live updates are on, a list is not fetched again until the server
 *   says its register changed, so reopening a register sends no request.
 *
 * Lists come from GET /api/registers/entries (parallel), not the server
 * action (queued behind other actions).
 */
import { istDateString } from "@/lib/time/ist";
import { liveSince, onGatePing } from "@/lib/realtime/live";

export type EntryListParams = { register: string; date: string; q: string; page: number; shift: string };
export type EntryListData = { entries: any[]; total: number; pageSize: number; canOverrideVisit?: boolean };

/** at: when its request started (a change reported after that makes it stale) */
type Hit = { data: EntryListData; at: number };

const MAX_KEYS = 40;
/** Older lists are not shown at all (a fresh load is waited for instead) */
const MAX_SHOW_AGE_MS = 10 * 60_000;
/** Loaded while live updates were on: trusted this long unless the register changes */
const MAX_TRUSTED_AGE_MS = 5 * 60_000;
/** Without live updates: fetched again when older than this */
const MAX_UNTRUSTED_AGE_MS = 15_000;
const REQUEST_TIMEOUT_MS = 15_000;

const cache = new Map<string, Hit>();
const inFlight = new Map<string, Promise<EntryListData>>();
/** When each register (or "*": any) was last reported changed */
const changedAt = new Map<string, number>();

const keyOf = (p: EntryListParams) => [p.register, p.date, p.q, p.page, p.shift].join("|");
const registerOf = (key: string) => key.slice(0, key.indexOf("|"));

/** Still good without a request: no change reported since, and young enough. */
function isFresh(key: string, hit: Hit): boolean {
  const changed = Math.max(changedAt.get(registerOf(key)) ?? 0, changedAt.get("*") ?? 0);
  if (changed >= hit.at) return false;
  const since = liveSince();
  const age = Date.now() - hit.at;
  return since !== null && hit.at >= since ? age < MAX_TRUSTED_AGE_MS : age < MAX_UNTRUSTED_AGE_MS;
}

/** Cached list for these filters, if recent enough to show while refreshing. */
export function peekEntryList(p: EntryListParams): EntryListData | null {
  const hit = cache.get(keyOf(p));
  return hit && Date.now() - hit.at < MAX_SHOW_AGE_MS ? hit.data : null;
}

/**
 * Loads the list. useCache: a cached copy that is still good (see isFresh)
 * is returned without a request; false always asks the server.
 */
export function fetchEntryList(p: EntryListParams, useCache = false): Promise<EntryListData> {
  const key = keyOf(p);
  const hit = cache.get(key);
  if (useCache && hit && isFresh(key, hit)) return Promise.resolve(hit.data);
  const running = inFlight.get(key);
  if (running) return running;

  const qs = new URLSearchParams({ register: p.register, date: p.date, q: p.q, page: String(p.page), shift: p.shift });
  const startedAt = Date.now();
  // Really cancelled after the time limit, so "Try again" sends a new request
  const req = fetch(`/api/registers/entries?${qs}`, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .catch((err) => {
      throw new Error(
        err?.name === "TimeoutError" || err?.name === "AbortError"
          ? "Taking too long. Check the connection and try again."
          : "No internet connection. Check the network and try again."
      );
    })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.error) throw new Error(body?.error || "Could not load the register.");
      const data: EntryListData = { entries: body.entries, total: body.total, pageSize: body.pageSize, canOverrideVisit: !!body.canOverrideVisit };
      if (cache.size >= MAX_KEYS && !cache.has(key)) cache.delete(cache.keys().next().value!);
      cache.set(key, { data, at: startedAt });
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, req);
  return req;
}

/** Start loading a register's default view (today, first page) before it opens. */
export function prefetchEntryList(register: string) {
  fetchEntryList({ register, date: istDateString(), q: "", page: 1, shift: "" }, true).catch(() => {});
}

/**
 * Live update: these registers changed elsewhere ("*" = maybe all). Their
 * cached lists still show at once when opened, then the fresh copy follows.
 */
export function markEntryListsStale(registers: string[] | "*") {
  const now = Date.now();
  for (const r of registers === "*" ? ["*"] : registers) changedAt.set(r, now);
}

/** Forget a register's cached lists after it changed (save, edit, delete…). */
export function invalidateEntryLists(register: string) {
  for (const key of cache.keys()) if (key.startsWith(`${register}|`)) cache.delete(key);
}

// Every register change on the gate channel, whichever screen is open
onGatePing((changed) => {
  if (changed.includes("*")) return markEntryListsStale("*");
  const regs = changed.filter((c) => c.startsWith("reg:")).map((c) => c.slice(4));
  if (regs.length) markEntryListsStale(regs);
});

/**
 * "Inside now" for an entry register with In / Out (the Admission Book): one
 * page (20, newest first) of today's and yesterday's records whose Out is not
 * recorded yet, and how many there are in all. The server picks the records
 * (listInsideRegisterEntries); only the page shown is sent.
 *
 * Pages are kept in the browser (memory only), like the register lists
 * (entry-list-cache.ts): the hub's "Inside now (n)" and the Inside now screen
 * share page 1, so opening the screen after the buttons sends no request. A
 * kept page is asked for again only when the register changed (live ping), or
 * when it is old.
 */
import type { EntryRegister } from "@/lib/registers/definitions";
import { callGate } from "@/lib/gate-call";
import { liveSince, onGatePing } from "@/lib/realtime/live";

export type InsideEntries = {
  entries: any[];
  /** Records still inside, on every page */
  total: number;
  /** The page returned (the last one when the page asked for is now past the end) */
  page: number;
  pageSize: number;
  canOverrideVisit: boolean;
};

type Hit = { data: InsideEntries; at: number };

/** Loaded while live updates were on: trusted this long unless the register changes */
const MAX_TRUSTED_AGE_MS = 60_000;
/** Without live updates: asked for again when older than this */
const MAX_UNTRUSTED_AGE_MS = 15_000;
const MAX_KEYS = 20;

const cache = new Map<string, Hit>();
const inFlight = new Map<string, Promise<InsideEntries>>();
/** When each register (or "*": any) was last reported changed */
const changedAt = new Map<string, number>();

const keyOf = (register: string, page: number) => `${register}|${page}`;

function isFresh(register: string, hit: Hit) {
  const changed = Math.max(changedAt.get(register) ?? 0, changedAt.get("*") ?? 0);
  if (changed >= hit.at) return false;
  const since = liveSince();
  const age = Date.now() - hit.at;
  return since !== null && hit.at >= since ? age < MAX_TRUSTED_AGE_MS : age < MAX_UNTRUSTED_AGE_MS;
}

function keep(key: string, data: InsideEntries, at: number) {
  if (cache.size >= MAX_KEYS && !cache.has(key)) cache.delete(cache.keys().next().value!);
  cache.set(key, { data, at });
}

/**
 * One page of the register's Inside now list. useCache: a kept page that is
 * still good is returned without a request; false always asks the server.
 */
export function fetchInsideEntries(def: EntryRegister, useCache: boolean, page = 1): Promise<InsideEntries> {
  const key = keyOf(def.key, page);
  const hit = cache.get(key);
  if (useCache && hit && isFresh(def.key, hit)) return Promise.resolve(hit.data);
  const running = inFlight.get(key);
  if (running) return running;

  const startedAt = Date.now();
  const req = callGate("listInsideRegisterEntries", [{ register: def.key, page }], 15_000)
    .then((res) => {
      if (!res || "error" in res) throw new Error((res && res.error) || "Could not load the register.");
      const data: InsideEntries = {
        entries: res.entries,
        total: res.total,
        page: res.page,
        pageSize: res.pageSize,
        canOverrideVisit: !!res.canOverrideVisit,
      };
      keep(key, data, startedAt);
      // Asked past the end: the page returned is kept under its own number too
      if (res.page !== page) keep(keyOf(def.key, res.page), data, startedAt);
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, req);
  return req;
}

/** A kept page to show at once while the fresh one loads (up to 30 minutes old). */
export function peekInsideEntries(register: string, page = 1): InsideEntries | null {
  const hit = cache.get(keyOf(register, page));
  return hit && Date.now() - hit.at < 30 * 60_000 ? hit.data : null;
}

/** Forget a register's kept pages (it was just changed on this phone). */
export function invalidateInsideEntries(register: string) {
  for (const key of [...cache.keys()]) if (key.startsWith(`${register}|`)) cache.delete(key);
}

// Every register change on the gate channel, whichever screen is open
onGatePing((changed) => {
  const now = Date.now();
  if (changed.includes("*")) return void changedAt.set("*", now);
  for (const c of changed) if (c.startsWith("reg:")) changedAt.set(c.slice(4), now);
});

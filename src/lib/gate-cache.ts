"use client";

/**
 * Browser-side cache for gate screens (memory only, gone on reload/logout).
 *
 * Opening a screen shows the data it had last time at once. It is fetched
 * again only when needed, so switching between sections sends no requests:
 * - the server said this data changed (a live ping, see useGateLiveSync), or
 * - the live connection is not up, and the copy is older than 15 s, or
 * - the copy is older than 5 minutes (a safety net).
 * A screen that is open refreshes quietly when its data changes; the old
 * copy stays on screen until the new one arrives.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { liveSince, onGatePing } from "@/lib/realtime/live";

type Entry = { data: unknown; at: number; topics: string[] };

/** Data loaded after the live connection came up is trusted until a ping (or this age) */
const MAX_TRUSTED_AGE_MS = 5 * 60_000;
/** Without live updates: refetched when older than this */
const MAX_UNTRUSTED_AGE_MS = 15_000;
const MAX_KEYS = 60;

const store = new Map<string, Entry>();
/** When each key was last reported changed (ping), so a fetch already running doesn't hide it */
const changedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();
const subs = new Map<string, Set<() => void>>();

function notify(key: string) {
  subs.get(key)?.forEach((fn) => fn());
}

/** Topic matching: "reg:" (ending in a colon) matches every "reg:<KEY>"; "*" = anything may have changed. */
const hits = (topics: string[], changed: string[]) =>
  changed.includes("*") || changed.some((c) => topics.some((t) => (t.endsWith(":") ? c.startsWith(t) : c === t)));

/** Does this copy still need no request? */
function isFresh(key: string): boolean {
  const e = store.get(key);
  if (!e) return false;
  if ((changedAt.get(key) ?? 0) >= e.at) return false;
  const age = Date.now() - e.at;
  const since = liveSince();
  // Loaded while live updates were on: a change would have come as a ping
  return since !== null && e.at >= since ? age < MAX_TRUSTED_AGE_MS : age < MAX_UNTRUSTED_AGE_MS;
}

/** Live ping: these topics changed on the server. Open screens refresh; others refetch when opened. */
export function markGateDataChanged(changed: string[]) {
  const now = Date.now();
  for (const [key, e] of store) {
    if (!hits(e.topics, changed)) continue;
    changedAt.set(key, now);
    notify(key);
  }
}

// Every change on the gate channel, whichever screen is open
onGatePing(markGateDataChanged);

/** Loads `key` (or joins the request already running) and keeps the result. */
export function loadGateData<T>(key: string, fetcher: () => Promise<T>, topics: string[]): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const startedAt = Date.now();
  const req = fetcher()
    .then((data) => {
      // An error answer ({ error }) is not kept: the next open asks again
      if (!(data && typeof data === "object" && "error" in data && (data as any).error)) {
        if (store.size >= MAX_KEYS && !store.has(key)) store.delete(store.keys().next().value!);
        // A ping that arrived while this was loading still counts (changedAt > startedAt)
        store.set(key, { data, at: startedAt, topics });
        notify(key);
      }
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, req);
  return req;
}

/** Warm the cache before a screen opens (no request when the copy is still good). */
export function prefetchGateData<T>(key: string, fetcher: () => Promise<T>, topics: string[]) {
  if (isFresh(key) || inFlight.has(key)) return;
  loadGateData(key, fetcher, topics).catch(() => {});
}

/**
 * Data the page already has (server-rendered at `loadedAt`): kept under `key`
 * unless a copy is there. Shown at once; fetched again when no longer fresh
 * (a page pre-loaded minutes ago is refreshed quietly on open).
 */
export function seedGateData(key: string, data: unknown, loadedAt: number, topics: string[] = []) {
  if (!store.has(key)) store.set(key, { data, at: Math.min(loadedAt, Date.now()), topics });
}

/** Forget cached data whose key starts with `prefix` (after this screen changed it). */
export function forgetGateData(prefix: string) {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}

const noop = () => () => {};

/**
 * Data for a gate screen. `key` holds everything the fetcher depends on
 * (e.g. "visitors" or "log|2026-10-21"); null = nothing to load yet.
 *
 * Returns the cached copy at once (data), whether the first load is still
 * running with nothing to show (loading), an error message when it failed
 * with nothing to show (error), and reload() to fetch again now.
 */
export function useGateData<T>(key: string | null, fetcher: () => Promise<T>, topics: string[]) {
  const subscribe = useCallback(
    (fn: () => void) => {
      if (!key) return () => {};
      let set = subs.get(key);
      if (!set) subs.set(key, (set = new Set()));
      set.add(fn);
      return () => {
        set!.delete(fn);
        if (!set!.size) subs.delete(key);
      };
    },
    [key]
  );
  const entry = useSyncExternalStore(
    key ? subscribe : noop,
    () => (key ? store.get(key) : undefined),
    () => undefined
  );
  // A ping for this key: changedAt moves past entry.at
  const changedNo = useSyncExternalStore(
    key ? subscribe : noop,
    () => (key ? changedAt.get(key) ?? 0 : 0),
    () => 0
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topicsKey = topics.join("|");

  const run = useCallback(
    (force: boolean) => {
      if (!key || (!force && isFresh(key))) return Promise.resolve();
      setPending(true);
      return loadGateData(key, fetcher, topicsKey ? topicsKey.split("|") : [])
        .then((res: any) => setError(res && typeof res === "object" && res.error ? String(res.error) : null))
        .catch((err: any) => setError(err?.message || "Could not load. Check the connection and try again."))
        .finally(() => setPending(false));
    },
    // The fetcher is rebuilt every render; `key` holds everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, topicsKey]
  );

  // On open (and when the key changes or the data changes on the server): fetch only if needed
  useEffect(() => {
    setError(null);
    void run(false);
  }, [run, changedNo]);

  return {
    data: entry?.data as T | undefined,
    /** Nothing to show yet and a load is running */
    loading: !entry && (pending || (!!key && !error)),
    /** Refreshing quietly with a copy on screen */
    refreshing: !!entry && pending,
    /** Only shown when there is nothing cached to show instead */
    error: entry ? null : error,
    /** Fetch again now (after this screen saved something) */
    reload: () => run(true),
  };
}

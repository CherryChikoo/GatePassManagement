"use client";

import { useEffect, useState } from "react";
import { forgetGateData, useGateData } from "@/lib/gate-cache";

/**
 * One page of a server-paged list through the gate cache (src/lib/gate-cache.ts):
 * a page seen before shows at once, and the page on screen stays visible
 * (dimmed by the caller via `busy`) while the next one loads.
 *
 * `name` prefixes the cache key; `params` holds everything the fetcher depends
 * on (page, search, filters). `reloadAll()` forgets every cached page of this
 * list and fetches the current one again (after a change on this screen).
 */
export function usePagedList<T>(name: string, params: Record<string, unknown>, fetcher: () => Promise<T>, topics: string[] = []) {
  const res = useGateData<T>(`${name}|${JSON.stringify(params)}`, fetcher, topics);
  const [shown, setShown] = useState<T | null>(null);
  useEffect(() => {
    if (res.data) setShown(res.data);
  }, [res.data]);
  const data = res.data ?? shown;
  return {
    data,
    /** Loading or refreshing (the previous page may still be on screen) */
    busy: res.loading || res.refreshing,
    /** Only when there is nothing to show */
    error: data ? null : res.error,
    reload: res.reload,
    reloadAll: () => {
      forgetGateData(`${name}|`);
      return res.reload();
    },
  };
}

/** The search text, applied after a short pause in typing (one request, not one per key). */
export function useDebounced(value: string, ms = 350) {
  const [debounced, setDebounced] = useState(value.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

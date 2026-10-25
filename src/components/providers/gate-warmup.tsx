"use client";

/**
 * Security only (mounted once by app/security/layout.tsx):
 * - keeps the live connection open on every gate screen, so cached data is
 *   told when it changes and is fetched again only then (src/lib/gate-cache.ts);
 * - once per app open, when the phone is idle, loads the data the gate
 *   screens open with (the bottom bar pre-loads the pages themselves), so the
 *   first tap on a section shows it at once. No repeated requests: later
 *   loads happen only when something changed.
 */
import { useEffect } from "react";
import { useLiveTopics } from "@/lib/realtime/live";
import { prefetchGateData } from "@/lib/gate-cache";
import { OUTSIDERS_QUERY, REGISTER_COUNTS_QUERY } from "@/lib/gate-queries";

let warmed = false;

export function GateWarmup() {
  useLiveTopics(["reg:", "gate", "visitors", "attendance"], () => {});

  useEffect(() => {
    if (warmed) return;
    const run = () => {
      if (warmed) return;
      warmed = true;
      prefetchGateData(REGISTER_COUNTS_QUERY.key, REGISTER_COUNTS_QUERY.fetch, REGISTER_COUNTS_QUERY.topics);
      prefetchGateData(OUTSIDERS_QUERY.key, OUTSIDERS_QUERY.fetch, OUTSIDERS_QUERY.topics);
    };
    // After the first screen has loaded, so it never competes with it
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 1500);
    return () => clearTimeout(timer);
  }, []);

  return null;
}

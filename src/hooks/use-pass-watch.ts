"use client";

import { useEffect, useRef } from "react";
import { useOwnLive } from "@/lib/realtime/live";

/** While the live connection is up, a slow safety check is enough */
const LIVE_CHECK_MS = 60_000;

/**
 * Watches one pass while the holder is waiting on someone else (QR shown at the
 * gate, or waiting for approval), and calls `onChange` the moment it changes
 * (scanned, approved, rejected…).
 *
 * - Live (normal): the server pings this user's private topic when the pass
 *   changes; the screen then asks /api/pass-status for the pass's tiny
 *   fingerprint and reacts straight away. A safety check runs once a minute.
 * - Not live (no connection yet, or none free): it checks the fingerprint
 *   every `intervalMs` instead, as before.
 *
 * Checks run only while the screen is visible; coming back checks at once.
 */
export function usePassWatch(permissionId: string | null | undefined, enabled: boolean, onChange: () => void, intervalMs = 2500) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const checkNow = useRef<(() => void) | null>(null);
  const live = useOwnLive((changed) => {
    if (changed.includes("*") || changed.includes(`pass:${permissionId}`)) checkNow.current?.();
  }, enabled && !!permissionId);
  const liveRef = useRef(live);
  const reschedule = useRef<(() => void) | null>(null);
  useEffect(() => {
    liveRef.current = live;
    // Connection came up or dropped: use the new pace from now on
    reschedule.current?.();
  }, [live]);

  useEffect(() => {
    if (!enabled || !permissionId) return;
    let first: string | null = null;
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      if (stopped || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(`/api/pass-status?id=${encodeURIComponent(permissionId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const { sig } = (await res.json()) as { sig?: string };
        if (!sig || stopped) return;
        if (first === null) first = sig;
        else if (sig !== first) {
          stopped = true;
          onChangeRef.current();
        }
      } catch {
        // offline for a moment: the next check tries again
      } finally {
        busy = false;
      }
    };

    // The next check comes sooner when there is no live connection
    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(async () => {
        timer = null;
        await check();
        // Rescheduled meanwhile (connection changed): that timer carries on
        if (!timer) schedule();
      }, liveRef.current ? LIVE_CHECK_MS : intervalMs);
    };

    checkNow.current = () => void check();
    reschedule.current = () => {
      if (timer) clearTimeout(timer);
      schedule();
    };
    check();
    schedule();
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      checkNow.current = null;
      reschedule.current = null;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [permissionId, enabled, intervalMs]);
}

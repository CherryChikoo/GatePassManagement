"use client";

import { useEffect, useRef } from "react";
import { useOwnLive } from "@/lib/realtime/live";

/**
 * While the live connection is up, a safety check now and then is enough. Kept
 * short: a phone's live connection can die silently (screen dimmed at the gate),
 * and the student must not stay on the QR after the guard has scanned it.
 */
const LIVE_CHECK_MS = 20_000;
/** The screen could not reload after a change (network blip): try again this soon */
const RETRY_MS = 3_000;
/**
 * Without a live connection the checks slow down the longer nothing changes:
 * from `intervalMs` up to this. Thousands of students waiting at once must not
 * flood the server (Vercel / Supabase free plans) — a change is still seen
 * within half a minute, and at once when the screen is opened again.
 */
const MAX_POLL_MS = 30_000;

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
 *
 * `onChange` may return `false` when it could not reload the screen: the change
 * is then reported again a few seconds later, so the screen never stays stuck.
 */
export function usePassWatch(
  permissionId: string | null | undefined,
  enabled: boolean,
  onChange: () => unknown,
  intervalMs = 5000,
) {
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
    // A ping came during a check: check once more right after
    let again = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Current pace without a live connection (grows while nothing changes)
    let pollMs = intervalMs;

    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      again = false;
      try {
        const res = await fetch(`/api/pass-status?id=${encodeURIComponent(permissionId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const { sig } = (await res.json()) as { sig?: string };
        if (!sig || stopped) return;
        if (first === null) first = sig;
        else if (sig !== first) {
          // Keep watching: the same pass can change again (e.g. out, then back in)
          const shown = await onChangeRef.current();
          if (stopped) return;
          if (shown === false) {
            // Not reloaded: report this change again shortly
            setTimeout(() => void check(), RETRY_MS);
          } else {
            first = sig;
          }
        }
      } catch {
        // offline for a moment: the next check tries again
      } finally {
        busy = false;
      }
      if (again && !stopped) void check();
    };

    // The next check comes sooner when there is no live connection
    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(async () => {
        timer = null;
        await check();
        if (!liveRef.current) pollMs = Math.min(MAX_POLL_MS, Math.round(pollMs * 1.5));
        // Rescheduled meanwhile (connection changed): that timer carries on
        if (!timer) schedule();
      }, liveRef.current ? LIVE_CHECK_MS : pollMs);
    };

    checkNow.current = () => void check();
    reschedule.current = () => {
      if (timer) clearTimeout(timer);
      schedule();
    };
    check();
    schedule();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Back on the screen: check now, then at the quick pace again
      pollMs = intervalMs;
      check();
    };
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

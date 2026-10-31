"use client";

import { useEffect, useRef } from "react";

/**
 * Safety net for screens that normally update from live pings (new requests,
 * visitors waiting at the gate…). A phone or laptop left idle can lose its live
 * connection without noticing (sleep, Wi-Fi change), and then nothing arrives
 * until the page is reloaded. So while the screen is visible this reloads now
 * and then: often while the connection is down, rarely while it is up. It also
 * reloads at once when the internet comes back. Hidden screens make no requests.
 *
 * Only for screens a few people keep open (approvers' requests, Security's
 * arrivals), so the free-plan request budget is not touched in practice.
 */
export function useSafetyReload(
  reload: () => unknown,
  opts: { isLive: () => boolean; whenLiveMs: number; whenDownMs: number; enabled?: boolean }
) {
  const { whenLiveMs, whenDownMs, enabled = true } = opts;
  const reloadRef = useRef(reload);
  const isLiveRef = useRef(opts.isLive);
  useEffect(() => {
    reloadRef.current = reload;
    isLiveRef.current = opts.isLive;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const next = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") void reloadRef.current();
        next();
      }, isLiveRef.current() ? whenLiveMs : whenDownMs);
    };
    next();
    const onOnline = () => void reloadRef.current();
    window.addEventListener("online", onOnline);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, whenLiveMs, whenDownMs]);
}

"use client";

import { useEffect, type RefObject } from "react";

/**
 * Floating glass bars: the page scrolls underneath the top bar, the page
 * controls (PagerBar) and the bottom bar, and shows through them. This keeps
 * the space they cover measured — so the first and last content can always be
 * scrolled clear of them, and the page controls sit just above the bottom bar —
 * whatever the phone, language or text size:
 *
 *   --bar-top     main's top → bottom edge of the top bar
 *   --nav-space   bottom edge of main → top of the bottom bar (incl. the raised Scan button)
 *   --bar-bottom  --nav-space + the page controls, when shown
 *
 * Set on `main`; the scroll area and the page-controls slot read them.
 */
export function useBarSpace(
  mainRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
  navRef: RefObject<HTMLElement | null>,
  slotRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const measure = () => {
      const box = main.getBoundingClientRect();
      const header = headerRef.current?.getBoundingClientRect();
      const barTop = header && header.height > 0 ? header.bottom - box.top : 0;

      // The bottom bar, and anything sticking up out of it (the Scan button)
      let navTop = Infinity;
      const nav = navRef.current;
      if (nav) {
        for (const el of [nav, ...Array.from(nav.children)]) {
          const r = el.getBoundingClientRect();
          if (r.height > 0) navTop = Math.min(navTop, r.top);
        }
      }
      const navSpace = Number.isFinite(navTop) ? Math.max(0, box.bottom - navTop) : 0;

      const slot = slotRef.current;
      const pager = slot && slot.childElementCount > 0 ? slot.getBoundingClientRect().height : 0;
      // 12px between the page controls and the bottom bar (or the screen edge)
      const barBottom = navSpace + (pager > 0 ? pager + 12 : 0);

      main.style.setProperty("--bar-top", `${Math.round(barTop)}px`);
      main.style.setProperty("--nav-space", `${Math.round(navSpace)}px`);
      main.style.setProperty("--bar-bottom", `${Math.round(barBottom)}px`);
    };

    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [main, headerRef.current, navRef.current, slotRef.current]) if (el) ro.observe(el);
    // The page controls appear / go when a list with pages opens or closes
    const mo = slotRef.current ? new MutationObserver(measure) : null;
    if (mo && slotRef.current) mo.observe(slotRef.current, { childList: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mainRef, headerRef, navRef, slotRef]);
}

const GLASS_KEY = "gatepass-glass-off";
/** A frame slower than this (under ~42 fps) counts as a dropped frame */
const SLOW_FRAME_MS = 24;
/** Frames per sample: about 2 s of scrolling at 60 fps */
const SAMPLE_FRAMES = 120;
/** A sample is bad when more than this share of its frames were slow */
const SLOW_SHARE = 0.15;
/** Bad samples (in one visit) before the glass is turned off on this device */
const BAD_SAMPLES = 2;
/** Frames right after a page opens are skipped (the page is still loading) */
const WARMUP_MS = 3_000;
/** A device switched to solid bars is tried again after a week (browser updates…) */
const RETRY_AFTER_MS = 7 * 24 * 60 * 60_000;

/**
 * Keeps scrolling smooth (60 fps or more) with the frosted bars:
 * - Phones with little memory, and people who turned on "reduce transparency"
 *   (in globals.css), get solid bars straight away.
 * - Every other device keeps the glass while it keeps up: during scrolling the
 *   frame rate is sampled, and if this device drops frames with the blur on,
 *   it switches to solid bars and remembers that for a week.
 * Sampling runs only while scrolling, so it costs nothing at rest.
 */
export function useGlassSupport(enabled = true) {
  useEffect(() => {
    // Screens without glass (Security) need no checking
    if (!enabled) return;
    const root = document.documentElement;
    const n = navigator as Navigator & { deviceMemory?: number };
    const weak = (typeof n.deviceMemory === "number" && n.deviceMemory <= 3) || (n.hardwareConcurrency || 8) <= 4;

    let offSince = 0;
    try {
      offSince = Number(localStorage.getItem(GLASS_KEY)) || 0;
    } catch {
      // storage blocked: just measure again this visit
    }
    const off = offSince > 0 && Date.now() - offSince < RETRY_AFTER_MS;
    root.classList.toggle("no-blur", weak || off);
    if (weak || off) return;

    const openedAt = performance.now();
    let frames = 0;
    let slow = 0;
    let bad = 0;
    let last = 0;
    let raf = 0;
    let scrolling = false;
    let idle: ReturnType<typeof setTimeout> | null = null;

    const turnOff = () => {
      root.classList.add("no-blur");
      try {
        localStorage.setItem(GLASS_KEY, String(Date.now()));
      } catch {
        // not remembered: measured again next visit
      }
      stop();
    };

    const tick = (t: number) => {
      raf = 0;
      if (last && t - openedAt > WARMUP_MS) {
        frames++;
        if (t - last > SLOW_FRAME_MS) slow++;
        if (frames >= SAMPLE_FRAMES) {
          if (slow / frames > SLOW_SHARE && ++bad >= BAD_SAMPLES) return turnOff();
          frames = 0;
          slow = 0;
        }
      }
      last = t;
      if (scrolling) raf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      if (!scrolling) {
        scrolling = true;
        last = 0;
        if (!raf) raf = requestAnimationFrame(tick);
      }
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        scrolling = false;
      }, 150);
    };

    function stop() {
      document.removeEventListener("scroll", onScroll, true);
      if (raf) cancelAnimationFrame(raf);
      if (idle) clearTimeout(idle);
    }

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return stop;
  }, [enabled]);
}

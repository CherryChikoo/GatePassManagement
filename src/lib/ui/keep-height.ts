"use client";

import { useEffect, type RefObject } from "react";

/**
 * Stops the page jumping when a filter makes a list shorter.
 *
 * When the reader is scrolled down and changes a filter (dropdown, checkbox,
 * search box, tab), the list can get shorter; the browser then pulls the view
 * up, and pushes it down again when the list grows back. Right at the change —
 * before the list re-renders — the content keeps its current height as a
 * minimum, so the view stays where it is. Released shortly after (the list is
 * in place by then), or when the reader scrolls back to the top or opens another
 * page (`resetKey`) — never left behind as empty space at the bottom.
 *
 * Typing a note (textarea) or picking a file is not a filter: no hold.
 */
const HOLD_MS = 1500;
export function useKeepHeightOnFilter(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  resetKey: string
) {
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    content.style.minHeight = "";
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    const release = () => {
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = null;
      content.style.minHeight = "";
    };

    const hold = (e: Event) => {
      if (scroller.scrollTop <= 0) return;
      const el = e.target as Element | null;
      if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === "file")) return;
      if (e.type === "click" && !el?.closest('[role="tab"], [role="radio"], [aria-pressed]')) return;
      content.style.minHeight = `${content.offsetHeight}px`;
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(release, HOLD_MS);
    };
    const onScroll = () => {
      if (scroller.scrollTop <= 0 && content.style.minHeight) release();
    };

    scroller.addEventListener("change", hold, true);
    scroller.addEventListener("input", hold, true);
    scroller.addEventListener("click", hold, true);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("change", hold, true);
      scroller.removeEventListener("input", hold, true);
      scroller.removeEventListener("click", hold, true);
      scroller.removeEventListener("scroll", onScroll);
      release();
    };
  }, [scrollRef, contentRef, resetKey]);
}

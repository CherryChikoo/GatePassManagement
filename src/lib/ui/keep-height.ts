"use client";

import { useEffect, type RefObject } from "react";

/**
 * Stops the page jumping when a filter makes a list shorter.
 *
 * When the reader is scrolled down and changes a filter (dropdown, checkbox,
 * search box, tab), the list can get shorter; the browser then pulls the view
 * up, and pushes it down again when the list grows back. Right at the change —
 * before the list re-renders — the content keeps its current height as a
 * minimum, so the view stays where it is. Released when the reader scrolls back
 * to the top or opens another page (`resetKey`).
 */
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

    const hold = (e: Event) => {
      if (scroller.scrollTop <= 0) return;
      if (e.type === "click") {
        const el = e.target as Element | null;
        if (!el?.closest('[role="tab"], [role="radio"], [aria-pressed]')) return;
      }
      content.style.minHeight = `${content.offsetHeight}px`;
    };
    const onScroll = () => {
      if (scroller.scrollTop <= 0 && content.style.minHeight) content.style.minHeight = "";
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
      content.style.minHeight = "";
    };
  }, [scrollRef, contentRef, resetKey]);
}

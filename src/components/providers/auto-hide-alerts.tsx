"use client";

import { useEffect } from "react";

/**
 * Message banners leave by themselves (every login except Security, whose
 * gate screens keep theirs until handled). Any success / error banner on the
 * page — role="status" / role="alert" — shows a thin coral line running out,
 * then fades and folds away: 5 s for messages, 7 s for errors. Hovering
 * pauses it; a new message in the same banner starts it again.
 *
 * Left alone (they must stay until dealt with): banners with a "Try again" /
 * action button, anything inside a form or a pop-up, fixed overlays (loading,
 * signing out), and anything marked data-keep.
 */
const MESSAGE_MS = 5_000;
const ERROR_MS = 7_000;
const LEAVE_MS = 260;
const SKIP_BUTTON = /^(ok|×|✕|x|close|dismiss)$/i;

type Timed = { timer: ReturnType<typeof setTimeout> | null; left: number; startedAt: number; text: string };

export function AutoHideAlerts({ role }: { role: string }) {
  useEffect(() => {
    if (role === "SECURITY") return;
    const timed = new WeakMap<HTMLElement, Timed>();

    const eligible = (el: HTMLElement) => {
      if (el.closest("[data-keep], form, [role=dialog], [role=alertdialog], .security-text")) return false;
      if (getComputedStyle(el).position === "fixed") return false;
      // An action to take (Try again, Retry, a link…): stays until used
      for (const b of el.querySelectorAll<HTMLElement>("button, a")) {
        const label = (b.getAttribute("aria-label") || b.textContent || "").trim();
        if (!SKIP_BUTTON.test(label)) return false;
      }
      return !!el.textContent?.trim();
    };

    const leave = (el: HTMLElement) => {
      el.classList.add("alert-leaving");
      setTimeout(() => {
        if (el.classList.contains("alert-leaving")) el.classList.add("alert-gone");
      }, LEAVE_MS);
    };

    const start = (el: HTMLElement, ms: number) => {
      const t: Timed = { timer: null, left: ms, startedAt: Date.now(), text: el.textContent ?? "" };
      timed.set(el, t);
      el.classList.remove("alert-leaving", "alert-gone");
      el.classList.add("alert-timed");
      el.style.setProperty("--alert-ms", `${ms}ms`);
      // Restart the running-out line
      el.classList.remove("alert-run");
      void el.offsetWidth;
      el.classList.add("alert-run");
      t.timer = setTimeout(() => leave(el), ms);
    };

    const watch = (el: HTMLElement) => {
      if (!eligible(el)) return;
      const ms = el.getAttribute("role") === "alert" ? ERROR_MS : MESSAGE_MS;
      const t = timed.get(el);
      // Same banner, same words: keep its clock; new words: start again
      if (t && t.text === (el.textContent ?? "")) return;
      if (t?.timer) clearTimeout(t.timer);
      start(el, ms);
    };

    const scan = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches("[role=status], [role=alert]")) watch(root);
      root.querySelectorAll?.<HTMLElement>("[role=status], [role=alert]").forEach(watch);
    };

    // Pause while the pointer is on it
    const onEnter = (e: Event) => {
      const el = e.target as HTMLElement;
      const t = el instanceof HTMLElement ? timed.get(el) : undefined;
      if (!t?.timer) return;
      clearTimeout(t.timer);
      t.timer = null;
      t.left = Math.max(800, t.left - (Date.now() - t.startedAt));
      el.classList.add("alert-paused");
    };
    const onLeave = (e: Event) => {
      const el = e.target as HTMLElement;
      const t = el instanceof HTMLElement ? timed.get(el) : undefined;
      if (!t || t.timer || el.classList.contains("alert-gone")) return;
      t.startedAt = Date.now();
      el.classList.remove("alert-paused");
      t.timer = setTimeout(() => leave(el), t.left);
    };

    scan(document.body);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList") {
          r.addedNodes.forEach((n) => n instanceof HTMLElement && scan(n));
          // Words changed inside a banner
          const host = (r.target as HTMLElement).closest?.("[role=status], [role=alert]") as HTMLElement | null;
          if (host) watch(host);
        } else if (r.type === "characterData") {
          const host = r.target.parentElement?.closest("[role=status], [role=alert]") as HTMLElement | null;
          if (host) watch(host);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("pointerenter", onEnter, true);
    document.addEventListener("pointerleave", onLeave, true);
    return () => {
      mo.disconnect();
      document.removeEventListener("pointerenter", onEnter, true);
      document.removeEventListener("pointerleave", onLeave, true);
    };
  }, [role]);
  return null;
}

"use client";

/**
 * The 4-button screens of the Visitors Book and the Admission Book (Security):
 * At the gate · Type it myself · Inside now · Old records, plus the round QR
 * button by the title (the check-in QR in a pop-up). Each button opens its
 * screen in place (`?view=…`, no server round trip), and every screen has the
 * same "← Buttons" control at the top to come back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, QrCode, type LucideIcon } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { scrollPageToTop } from "@/lib/ui/scroll-top";
import { cn } from "@/lib/utils";
import type { Translate } from "@/lib/i18n";

export type HubTile = {
  key: string;
  icon: LucideIcon;
  /** 2–3 words */
  title: string;
  /** One short line under the title */
  hint: string;
  /** Live count in a pill next to the title (e.g. Inside now 4); hidden when null / undefined */
  count?: number | null;
  /** The main button (At the gate): coral */
  primary?: boolean;
  onClick: () => void;
};

/**
 * The page's first box on the 4-button screens and their screens: when a link
 * opens the page (menu, "Open now" banner), the router scrolls this box into
 * view; the margin keeps it, with its Back button, below the floating top bar.
 */
export const HUB_PAGE_TOP = "scroll-mt-[calc(var(--bar-top,4.75rem)_+_1.25rem)]";

/**
 * Big buttons, all with the same layout and top-aligned: on phones one per row
 * (icon on the left, title + count, the hint under it); from 480 px two per row
 * (icon on top). Buttons in a row are always the same height.
 */
export function HubTiles({ tiles }: { tiles: HubTile[] }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 sm:gap-3 lg:gap-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const hasCount = tile.count !== null && tile.count !== undefined;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={tile.onClick}
            className={cn(
              "flex h-full min-h-[84px] w-full items-start gap-3 rounded-3xl border p-3.5 text-left shadow-card transition-[background-color,transform,border-color] active:scale-[0.98]",
              "min-[480px]:flex-col min-[480px]:gap-2.5 sm:p-5",
              tile.primary
                ? "border-orange-600 bg-orange-600 text-white hover:bg-orange-700"
                : "border-zinc-800 bg-zinc-900 text-zinc-100 hover:border-orange-500/40 hover:bg-zinc-950"
            )}
          >
            <span
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14",
                tile.primary ? "bg-white/15 text-white" : "bg-orange-500/10 text-orange-500"
              )}
            >
              <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
            </span>
            <span className="block min-w-0 flex-1 self-center min-[480px]:flex-none min-[480px]:self-stretch">
              <span className="flex items-start gap-2">
                <span className="min-w-0 text-base font-semibold leading-snug break-words sm:text-lg">{tile.title}</span>
                {hasCount && (
                  <span
                    className={cn(
                      "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums sm:h-7 sm:min-w-7",
                      tile.primary ? "bg-white text-orange-600" : "bg-orange-600 text-white"
                    )}
                  >
                    {tile.count}
                  </span>
                )}
              </span>
              <span className={cn("mt-0.5 block text-xs leading-snug sm:text-sm", tile.primary ? "text-white/90" : "text-zinc-500")}>{tile.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The round QR button next to the page title (same as the registers list's): opens the check-in QR pop-up. */
export function HubQrButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] transition-[background-color,transform] hover:bg-orange-700 active:scale-95"
    >
      <QrCode className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/** "← Buttons": back to the 4 buttons (same place on every screen). */
export function HubBackButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex h-12 items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900 pl-1.5 pr-5 text-[15px] font-medium text-zinc-100 shadow-card transition-[background-color,transform] hover:bg-zinc-950 active:scale-[0.98]",
        className
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-white transition-transform group-hover:-translate-x-0.5">
        <ArrowLeft className="h-[18px] w-[18px]" />
      </span>
      {t("Buttons")}
    </button>
  );
}

/**
 * Which screen is open: `?view=<one of views>`, else the buttons ("hub").
 * go() opens a screen without a server round trip (the phone's Back button
 * returns to the buttons); back() is the "← Buttons" control.
 */
export function useHubView<V extends string>(views: readonly V[]) {
  const params = useSearchParams();
  const raw = params.get("view");
  const view: V | "hub" = raw && (views as readonly string[]).includes(raw) ? (raw as V) : "hub";
  // The screen opened from the buttons on this page (so Back returns to them).
  // A link that opens another screen (the "Open now" banner) makes it stale.
  const pushed = useRef<string | null>(null);
  useEffect(() => {
    const onPop = () => {
      pushed.current = null;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((next: V | "hub", opts?: { replace?: boolean }) => {
    const url = next === "hub" ? window.location.pathname : `${window.location.pathname}?view=${next}`;
    if (opts?.replace) {
      window.history.replaceState(null, "", url);
      // Still one entry above the buttons (e.g. the form replaced by Inside now)
      if (pushed.current) pushed.current = next === "hub" ? null : next;
    } else {
      window.history.pushState(null, "", url);
      pushed.current = next === "hub" ? null : next;
    }
    scrollPageToTop();
  }, []);
  const back = useCallback(() => {
    if (pushed.current && pushed.current === new URLSearchParams(window.location.search).get("view")) {
      pushed.current = null;
      window.history.back();
    } else {
      // Opened by a link (menu, Registers list): no history entry of ours to go back to
      window.history.replaceState(null, "", window.location.pathname);
    }
    scrollPageToTop();
  }, []);
  return { view, go, back };
}

/** The current time, moved on once a minute while `enabled` (labels like "Inside 2 h 10 min"; no requests). */
export function useMinuteClock(enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 60_000);
    // A phone waking up shows the right time at once
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return now;
}

/** "Inside 2 h 10 min" since `since` (ISO / Date); null when unknown. */
export function insideForLabel(t: Translate, since: string | Date | null | undefined, now: number): string | null {
  if (!since) return null;
  const start = new Date(since).getTime();
  if (!Number.isFinite(start)) return null;
  const mins = Math.max(0, Math.floor((now - start) / 60_000));
  if (mins < 1) return t("Inside less than a minute");
  if (mins < 60) return t("Inside {m} min", { m: mins });
  const h = Math.floor(mins / 60);
  if (h < 24) return t("Inside {h} h {m} min", { h, m: mins % 60 });
  return t("Inside {d} d {h} h", { d: Math.floor(h / 24), h: h % 24 });
}

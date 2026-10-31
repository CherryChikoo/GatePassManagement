"use client";

/**
 * The 4-button screens of the Visitors Book and the Admission Book (Security):
 * Show QR · Type it myself · Inside now · Old records. Each button opens its
 * screen in place (`?view=…`, no server round trip), and every screen has the
 * same "← Buttons" control at the top to come back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, type LucideIcon } from "lucide-react";
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
  /** Live count next to the title (e.g. Inside now 4); hidden when null / undefined */
  count?: number | null;
  /** Small coloured note (e.g. "2 waiting") */
  badge?: string | null;
  /** The main button (Show QR): coral */
  primary?: boolean;
  onClick: () => void;
};

/** Big buttons, two per row (one per row on very narrow phones). */
export function HubTiles({ tiles }: { tiles: HubTile[] }) {
  return (
    <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 sm:gap-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={tile.onClick}
            className={cn(
              "group relative flex min-h-[156px] sm:min-h-[176px] flex-col items-start justify-between gap-4 rounded-3xl border p-4 sm:p-5 text-left shadow-card transition-[background-color,transform,border-color] active:scale-[0.98]",
              tile.primary
                ? "border-orange-600 bg-orange-600 text-white hover:bg-orange-700"
                : "border-zinc-800 bg-zinc-900 text-zinc-100 hover:border-orange-500/40 hover:bg-zinc-950"
            )}
          >
            <span
              className={cn(
                "flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl",
                tile.primary ? "bg-white/15 text-white" : "bg-orange-500/10 text-orange-500"
              )}
            >
              <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
            </span>
            {tile.badge && (
              <span
                className={cn(
                  "absolute right-3 top-3 max-w-[60%] truncate rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  tile.primary ? "bg-white text-orange-600" : "bg-amber-500/15 text-amber-600"
                )}
              >
                {tile.badge}
              </span>
            )}
            <span className="block min-w-0 w-full">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base sm:text-lg font-semibold leading-tight break-words">{tile.title}</span>
                {tile.count !== null && tile.count !== undefined && (
                  <span
                    className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums",
                      tile.primary ? "bg-white text-orange-600" : "bg-orange-600 text-white"
                    )}
                  >
                    {tile.count}
                  </span>
                )}
              </span>
              <span className={cn("mt-1 block text-xs leading-snug", tile.primary ? "text-white/85" : "text-zinc-500")}>{tile.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
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

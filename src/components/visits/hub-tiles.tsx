"use client";

/**
 * The 4-button screens of the Visitors Book and the Admission Book (Security):
 * At the gate · Type it myself · Inside now · Old records, plus the round QR
 * button by the title (the check-in QR in a pop-up). Each button opens its
 * screen in place (`?view=…`, no server round trip), and every screen has the
 * same header (HubScreenHeader: round "←", title, count) to come back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, QrCode, type LucideIcon } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { scrollPageToTop } from "@/lib/ui/scroll-top";
import { cn } from "@/lib/utils";
import type { Translate } from "@/lib/i18n";
import type { CheckInRegister } from "./arrival-alert";
import { loadQrLib, warmCheckInQr } from "./checkin-qr-cache";

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
 * Big buttons in a 2 × 2 grid at every width (phones too), all with the same
 * layout and top-aligned: icon top-left, the title (+ count pill) under it, the
 * hint under the title. Buttons in a row are always the same height.
 */
export function HubTiles({ tiles }: { tiles: HubTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:gap-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const hasCount = tile.count !== null && tile.count !== undefined;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={tile.onClick}
            className={cn(
              "flex h-full w-full min-w-0 flex-col items-start justify-start gap-2.5 rounded-3xl border p-4 text-left shadow-card transition-[background-color,transform,border-color] active:scale-[0.98] sm:p-5",
              tile.primary
                ? "border-orange-600 bg-orange-600 text-white hover:bg-orange-700"
                : "border-zinc-800 bg-zinc-900 text-zinc-100 hover:border-orange-500/40 hover:bg-zinc-950"
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12",
                tile.primary ? "bg-white/15 text-white" : "bg-orange-500/10 text-orange-500"
              )}
            >
              <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </span>
            <span className="block w-full min-w-0">
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

/**
 * The round QR button next to the page title (same as the registers list's):
 * opens the check-in QR pop-up. Touching it gets the QR ready while the tap
 * completes (no request when one is already kept in this tab, see
 * checkin-qr-cache.ts); the QR drawing code loads with the buttons (a file, no
 * server call).
 */
export function HubQrButton({ onClick, label, register }: { onClick: () => void; label: string; register: CheckInRegister }) {
  useEffect(() => {
    void loadQrLib().catch(() => {});
  }, []);
  const warm = () => warmCheckInQr(register);
  return (
    <button
      type="button"
      onPointerDown={warm}
      onFocus={warm}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] transition-[background-color,transform] hover:bg-orange-700 active:scale-95"
    >
      <QrCode className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/**
 * The round "←" back to the 4 buttons (same place on every screen): an arrow
 * only, so the title beside it keeps the room (the label is read aloud).
 */
export function HubBackButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("Go Back")}
      title={t("Go Back")}
      className={cn(
        "group flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-card transition-[background-color,transform] hover:bg-zinc-950 active:scale-95",
        className
      )}
    >
      <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

/**
 * The heading of every screen behind the buttons: "←", the title with its live
 * count (and a small spinner while it refreshes), one muted line under it.
 */
export function HubScreenHeader({
  onBack,
  title,
  subtitle,
  count,
  busy = false,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
  /** Pill next to the title; hidden when 0 / unknown (the list says "nobody") */
  count?: number | null;
  /** A small spinner while the list refreshes */
  busy?: boolean;
}) {
  return (
    <header className="flex min-w-0 items-center gap-3">
      <HubBackButton onClick={onBack} />
      <div className="min-w-0 flex-1">
        {/* The count follows the last word (also when a Telugu title wraps) */}
        <h1 className="min-w-0 break-words text-xl font-semibold leading-tight tracking-tight text-zinc-100 sm:text-2xl">
          {title}
          {!!count && (
            <span className="ml-2 inline-flex h-7 min-w-7 -translate-y-0.5 items-center justify-center whitespace-nowrap rounded-full bg-orange-600 px-2 align-middle text-sm font-semibold tabular-nums text-white">
              {count}
            </span>
          )}
          {busy && <Loader2 className="ml-2 inline-block h-4 w-4 animate-spin align-middle text-zinc-500" aria-hidden="true" />}
        </h1>
        {subtitle && <p className="mt-0.5 break-words text-sm leading-snug text-zinc-500">{subtitle}</p>}
      </div>
    </header>
  );
}

/**
 * Which screen is open: `?view=<one of views>`, else the buttons ("hub").
 * go() opens a screen without a server round trip (the phone's Back button
 * returns to the buttons); back() is the round "←" of HubScreenHeader.
 */
export function useHubView<V extends string>(views: readonly V[]) {
  const params = useSearchParams();
  const raw = params.get("view");
  const view: V | "hub" = raw && (views as readonly string[]).includes(raw) ? (raw as V) : "hub";
  // The screen opened from the buttons on this page (so Back returns to them).
  // A link that opens another screen (the "Open now" banner) makes it stale.
  const pushed = useRef<string | null>(null);
  // Opened from a link: the router scrolls the page under the floating top bar
  // (back button and title hidden). Show it from the very top instead, once the
  // router has finished its own scroll (two frames later).
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => scrollPageToTop());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
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

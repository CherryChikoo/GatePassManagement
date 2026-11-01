"use client";

/**
 * Visitor self check-in, on every Security screen (mounted once by
 * app/security/layout.tsx): when a visitor has sent the form from their phone
 * and is waiting at the gate, a small banner "New visitor waiting at the gate"
 * (the whole card is the link) leads to that register's Waiting to accept screen.
 *
 * No polling: the count is fetched once, then again only when the server pings
 * the "arrivals" live topic (a request was sent, accepted or rejected).
 * Not shown on the Show QR screen of that register (the list is right there).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BellRing, ChevronRight, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { callGate } from "@/lib/gate-call";
import { useGateData } from "@/lib/gate-cache";
import { liveSince, useLiveTopics } from "@/lib/realtime/live";
import { useSafetyReload } from "@/lib/realtime/safety-reload";
import type { ArrivalCounts } from "@/server/actions/visit-requests";

export type CheckInRegister = "VISITORS" | "ADMISSION";

/** Live topic: a check-in request was sent / accepted / rejected */
export const ARRIVALS_TOPIC = "arrivals";

export const ARRIVAL_COUNTS_QUERY = {
  key: "arrival-counts",
  fetch: () => callGate("countArrivals", [], 15_000),
  topics: [ARRIVALS_TOPIC],
};

/** Each register's Show QR screen */
export function checkInQrHref(register: CheckInRegister): string {
  return register === "VISITORS" ? "/security/visitors?view=qr" : "/security/registers/admission?view=qr";
}

/** Each register's "Waiting to accept" screen: the visitors waiting there (photo, Accept / Reject) */
export function checkInGateHref(register: CheckInRegister): string {
  return register === "VISITORS" ? "/security/visitors?view=gate" : "/security/registers/admission?view=gate";
}

// ─── Which Show QR screen is open (the banner stays away from it) ────────────

let openQr: CheckInRegister | null = null;
const openQrSubs = new Set<() => void>();
const subscribeOpenQr = (fn: () => void) => {
  openQrSubs.add(fn);
  return () => {
    openQrSubs.delete(fn);
  };
};
function setOpenQr(v: CheckInRegister | null) {
  openQr = v;
  openQrSubs.forEach((fn) => fn());
}

/** Called by the Show QR screen while it is on screen. */
export function useCheckInQrOpen(register: CheckInRegister) {
  useEffect(() => {
    setOpenQr(register);
    return () => {
      if (openQr === register) setOpenQr(null);
    };
  }, [register]);
}

export function ArrivalAlert() {
  const t = useT();
  // Keeps the live connection listening for arrivals on every Security screen
  useLiveTopics([ARRIVALS_TOPIC], () => {});
  const counts = useGateData<ArrivalCounts | { error: string }>(ARRIVAL_COUNTS_QUERY.key, ARRIVAL_COUNTS_QUERY.fetch, ARRIVAL_COUNTS_QUERY.topics);
  // Live connection dropped (phone idle at the gate): the banner still shows new visitors.
  // On every Security screen all day, so kept slow (free plan: about 1M requests a month)
  useSafetyReload(() => counts.reload(), { isLive: () => liveSince() !== null, whenLiveMs: 10 * 60_000, whenDownMs: 60_000 });
  const data = counts.data && !("error" in counts.data) ? counts.data : null;
  const onScreen = useSyncExternalStore(subscribeOpenQr, () => openQr, () => null);
  // Closed with ✕: hidden until someone new arrives
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  // A short buzz when someone new arrives (not for the ones already waiting on open)
  const lastSeen = useRef<string | null | undefined>(undefined);
  const latestId = data?.latest?.id ?? null;
  useEffect(() => {
    if (data === null) return;
    if (lastSeen.current !== undefined && latestId && latestId !== lastSeen.current) {
      try {
        navigator.vibrate?.(200);
      } catch {
        // not supported: the banner is enough
      }
    }
    lastSeen.current = latestId;
  }, [data, latestId]);

  if (!data || !data.latest || data.latest.id === dismissedId) return null;
  // The register of the newest arrival first; else the other one still waiting
  const order: CheckInRegister[] = data.latest.register === "VISITORS" ? ["VISITORS", "ADMISSION"] : ["ADMISSION", "VISITORS"];
  const target = order.find((r) => data[r] > 0 && r !== onScreen);
  if (!target) return null;
  const n = data[target];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-30 mx-auto max-w-lg animate-fade-in"
      style={{ top: "calc(var(--bar-top, 4.75rem) + 0.5rem)" }}
    >
      <ArrivalBanner
        href={checkInGateHref(target)}
        title={n > 1 ? t("{n} visitors waiting at the gate", { n }) : t("New visitor waiting at the gate")}
        book={t(target === "VISITORS" ? "Visitors Book" : "Admission Book & Pass")}
        onHide={() => setDismissedId(data.latest!.id)}
      />
    </div>
  );
}

/**
 * The banner itself: one full-width card, the whole card opens the waiting
 * list (a small arrow shows it), ✕ hides it. The text has the whole width, so
 * the Telugu title wraps to two lines at most instead of a narrow column.
 */
export function ArrivalBanner({ href, title, book, onHide }: { href: string; title: string; book: string; onHide: () => void }) {
  const t = useT();
  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl border border-orange-500/30 bg-zinc-900 shadow-[0_16px_40px_-16px_rgba(207,62,37,0.45)]">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-2 transition-colors hover:bg-orange-500/5 active:bg-orange-500/10"
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/30 motion-reduce:hidden" />
          <BellRing className="relative h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-100">{title}</span>
          <span className="block truncate text-xs text-zinc-500">{book}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={onHide}
        aria-label={t("Hide")}
        className="flex w-11 shrink-0 items-center justify-center border-l border-zinc-800 text-zinc-500 transition-colors hover:bg-zinc-950 hover:text-zinc-300"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

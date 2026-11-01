"use client";

/**
 * Show QR (Visitors Book / Admission Book): a big check-in QR the visitor scans
 * with their phone camera to fill the register's form on their own phone
 * (/v/<token>, src/app/v), and the visitors waiting at the gate for this
 * register; tapping one opens the review (photo, Accept / Reject).
 *
 * Three ways to show it:
 * - full screen (default): heading, the QR, then the waiting list below it;
 * - `inModal`: only the QR (the pop-up's title and "Go Back" frame it);
 * - `showQr={false}`: only the waiting list (no QR is fetched).
 * The two with the waiting list mark it as on screen (useCheckInQrOpen), so the
 * "visitor waiting" banner stays away; the pop-up does not (the page behind
 * keeps its banner).
 *
 * The QR is a signed token valid 15 minutes, fetched again a minute before it
 * runs out, and only while this screen is visible (no requests in the
 * background). The last QR is kept in this tab (checkin-qr-cache.ts): opening
 * it again shows it at once, without asking the server. The waiting list is fetched again only when the server pings
 * "arrivals" (a request sent / accepted / rejected at any gate).
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ClipboardCheck, Loader2, RefreshCw, UserRound, Users } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { callGate } from "@/lib/gate-call";
import { useGateData } from "@/lib/gate-cache";
import { liveSince, useLiveTopics } from "@/lib/realtime/live";
import { useSafetyReload } from "@/lib/realtime/safety-reload";
import { actionErrorMessage } from "@/lib/deployment";
import { cn, formatTime } from "@/lib/utils";
import type { Arrival } from "@/server/actions/visit-requests";
import { ARRIVALS_TOPIC, useCheckInQrOpen, type CheckInRegister } from "./arrival-alert";
import { ArrivalReview } from "./arrival-review";
import { REFRESH_BEFORE_MS, checkInQrImage, getCheckInQr, readyCheckInQrImage } from "./checkin-qr-cache";
import { CheckInQrFrame, CheckInQrPlaceholder } from "./checkin-qr-frame";
import { HubBackButton, HubScreenHeader } from "./hub-tiles";
import { ListEmpty, ListError, ListLoading, PersonCard, PersonCardAction } from "./person-card";

/** After a failed load (no network): try again this much later, while visible */
const RETRY_MS = 30_000;

const CATEGORY_LABEL: Record<string, string> = {
  GUEST: "Guest / Visitor",
  PARENT: "Parent / Guardian",
  VENDOR: "Vendor / Delivery",
  WORKER: "Worker / Staff",
};

export const arrivalsQuery = (register: CheckInRegister) => ({
  key: `arrivals|${register}`,
  fetch: () => callGate("listArrivals", [register], 15_000),
  topics: [ARRIVALS_TOPIC],
});

/**
 * The check-in QR, refreshed before it expires while the screen is visible.
 * A QR kept from an earlier pop-up (checkin-qr-cache.ts) shows at once, with no
 * request, while it has more than 2 minutes left.
 */
function useCheckInQr(register: CheckInRegister, fallbackError: string) {
  const [qr, setQr] = useState<string | null>(() => readyCheckInQrImage(register));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let loading = false;
    /** Local time the shown QR stops working (0 = none yet) */
    let expiresAt = 0;

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const later = (ms: number) => {
      stop();
      timer = setTimeout(load, Math.max(1_000, ms));
    };

    async function load() {
      timer = null;
      if (cancelled || loading || document.visibilityState !== "visible") return;
      loading = true;
      try {
        // The kept QR (no request), or a new one when it is about to run out
        const res = await getCheckInQr(register);
        if (cancelled) return;
        if ("error" in res) {
          setError(res.error);
          if (Date.now() >= expiresAt) setQr(null);
          later(RETRY_MS);
          return;
        }
        // Drawn once per token, then reused
        const image = await checkInQrImage(res);
        if (cancelled) return;
        expiresAt = res.expiresAt;
        setQr(image);
        setError(null);
        later(expiresAt - Date.now() - REFRESH_BEFORE_MS);
      } catch (err) {
        if (cancelled) return;
        setError(actionErrorMessage(err, fallbackError));
        if (Date.now() >= expiresAt) setQr(null);
        later(RETRY_MS);
      } finally {
        loading = false;
      }
    }

    // Hidden: no requests. Back on screen: a new QR at once if this one is (nearly) used up.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return stop();
      const left = expiresAt - Date.now();
      if (left <= REFRESH_BEFORE_MS) {
        if (left <= 0) setQr(null); // never show a QR that no longer works
        void load();
      } else if (!timer) later(left - REFRESH_BEFORE_MS);
    };

    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [register, attempt, fallbackError]);

  return {
    qr,
    error,
    retry: () => {
      setError(null);
      setAttempt((n) => n + 1);
    },
  };
}

export function CheckInQrScreen({
  register,
  onBack,
  inModal = false,
  showQr = true,
}: {
  register: CheckInRegister;
  onBack?: () => void;
  /** Shown in a pop-up (e.g. a list's round QR button): ONLY the QR, as large
   *  as the pop-up allows (no waiting list; the pop-up's title and "Go Back"
   *  replace this screen's heading). */
  inModal?: boolean;
  /** false: ONLY the waiting-at-the-gate list (with the review sheet); no QR is
   *  fetched. Ignored when `inModal`. */
  showQr?: boolean;
}) {
  if (inModal) return <QrPanel register={register} inModal />;
  return <QrScreen register={register} onBack={onBack} showQr={showQr} />;
}

/** The QR, its one-line instruction and the "it changes by itself" note */
function QrPanel({ register, inModal = false }: { register: CheckInRegister; inModal?: boolean }) {
  const t = useT();
  const { qr, error: qrError, retry } = useCheckInQr(register, t("Could not load the QR. Check the connection and try again."));

  return (
    // Same frame the registers list shows while this code loads (nothing moves)
    <CheckInQrFrame inModal={inModal}>
      {qr ? (
        <img
          src={qr}
          alt={t("Check-in QR code")}
          className="h-full w-full rounded-2xl bg-white [image-rendering:pixelated]"
        />
      ) : qrError ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-medium text-red-400">{t(qrError)}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-5 text-sm font-medium text-zinc-100 hover:bg-zinc-950"
          >
            <RefreshCw className="h-4 w-4" />
            {t("Try again")}
          </button>
        </div>
      ) : (
        // QR-shaped, the same size as the QR: nothing moves when it arrives
        <CheckInQrPlaceholder />
      )}
    </CheckInQrFrame>
  );
}

/** Full screen: heading, the QR (unless `showQr` is false) and the waiting list */
function QrScreen({ register, onBack, showQr }: { register: CheckInRegister; onBack?: () => void; showQr: boolean }) {
  const t = useT();
  // The waiting list is on screen: the "visitor waiting" banner stays away
  useCheckInQrOpen(register);

  // Keeps the live connection open, so the list below refreshes by itself
  useLiveTopics([ARRIVALS_TOPIC], () => {});
  const query = arrivalsQuery(register);
  const arrivalsData = useGateData<Arrival[] | { error: string }>(query.key, query.fetch, query.topics);
  const arrivals = Array.isArray(arrivalsData.data) ? arrivalsData.data : [];
  // The visitor is standing at the gate: if the live connection dropped, they still appear within seconds
  useSafetyReload(() => arrivalsData.reload(), { isLive: () => liveSince() !== null, whenLiveMs: 2 * 60_000, whenDownMs: 15_000 });

  // Kept while the review is open, even if the list refreshes without it
  const [openArrival, setOpenArrival] = useState<Arrival | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 6000);
    return () => clearTimeout(timer);
  }, [done]);

  const open = (a: Arrival) => {
    setDone(null);
    setOpenArrival(a);
  };
  const close = () => setOpenArrival(null);

  const title = register === "VISITORS" ? "Visitors Book" : "Admission Book & Pass";
  const count = arrivals.length > 0 && (
    <span className="rounded-full bg-orange-600 px-2.5 py-0.5 text-sm font-semibold text-white tabular-nums">{arrivals.length}</span>
  );
  const spinner = arrivalsData.refreshing && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-500" aria-hidden="true" />;

  return (
    <div className={cn("mx-auto space-y-4 sm:space-y-5", showQr ? "max-w-3xl" : "max-w-[720px]")}>
      {showQr ? (
        <div className="flex flex-wrap items-center gap-3">
          {onBack && <HubBackButton onClick={onBack} />}
          <div className="min-w-[10rem] flex-1">
            <h1 className="text-2xl font-light tracking-tight text-zinc-100">{t("Show QR")}</h1>
            <p className="text-sm text-zinc-500">{t(title)}</p>
          </div>
          {/* Someone is waiting: the list is below the big QR */}
          {arrivals.length > 0 && (
            <button
              type="button"
              onClick={() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-orange-600 pl-4 pr-3 text-sm font-semibold text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)]"
            >
              {t("{n} waiting", { n: arrivals.length })}
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : onBack ? (
        <HubScreenHeader
          onBack={onBack}
          title={t("Waiting to accept")}
          subtitle={t(title)}
          count={arrivalsData.data ? arrivals.length : null}
          busy={arrivalsData.refreshing}
        />
      ) : (
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">{t("Waiting to accept")}</h1>
      )}

      {done && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-emerald-500">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="min-w-0 text-sm font-medium">{done}</p>
        </div>
      )}

      {showQr && <QrPanel register={register} />}

      {/* Visitors who sent the form and are waiting at the gate */}
      <section ref={listRef} className="scroll-mt-24 space-y-3">
        {showQr && (
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            {t("Waiting at the gate")}
            {count}
            {spinner}
          </h2>
        )}

        {arrivals.length > 0 ? (
          <ul className="space-y-2.5">
            {arrivals.map((a) => (
              <li key={a.id} className="min-w-0">
                <ArrivalRow arrival={a} onOpen={() => open(a)} />
              </li>
            ))}
          </ul>
        ) : arrivalsData.loading ? (
          <ListLoading />
        ) : arrivalsData.error ? (
          <ListError message={t("Could not load the waiting list.")} onRetry={() => void arrivalsData.reload()} />
        ) : (
          <ListEmpty icon={Users} title={t("No one is waiting at the gate")} hint={t("New visitors appear here by themselves.")} />
        )}
      </section>

      {openArrival && (
        <ArrivalReview
          key={openArrival.id}
          arrival={openArrival}
          onClose={close}
          onDone={(message) => {
            close();
            setDone(message);
            void arrivalsData.reload();
          }}
        />
      )}
    </div>
  );
}

/** One waiting visitor: a card; the card or "Review" opens the check (photo, Accept / Reject). */
function ArrivalRow({ arrival: a, onOpen }: { arrival: Arrival; onOpen: () => void }) {
  const t = useT();
  const d = a.data ?? {};
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const parts =
    a.register === "VISITORS"
      ? [
          s(d.category) && t(CATEGORY_LABEL[s(d.category)] ?? s(d.category)),
          s(d.purpose) && t(s(d.purpose)),
          s(d.vehicleNumber) && t(s(d.vehicleNumber)),
        ]
      : [s(d.admissionReporting) && t(s(d.admissionReporting)), s(d.programRequested), s(d.branch)];

  return (
    <PersonCard
      name={a.name}
      phone={a.phone}
      details={parts.filter(Boolean).join(" · ")}
      accent
      onOpen={onOpen}
      time={t("Sent at {time}", { time: formatTime(a.createdAt) })}
      chips={
        <>
          {a.hostName && (
            <span className="inline-flex max-w-full items-start gap-1 rounded-xl bg-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-600">
              <UserRound className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{t("Meeting: {name}", { name: a.hostName })}</span>
            </span>
          )}
          {a.mine ? (
            <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs font-medium text-zinc-500">{t("Your QR")}</span>
          ) : (
            <span className="max-w-full truncate rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
              {a.gate ? t("Other gate: {gate}", { gate: a.gate }) : t("Other gate")}
            </span>
          )}
        </>
      }
      action={<PersonCardAction icon={ClipboardCheck} label={t("Review")} tone="coral" onClick={onOpen} />}
    />
  );
}

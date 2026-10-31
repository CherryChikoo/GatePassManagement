"use client";

/**
 * Show QR (Visitors Book / Admission Book): a big check-in QR the visitor scans
 * with their phone camera to fill the register's form on their own phone
 * (/v/<token>, src/app/v). Below it, the visitors waiting at the gate for this
 * register; tapping one opens the review (photo, Accept / Reject).
 *
 * The QR is a signed token valid 5 minutes, fetched again a minute before it
 * runs out, and only while this screen is visible (no requests in the
 * background). The waiting list is fetched again only when the server pings
 * "arrivals" (a request sent / accepted / rejected at any gate).
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2, RefreshCw, ScanLine, UserRound } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { callGate } from "@/lib/gate-call";
import { useGateData } from "@/lib/gate-cache";
import { useLiveTopics } from "@/lib/realtime/live";
import { actionErrorMessage } from "@/lib/deployment";
import { formatTime } from "@/lib/utils";
import type { Arrival } from "@/server/actions/visit-requests";
import { ARRIVALS_TOPIC, useCheckInQrOpen, type CheckInRegister } from "./arrival-alert";
import { ArrivalReview } from "./arrival-review";

/** The token lives 5 minutes; a new one is fetched this long before it runs out */
const REFRESH_BEFORE_MS = 60_000;
const DEFAULT_TTL_MS = 5 * 60_000;
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

/** The check-in QR, refreshed before it expires while the screen is visible. */
function useCheckInQr(register: CheckInRegister, fallbackError: string) {
  const [qr, setQr] = useState<string | null>(null);
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
        const res = await callGate("getCheckInQr", [register], 15_000);
        if (cancelled) return;
        if ("error" in res) {
          setError(res.error);
          if (Date.now() >= expiresAt) setQr(null);
          later(RETRY_MS);
          return;
        }
        // Timed on this phone's clock (the phone's clock may be off from the server's)
        let ttl = Date.parse(res.expiresAt) - Date.now();
        if (!(ttl > 2 * REFRESH_BEFORE_MS && ttl <= 2 * DEFAULT_TTL_MS)) ttl = DEFAULT_TTL_MS;
        const image = await QRCode.toDataURL(`${window.location.origin}/v/${res.token}`, {
          width: 720, // drawn large: crisp dots scan faster from a screen
          margin: 4, // the standard white border scanners need
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        if (cancelled) return;
        expiresAt = Date.now() + ttl;
        setQr(image);
        setError(null);
        later(ttl - REFRESH_BEFORE_MS);
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

export function CheckInQrScreen({ register, onBack }: { register: CheckInRegister; onBack?: () => void }) {
  const t = useT();
  useCheckInQrOpen(register);
  const { qr, error: qrError, retry } = useCheckInQr(register, t("Could not load the QR. Check the connection and try again."));

  // Keeps the live connection open, so the list below refreshes by itself
  useLiveTopics([ARRIVALS_TOPIC], () => {});
  const query = arrivalsQuery(register);
  const arrivalsData = useGateData<Arrival[] | { error: string }>(query.key, query.fetch, query.topics);
  const arrivals = Array.isArray(arrivalsData.data) ? arrivalsData.data : [];

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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="group inline-flex h-12 items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900 pl-1.5 pr-5 text-[15px] font-medium text-zinc-100 shadow-card transition-[background-color,transform] hover:bg-zinc-950 active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-white transition-transform group-hover:-translate-x-0.5">
              <ArrowLeft className="h-[18px] w-[18px]" />
            </span>
            {t("Buttons")}
          </button>
        )}
        <div className="min-w-0 flex-1">
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

      {done && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-emerald-500">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{done}</p>
        </div>
      )}

      {/* The QR: as large as the screen allows */}
      <section className="rounded-3xl border border-zinc-800/80 bg-zinc-900 p-4 sm:p-6 shadow-card">
        <p className="flex items-center justify-center gap-2 text-center text-lg font-semibold leading-snug text-zinc-100">
          <ScanLine className="h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" />
          {t("Scan with your phone camera to fill the form")}
        </p>
        <div className="mx-auto mt-4 aspect-square w-full max-w-[min(30rem,calc(100dvh-18rem))] min-w-[14rem]">
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
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl bg-zinc-950/60 text-zinc-500">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">{t("Getting the QR…")}</p>
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-zinc-500">{t("The QR changes by itself every few minutes. Keep this screen open.")}</p>
      </section>

      {/* Visitors who sent the form and are waiting at the gate */}
      <section ref={listRef} className="scroll-mt-24 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
          {t("Waiting at the gate")}
          {arrivals.length > 0 && (
            <span className="rounded-full bg-orange-600 px-2.5 py-0.5 text-sm font-semibold text-white tabular-nums">{arrivals.length}</span>
          )}
          {arrivalsData.refreshing && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" aria-hidden="true" />}
        </h2>

        {arrivals.length > 0 ? (
          <ul className="space-y-2">
            {arrivals.map((a) => (
              <li key={a.id}>
                <ArrivalRow arrival={a} onOpen={() => open(a)} />
              </li>
            ))}
          </ul>
        ) : arrivalsData.loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900 px-4 py-5 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("Loading…")}
          </div>
        ) : arrivalsData.error ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="min-w-0 flex-1 text-sm font-medium">{t("Could not load the waiting list.")}</p>
            <button
              type="button"
              onClick={() => void arrivalsData.reload()}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-950"
            >
              <RefreshCw className="h-4 w-4" />
              {t("Try again")}
            </button>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/60 px-4 py-6 text-center text-sm text-zinc-500">
            {t("No one is waiting. New visitors appear here by themselves.")}
          </p>
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

/** One waiting visitor: big, one tap opens the review. */
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
  const meets = a.hostName ? t("Meeting: {name}", { name: a.hostName }) : a.officeName ? t("Office: {name}", { name: a.officeName }) : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-orange-500/30 bg-zinc-900 p-3 text-left shadow-card transition-[background-color,transform] hover:bg-zinc-950 active:scale-[0.99]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
        <UserRound className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-semibold leading-snug text-zinc-100">{a.name}</span>
        <span className="block truncate text-sm text-zinc-400 tabular-nums">{a.phone}</span>
        {parts.some(Boolean) && <span className="block truncate text-sm text-zinc-500">{parts.filter(Boolean).join(" · ")}</span>}
        {meets && <span className="block truncate text-sm font-medium text-zinc-300">{meets}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatTime(a.createdAt)}
          </span>
          {a.mine ? (
            <span className="rounded-full bg-orange-500/10 px-2 py-0.5 font-medium text-orange-500">{t("Your QR")}</span>
          ) : (
            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-medium text-zinc-400">
              {a.gate ? t("Other gate: {gate}", { gate: a.gate }) : t("Other gate")}
            </span>
          )}
        </span>
      </span>
      <span className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-orange-600 pl-4 pr-3 text-sm font-semibold text-white">
        {t("Check")}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  );
}

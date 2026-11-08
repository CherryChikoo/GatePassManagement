"use client";

/**
 * Car Book / Auto Book board: one card per car (or auto driver) from the book's
 * records, with where it is — inside or "Out since …" — and one big button:
 * Mark Out / Mark In. Mark completes the vehicle's open record (one trip = one
 * record) or starts a new one. "+ New" adds a car / auto the book has not seen.
 */
import { useState } from "react";
import { Car, CarTaxiFront, CheckCircle2, History, Loader2, LogIn, LogOut, Plus, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { registerMessage } from "./localize";
import { Modal } from "@/components/ui/primitives";
import { PagerBar } from "@/components/ui/pager-bar";
import { useGateData } from "@/lib/gate-cache";
import { callGate } from "@/lib/gate-call";
import { actionErrorMessage } from "@/lib/deployment";
import { cn, formatTime } from "@/lib/utils";
import type { CarOnBoard } from "@/server/actions/registers";
import { newClientToken } from "./format";
import { QuickEntryModal } from "./quick-entry";

/** Cards per page */
const PER_PAGE = 6;

export function CarBoard({ registerKey = "CAR_BOOK", canAct }: { registerKey?: "CAR_BOOK" | "AUTO_IN_OUT"; canAct: boolean }) {
  const t = useT();
  const auto = registerKey === "AUTO_IN_OUT";
  const { data, reload } = useGateData<{ cars?: CarOnBoard[]; error?: string }>(
    `board|${registerKey}`,
    () => callGate("getCarBoard", [registerKey], 15_000) as Promise<{ cars?: CarOnBoard[]; error?: string }>,
    [`reg:${registerKey}`]
  );
  // A tap shows at once; the reloaded board replaces it
  const [moved, setMoved] = useState<Record<string, { state: "in" | "out"; since: string }>>({});
  const [ask, setAsk] = useState<{ car: CarOnBoard; dir: "IN" | "OUT" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  // Autos going out: the reason, every time
  const [reason, setReason] = useState("");
  const [reasonMissing, setReasonMissing] = useState(false);
  const needsReason = (dir: "IN" | "OUT") => auto && dir === "OUT";

  const cars = (data?.cars ?? []).map((c) => {
    const m = moved[c.key];
    // The local tap until the server's board agrees
    return m && m.state !== c.state ? { ...c, state: m.state, since: m.since, openId: null, openNext: null } : c;
  });
  const pages = Math.max(1, Math.ceil(cars.length / PER_PAGE));
  const current = Math.min(page, pages);
  const shown = cars.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const Icon = auto ? CarTaxiFront : Car;

  const mark = async (car: CarOnBoard, dir: "IN" | "OUT", why = "") => {
    setBusy(car.key);
    setError(null);
    setMoved((s) => ({ ...s, [car.key]: { state: dir === "OUT" ? "out" : "in", since: new Date().toISOString() } }));
    const token = newClientToken();
    // The vehicle's open record waiting for this side: complete it; otherwise a new record
    const res: any = await (car.openId && car.openNext === dir
      ? callGate("completeRegisterEntry", [car.openId, { markMovement: true, ...(why ? { reason: why } : {}) }, token])
      : callGate("createRegisterEntry", [registerKey, { fields: { ...car.fill, ...(why ? { purpose: why, outReason: why } : {}) }, direction: dir }, token])
    ).catch((e) => ({ error: actionErrorMessage(e, "Could not save. Please try again.") }));
    setBusy(null);
    if (res?.error) {
      setError(registerMessage(t, String(res.error)));
      setMoved((s) => {
        const next = { ...s };
        delete next[car.key];
        return next;
      });
    }
    reload();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
          <Icon className="h-5 w-5 text-purple-700" aria-hidden="true" /> {t(auto ? "Autos" : "Cars")}
          {cars.length > 0 && <span className="font-semibold text-zinc-400 tabular-nums">({cars.length})</span>}
        </h2>
        {canAct && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-orange-600 px-4 text-base font-bold text-white shadow-card hover:bg-orange-700 active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" /> {t(auto ? "New auto" : "New car")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 px-2 text-xs font-semibold hover:underline">
            OK
          </button>
        </p>
      )}
      {data && cars.length === 0 && (
        <p className="rounded-3xl border border-zinc-800 bg-zinc-900 px-4 py-8 text-center text-base text-zinc-500 shadow-card">
          {t(auto ? "No autos yet. Add one with “New auto”." : "No cars yet. Add one with “New car”.")}
        </p>
      )}
      {!data && <div className="h-40 animate-pulse rounded-3xl bg-zinc-900" aria-hidden="true" />}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => {
          const out = c.state === "out";
          const dir: "IN" | "OUT" = out ? "IN" : "OUT";
          return (
            <li
              key={c.key}
              className={cn(
                "space-y-3 rounded-3xl border-[1.5px] bg-zinc-900 p-4 shadow-card",
                out ? "border-sky-500/40" : "border-emerald-500/40"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-700">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-lg font-bold leading-snug text-zinc-100">{c.name || c.number}</span>
                  {c.name && c.number && <span className="block break-words text-base font-semibold tracking-wide text-zinc-400">{c.number}</span>}
                </span>
              </div>
              <p className={cn("flex items-center gap-2 text-base font-bold", out ? "text-sky-700" : "text-emerald-700")}>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", out ? "bg-sky-500" : "bg-emerald-500")} aria-hidden="true" />
                {out
                  ? c.since
                    ? t("Out since {time}", { time: formatTime(c.since) })
                    : t("Out")
                  : auto
                  ? c.since
                    ? t("Inside since {time}", { time: formatTime(c.since) })
                    : t("Inside")
                  : t("On campus")}
              </p>
              {canAct && (
                <button
                  type="button"
                  disabled={busy === c.key}
                  onClick={() => {
                    setReason("");
                    setReasonMissing(false);
                    setAsk({ car: c, dir });
                  }}
                  className={cn(
                    "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold text-white shadow-card transition-[background-color,transform] active:scale-[0.98] disabled:opacity-60",
                    out ? "bg-emerald-600 hover:bg-emerald-700" : "bg-sky-600 hover:bg-sky-700"
                  )}
                >
                  {busy === c.key ? <Loader2 className="h-5 w-5 animate-spin" /> : out ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                  {out ? t("Mark In") : t("Mark Out")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {cars.length > PER_PAGE && (
        <PagerBar inline page={current} pageSize={PER_PAGE} total={cars.length} onPageChange={setPage} itemLabel={t(auto ? "autos" : "cars")} />
      )}

      {/* Confirm: the vehicle, and the action in its own colour (blue Out / green In) */}
      <Modal open={!!ask} onClose={() => setAsk(null)} title={ask ? (ask.dir === "OUT" ? t("Mark Out now?") : t("Mark In now?")) : ""} className="max-w-md border-2 border-orange-500/80">
        {ask && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-950 px-4 py-3">
              <span
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                  ask.dir === "OUT" ? "bg-sky-500/15 text-sky-700" : "bg-emerald-500/15 text-emerald-700"
                )}
              >
                {ask.dir === "OUT" ? <LogOut className="h-7 w-7" aria-hidden="true" /> : <LogIn className="h-7 w-7" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="block break-words text-xl font-bold text-zinc-100">{ask.car.name || ask.car.number}</span>
                {ask.car.name && ask.car.number && <span className="block text-base font-semibold tracking-wide text-zinc-400">{ask.car.number}</span>}
              </span>
            </div>
            {needsReason(ask.dir) && (
              <div className="space-y-1.5">
                <label htmlFor="board-reason" className="field-label block text-base font-semibold text-zinc-200">
                  {t("Reason for going out")} <span className="text-orange-500">*</span>
                </label>
                <input
                  id="board-reason"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  maxLength={200}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setReasonMissing(false);
                  }}
                  className={cn(
                    "flex h-14 w-full rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-900 px-4 text-lg text-zinc-100 outline-none focus:border-orange-500",
                    reasonMissing && "!border-red-500"
                  )}
                />
                {/* The last reason, one tap */}
                {ask.car.fill.purpose && ask.car.fill.purpose !== reason && (
                  <button
                    type="button"
                    onClick={() => {
                      setReason(ask.car.fill.purpose);
                      setReasonMissing(false);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border-[1.5px] border-dashed border-zinc-600 bg-zinc-950 px-3 py-2 text-left text-base text-zinc-200 hover:bg-zinc-900"
                  >
                    <History className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                    <span className="shrink-0 text-sm text-zinc-500">{t("Last:")}</span>
                    <span className="min-w-0 break-words font-semibold">{ask.car.fill.purpose}</span>
                  </button>
                )}
                {reasonMissing && <p role="alert" className="text-sm font-medium text-red-600">{t("Enter the reason for going out")}</p>}
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const a2 = ask;
                  if (needsReason(a2.dir) && !reason.trim()) {
                    setReasonMissing(true);
                    return;
                  }
                  setAsk(null);
                  void mark(a2.car, a2.dir, needsReason(a2.dir) ? reason.trim() : "");
                }}
                className={cn(
                  "flex h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-lg font-bold text-white shadow-card active:scale-[0.98]",
                  ask.dir === "OUT" ? "bg-sky-600 hover:bg-sky-700" : "bg-emerald-600 hover:bg-emerald-700"
                )}
              >
                {ask.dir === "OUT" ? <LogOut className="h-5 w-5 shrink-0" /> : <LogIn className="h-5 w-5 shrink-0" />}
                {ask.dir === "OUT" ? t("Mark Out") : t("Mark In")}
              </button>
              <button
                type="button"
                onClick={() => setAsk(null)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-500 bg-red-50 font-bold text-red-600 hover:bg-red-100 text-base"
              >
                <X className="h-5 w-5 shrink-0" /> {t("Cancel")}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* A car / auto the book has not seen: the usual form, once */}
      {adding && (
        <QuickEntryModal
          registerKey={registerKey}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </section>
  );
}

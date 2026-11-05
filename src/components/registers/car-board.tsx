"use client";

/**
 * Car Book board: one card per car (from the book's records) with where it is —
 * "On campus" or "Out since …" — and one big button: Mark Out / Mark In.
 * Mark In completes the car's open record (one trip = one record); Mark Out
 * starts a new one. Cars added later (new car via the form) appear by themselves.
 */
import { useState } from "react";
import { Car, CheckCircle2, Loader2, LogIn, LogOut, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Modal } from "@/components/ui/primitives";
import { useGateData } from "@/lib/gate-cache";
import { callGate } from "@/lib/gate-call";
import { actionErrorMessage } from "@/lib/deployment";
import { cn, formatTime } from "@/lib/utils";
import type { CarOnBoard } from "@/server/actions/registers";
import { newClientToken } from "./format";

const KEY = "car-board";
const LIVE = ["reg:CAR_BOOK"];

export function CarBoard({ canAct }: { canAct: boolean }) {
  const t = useT();
  const { data, reload } = useGateData<{ cars?: CarOnBoard[]; error?: string }>(
    KEY,
    () => callGate("getCarBoard", [], 15_000) as Promise<{ cars?: CarOnBoard[]; error?: string }>,
    LIVE
  );
  // A tap shows at once; the reloaded board replaces it
  const [moved, setMoved] = useState<Record<string, { state: "in" | "out"; since: string }>>({});
  const [ask, setAsk] = useState<{ car: CarOnBoard; dir: "IN" | "OUT" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cars = (data?.cars ?? []).map((c) => {
    const m = moved[c.key];
    // The local tap until the server's board agrees
    return m && m.state !== c.state ? { ...c, state: m.state, since: m.since, openId: null, openNext: null } : c;
  });
  if (!data?.cars?.length) return null;

  const mark = async (car: CarOnBoard, dir: "IN" | "OUT") => {
    setBusy(car.key);
    setError(null);
    setMoved((s) => ({ ...s, [car.key]: { state: dir === "OUT" ? "out" : "in", since: new Date().toISOString() } }));
    const token = newClientToken();
    // The car's open record waiting for this side: complete it; otherwise a new record
    const res: any = await (car.openId && car.openNext === dir
      ? callGate("completeRegisterEntry", [car.openId, { markMovement: true }, token])
      : callGate("createRegisterEntry", ["CAR_BOOK", { fields: { vehicleName: car.name, vehicleNumber: car.number }, direction: dir }, token])
    ).catch((e) => ({ error: actionErrorMessage(e, "Could not save. Please try again.") }));
    setBusy(null);
    if (res?.error) {
      setError(t(String(res.error)));
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
      <h2 className="flex items-center gap-2 px-1 text-lg font-bold text-zinc-100">
        <Car className="h-5 w-5 text-purple-700" aria-hidden="true" /> {t("Cars")}
      </h2>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 px-2 text-xs font-semibold hover:underline">
            OK
          </button>
        </p>
      )}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cars.map((c) => {
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
                  <Car className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-lg font-bold leading-snug text-zinc-100">{c.name || c.number}</span>
                  {c.name && c.number && <span className="block text-base font-semibold tracking-wide text-zinc-400">{c.number}</span>}
                </span>
              </div>
              <p className={cn("flex items-center gap-2 text-base font-bold", out ? "text-sky-700" : "text-emerald-700")}>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", out ? "bg-sky-500" : "bg-emerald-500")} aria-hidden="true" />
                {out ? (c.since ? t("Out since {time}", { time: formatTime(c.since) }) : t("Out")) : t("On campus")}
              </p>
              {canAct && (
                <button
                  type="button"
                  disabled={busy === c.key}
                  onClick={() => setAsk({ car: c, dir })}
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

      {/* Confirm: the car, and the action in its own colour (blue Out / green In) */}
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
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAsk(null)}
                className="flex h-14 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-900 text-base font-semibold text-zinc-100 hover:bg-zinc-950"
              >
                <X className="h-5 w-5" /> {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const a2 = ask;
                  setAsk(null);
                  void mark(a2.car, a2.dir);
                }}
                className={cn(
                  "flex h-14 items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-card active:scale-[0.98]",
                  ask.dir === "OUT" ? "bg-sky-600 hover:bg-sky-700" : "bg-emerald-600 hover:bg-emerald-700"
                )}
              >
                {ask.dir === "OUT" ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                {ask.dir === "OUT" ? t("Mark Out") : t("Mark In")}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <p className="flex items-center gap-1.5 px-1 text-sm text-zinc-500">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("A new car? Add it once with “New entry” below.")}
      </p>
    </section>
  );
}

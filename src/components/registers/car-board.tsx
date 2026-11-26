"use client";

/**
 * Car Book / Auto Book board: one card per car (or auto driver) from the book's
 * records, with where it is — inside or "Out since …" — and one big button:
 * Mark Out / Mark In. Mark completes the vehicle's open record (one trip = one
 * record) or starts a new one. "+ New" adds a car / auto the book has not seen.
 */
import { useState } from "react";
import { useMinuteClock } from "@/components/visits/hub-tiles";
import { Car, CarTaxiFront, CheckCircle2, History, Loader2, LogIn, LogOut, Plus, X, Timer } from "lucide-react";
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
  // One page number per column (In / Out)
  const [pages, setPages] = useState<{ in: number; out: number }>({ in: 1, out: 1 });
  // "Out 2 h 10 min" moves on by itself each minute (no requests)
  const now = useMinuteClock(true);
  const [adding, setAdding] = useState(false);
  // Tapped card: its details
  const [shown, setShown] = useState<CarOnBoard | null>(null);
  // Autos going out: the reason, every time
  const [reason, setReason] = useState("");
  const [reasonMissing, setReasonMissing] = useState(false);
  const needsReason = (dir: "IN" | "OUT") => auto && dir === "OUT";

  const cars = (data?.cars ?? []).map((c) => {
    const m = moved[c.key];
    // The local tap until the server's board agrees
    return m && m.state !== c.state ? { ...c, state: m.state, since: m.since, openId: null, openNext: null } : c;
  });

  const Icon = auto ? CarTaxiFront : Car;

  const mark = async (car: CarOnBoard, dir: "IN" | "OUT", why = "") => {
    setBusy(car.key);
    setError(null);
    setMoved((s) => ({ ...s, [car.key]: { state: dir === "OUT" ? "out" : "in", since: new Date().toISOString() } }));
    const token = newClientToken();
    // The vehicle's open record waiting for this side: complete it; otherwise a new record
    const res: any = await (car.openId && car.openNext === dir
      ? callGate("completeRegisterEntry", [car.openId, { markMovement: true, ...(why ? { reason: why } : {}) }, token])
      : callGate("createRegisterEntry", [
          registerKey,
          {
            // Autos: a new In record needs a purpose — the tap itself says it (the reason is asked only going out)
            fields: { ...car.fill, ...(why ? { purpose: why, outReason: why } : auto && dir === "IN" ? { purpose: "Came in" } : {}) },
            direction: dir,
          },
          token,
        ])
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

  /** "2 h 10 min" since a time (moves on each minute) */
  const longFor = (since: string) => {
    const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
    if (mins < 60) return t("{m} min", { m: mins });
    const h = Math.floor(mins / 60);
    if (h < 24) return mins % 60 ? t("{h} h {m} min", { h, m: mins % 60 }) : t("{h} h", { h });
    return t("{d} d {h} h", { d: Math.floor(h / 24), h: h % 24 });
  };

  /** One vehicle: name, number, since when, and Mark In / Mark Out */
  const card = (c: CarOnBoard) => {
          const out = c.state === "out";
      const dir: "IN" | "OUT" = out ? "IN" : "OUT";
      return (
        <li
          key={c.key}
          onClick={() => setShown(c)}
          className={cn(
            "cursor-pointer space-y-3 rounded-2xl bg-zinc-900 p-4 shadow-card"
          )}
        >
          <div className="min-w-0">
              <span className="block break-words text-lg font-bold leading-snug text-zinc-100">{c.name || c.number}</span>
              {c.name && c.number && <span className="block break-words text-base font-semibold tracking-wide text-zinc-400">{c.number}</span>}
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
          {c.since && (out || auto) && (
            <p className="flex items-center gap-1.5 text-base font-bold tabular-nums text-amber-800">
              <Timer className="h-4 w-4" aria-hidden="true" /> {longFor(c.since)}
            </p>
          )}
          {canAct && (
            <button
              type="button"
              disabled={busy === c.key}
              onClick={(e) => {
                e.stopPropagation();
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
  };

  return (
    <section className="space-y-3">
      {shown && (
        <Modal open onClose={() => setShown(null)} title={shown.name || shown.number} className="max-w-xl">
          <div className="space-y-4">
            <p className={cn("flex items-center gap-2 text-lg font-bold", shown.state === "out" ? "text-sky-700" : "text-emerald-700")}>
              <span className={cn("h-3 w-3 shrink-0 rounded-full", shown.state === "out" ? "bg-sky-500" : "bg-emerald-500")} aria-hidden="true" />
              {shown.state === "out"
                ? shown.since ? t("Out since {time}", { time: formatTime(shown.since) }) : t("Out")
                : shown.since ? t("Inside since {time}", { time: formatTime(shown.since) }) : t("Inside")}
              {shown.since && <span className="text-amber-800 tabular-nums">· {longFor(shown.since)}</span>}
            </p>
            <dl className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
              {shown.details.map((x) => (
                <div key={x.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-3">
                  <dt className="text-base font-semibold text-zinc-400">{t(x.label)}</dt>
                  <dd className="break-words text-lg font-bold text-zinc-100">{t(x.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Modal>
      )}
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
      {/* In and Out side by side (one above the other on phones): each column lists only its vehicles */}
      {cars.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["in", "out"] as const).map((col) => {
            const list = cars.filter((c) => c.state === col);
            const total = Math.max(1, Math.ceil(list.length / PER_PAGE));
            const cur = Math.min(pages[col], total);
            const shown = list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
            const isOut = col === "out";
            return (
              <section
                key={col}
                // No fill: a dashed border in the column's colour (green In / blue Out)
                className={cn("space-y-3 rounded-3xl border-2 border-dashed p-3 sm:p-4", isOut ? "border-sky-500" : "border-emerald-500")}
              >
                <h3 className={cn("flex items-center gap-2 px-1 text-xl font-bold", isOut ? "text-sky-700" : "text-emerald-700")}>
                  {isOut ? <LogOut className="h-5 w-5" aria-hidden="true" /> : <LogIn className="h-5 w-5" aria-hidden="true" />}
                  {isOut ? t("Out") : t("In")}
                  <span className={cn("rounded-full px-2.5 text-base tabular-nums text-white", isOut ? "bg-sky-600" : "bg-emerald-600")}>{list.length}</span>
                </h3>
                {list.length === 0 ? (
                  <p className="px-1 py-4 text-base font-semibold text-zinc-500">
                    {isOut ? t(auto ? "No autos are out now." : "No cars are out now.") : t(auto ? "No autos are in now." : "No cars are in now.")}
                  </p>
                ) : (
                  <ul className="space-y-3">{shown.map((c) => card(c))}</ul>
                )}
                {list.length > PER_PAGE && (
                  <PagerBar inline page={cur} pageSize={PER_PAGE} total={list.length} onPageChange={(p) => setPages((x) => ({ ...x, [col]: p }))} itemLabel={t(auto ? "autos" : "cars")} />
                )}
              </section>
            );
          })}
        </div>
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
                <label htmlFor="board-reason" className="field-label block text-lg font-bold text-zinc-100">
                  {t("Reason for going out")} <span className="text-orange-500">*</span>
                </label>
                <textarea
                  id="board-reason"
                  autoFocus
                  autoComplete="off"
                  maxLength={200}
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setReasonMissing(false);
                  }}
                  className={cn(
                    "flex min-h-[7rem] w-full resize-none rounded-2xl border-2 border-zinc-600 bg-zinc-900 px-4 py-3 text-xl text-zinc-100 outline-none focus:border-orange-500",
                    reasonMissing && "!border-emerald-500 !bg-emerald-50"
                  )}
                />
                {reasonMissing && <p role="alert" className="text-base font-bold text-emerald-700">{t("Enter the reason for going out")}</p>}
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

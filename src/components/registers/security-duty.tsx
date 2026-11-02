"use client";

/**
 * Security Daily Book: the duty plan. Pick a date (today or later), pick
 * shift A / B / C, add or remove security staff. Ranks are shown; a person in
 * two shifts of a day is marked Overtime. Past days are read-only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { liveSince } from "@/lib/realtime/live";
import { useSafetyReload } from "@/lib/realtime/safety-reload";
import { Check, ChevronLeft, ChevronRight, Lock, Plus, Search, Users, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Modal } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { DateField } from "@/components/ui/date-field";
import { LoadingPill } from "@/components/ui/loading-pill";
import { prefetchGateData, useGateData } from "@/lib/gate-cache";
import { callGate } from "@/lib/gate-call";
import { actionErrorMessage } from "@/lib/deployment";
import { istDateString } from "@/lib/time/ist";
import { cn, formatTime } from "@/lib/utils";
import { addSecurityDuty, removeSecurityDuty, saveSecurityDutyRemark } from "@/server/actions/security-duty";
import { formatInstant } from "./format";

type Shift = "A" | "B" | "C";
const SHIFTS: Shift[] = ["A", "B", "C"];
type Duty = { id: string; shift: Shift; staffId: string; name: string; rank: string; startedAt?: string | null; endedAt?: string | null };
type Staff = { id: string; name: string; rank: string };
type Remark = { text: string; by: string; at: string } | null;
type DayData = { success: boolean; date: string; today: string; editable: boolean; duties: Duty[]; staff: Staff[]; remark?: Remark } | { error: string };

const LIVE = ["reg:SECURITY_DAILY"];
const shiftDate = (date: string, days: number) => istDateString(new Date(new Date(`${date}T12:00:00+05:30`).getTime() + days * 86_400_000));

const dutyKey = (date: string) => `security-duty|${date}`;
const loadDutyDay = (date: string) => () => callGate("getSecurityDutyDay", [date], 15_000) as Promise<DayData>;
/** Warm a date's plan before the screen opens (no request while the kept copy is fresh). */
export function prefetchSecurityDuty(date = istDateString()) {
  prefetchGateData(dutyKey(date), loadDutyDay(date), LIVE);
}

function RankBadge({ rank }: { rank: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-bold tracking-wide text-orange-600">
      {rank}
    </span>
  );
}

export function SecurityDutyView() {
  const t = useT();
  const today = istDateString();
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState<Shift>("A");
  const { data, error, loading, reload } = useGateData<DayData>(dutyKey(date), loadDutyDay(date), LIVE);
  useDutyRefresh(reload);
  const day = data && "success" in data ? data : null;
  const loadError = error ?? (data && "error" in data ? data.error : null);
  const editable = !!day?.editable;

  // Planning is mostly for tomorrow: warm it quietly once today's plan is shown
  const loaded = !!day;
  useEffect(() => {
    if (loaded) prefetchSecurityDuty(shiftDate(date, 1));
  }, [loaded, date]);

  // Adds / removes show at once and stay until a loaded copy of the day has them
  // (a refresh that started before the save finished must not make them vanish)
  type Change = { id: string; duty?: Duty; saved: boolean };
  const [pending, setPending] = useState<{ date: string; adds: Change[]; removes: Change[] }>({ date, adds: [], removes: [] });
  const server = useMemo(() => day?.duties ?? [], [day]);
  const hasDuty = (x: Duty) => server.some((d) => d.staffId === x.staffId && d.shift === x.shift);
  if (pending.date !== date) {
    setPending({ date, adds: [], removes: [] });
  } else if (
    pending.adds.some((p) => p.saved && hasDuty(p.duty!)) ||
    pending.removes.some((p) => p.saved && !server.some((d) => d.id === p.id))
  ) {
    // The loaded copy now shows the change: the local one is no longer needed
    setPending((p) => ({
      ...p,
      adds: p.adds.filter((x) => !(x.saved && hasDuty(x.duty!))),
      removes: p.removes.filter((x) => !(x.saved && !server.some((d) => d.id === x.id))),
    }));
  }
  const duties = useMemo(() => {
    if (pending.date !== date) return server;
    const kept = server.filter((d) => !pending.removes.some((r) => r.id === d.id));
    const extra = pending.adds.map((p) => p.duty!).filter((x) => !kept.some((d) => d.staffId === x.staffId && d.shift === x.shift));
    return [...kept, ...extra];
  }, [server, pending, date]);

  // Shifts each person is in on this date (for Overtime)
  const shiftsOf = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const d of duties) m.set(d.staffId, [...(m.get(d.staffId) ?? []), d.shift]);
    return m;
  }, [duties]);
  const inShift = duties.filter((d) => d.shift === shift);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [remove, setRemove] = useState<Duty | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const add = async (st: Staff) => {
    const temp: Duty = { id: `tmp-${st.id}-${shift}`, shift, staffId: st.id, name: st.name, rank: st.rank };
    setActionError(null);
    setPending((p) => ({ ...p, adds: [...p.adds.filter((x) => x.id !== temp.id), { id: temp.id, duty: temp, saved: false }] }));
    const res: any = await addSecurityDuty({ date, shift, staffId: st.id }).catch((e) => ({
      error: actionErrorMessage(e, "Could not save. Please try again."),
    }));
    if (res?.error) {
      setActionError(t(res.error));
      setPending((p) => ({ ...p, adds: p.adds.filter((x) => x.id !== temp.id) }));
      return;
    }
    // Saved: kept on screen until the reloaded day shows it
    setPending((p) => ({ ...p, adds: p.adds.map((x) => (x.id === temp.id ? { ...x, saved: true } : x)) }));
    reload();
  };

  const takeOff = async (d: Duty) => {
    setActionError(null);
    setPending((p) => ({ ...p, removes: [...p.removes.filter((x) => x.id !== d.id), { id: d.id, saved: false }] }));
    const res: any = await removeSecurityDuty(d.id).catch((e) => ({ error: actionErrorMessage(e, "Could not save. Please try again.") }));
    if (res?.error) {
      setActionError(t(res.error));
      setPending((p) => ({ ...p, removes: p.removes.filter((x) => x.id !== d.id) }));
      return;
    }
    setPending((p) => ({ ...p, removes: p.removes.map((x) => (x.id === d.id ? { ...x, saved: true } : x)) }));
    reload();
  };

  const q = query.trim().toLowerCase();
  const choices = (day?.staff ?? []).filter((s) => !q || s.name.toLowerCase().includes(q));

  const tomorrow = shiftDate(today, 1);
  // Today / Tomorrow: small two-part switch inside the date card
  const dayBtn = (on: boolean) =>
    cn(
      "flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-colors",
      on ? "border-orange-500/40 bg-orange-500/10 text-orange-600" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
    );
  const arrowBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-zinc-300 transition-colors hover:text-zinc-100 active:scale-95";

  return (
    <div className="w-full space-y-4">
      <LoadingPill active={loading} />

      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4 lg:sticky lg:top-24">
      {/* Date: one card — arrows around the date, Today / Tomorrow under it */}
      <section className="space-y-3 rounded-3xl border border-zinc-800/80 bg-zinc-900 p-3 shadow-card">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t("Previous day")} onClick={() => setDate((d) => shiftDate(d, -1))} className={arrowBtn}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <DateField
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-full border border-transparent bg-zinc-950 px-4 text-base font-semibold text-zinc-100 [color-scheme:light] outline-none focus:border-orange-500/50"
          />
          <button type="button" aria-label={t("Next day")} onClick={() => setDate((d) => shiftDate(d, 1))} className={arrowBtn}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={date === today} onClick={() => setDate(today)} className={dayBtn(date === today)}>
            {t("Today")}
          </button>
          <button type="button" aria-pressed={date === tomorrow} onClick={() => setDate(tomorrow)} className={dayBtn(date === tomorrow)}>
            {t("Tomorrow")}
          </button>
        </div>
      </section>

      {/* Shifts: three separate buttons; the chosen one outlined in coral */}
      <div role="tablist" aria-label={t("Shift")} className="grid grid-cols-3 gap-2">
        {SHIFTS.map((x) => {
          const on = x === shift;
          const count = duties.filter((d) => d.shift === x).length;
          return (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setShift(x)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-2xl border-2 px-2 py-1.5 shadow-card transition-[background-color,border-color,color,transform] active:scale-[0.98]",
                on ? "border-orange-500 bg-orange-500/10 text-orange-600" : "border-transparent bg-zinc-900 text-zinc-300 hover:border-zinc-800"
              )}
            >
              <span className="text-base font-bold">{t("Shift {s}", { s: x })}</span>
              <span className={cn("text-xs font-medium tabular-nums", on ? "text-orange-600/80" : "text-zinc-500")}>
                {count > 0 ? <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{count}</span> : "—"}
              </span>
            </button>
          );
        })}
      </div>

      </div>
      <div className="min-w-0 space-y-4">
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span>{t(loadError)}</span>
          <button type="button" onClick={reload} className="h-10 rounded-full bg-red-500/10 px-4 text-sm font-semibold text-red-500 hover:bg-red-500/20">
            {t("Try again")}
          </button>
        </div>
      )}
      {actionError && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span className="min-w-0 flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="shrink-0 px-2 text-xs font-semibold hover:underline">
            OK
          </button>
        </p>
      )}

      {/* The chosen shift: its people, and "Add security" as the card's last row */}
      {day && (
        <section className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card">
          <header className="flex items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-3">
            <p className="text-base font-semibold text-zinc-100">{t("Shift {s}", { s: shift })}</p>
            {!editable && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-zinc-500">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> {t("View only")}
              </span>
            )}
          </header>
          {inShift.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">{t("Nobody in this shift yet.")}</p>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {inShift.map((d) => {
                const others = (shiftsOf.get(d.staffId) ?? []).filter((x) => x !== shift);
                const saving = d.id.startsWith("tmp-");
                return (
                  <li key={d.id} className={cn("flex min-h-16 items-center gap-3 px-4 py-2.5 transition-opacity", saving && "opacity-60")}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-sm font-bold text-orange-600" aria-hidden="true">
                      {d.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-base font-medium leading-snug text-zinc-100">{d.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <RankBadge rank={d.rank} />
                        {others.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                            {t("Overtime")} · {others.join(", ")}
                          </span>
                        )}
                      </span>
                      <DutyStatus duty={d} today={date === today} line />
                    </span>
                    {editable && !saving && !d.startedAt && (
                      <button
                        type="button"
                        aria-label={t("Remove")}
                        onClick={() => setRemove(d)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setAdding(true);
              }}
              className="flex h-14 w-full items-center justify-center gap-2 border-t border-zinc-800/70 text-base font-semibold text-orange-600 transition-colors hover:bg-orange-500/5 active:bg-orange-500/10"
            >
              <Plus className="h-5 w-5" /> {t("Add security")}
            </button>
          )}
        </section>
      )}

      {/* Remarks for the whole day (optional) */}
      {day && (
        <DayRemarks
          key={`${date}|${day.remark?.at ?? ""}`}
          date={date}
          remark={day.remark ?? null}
          editable={editable}
          onSaved={reload}
        />
      )}

      </div>
      </div>

      {/* Add security: searchable list; stays open to add several */}
      <Modal open={adding} onClose={() => setAdding(false)} title={`${t("Add security")} — ${t("Shift {s}", { s: shift })}`} className="max-w-lg">
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search name")}
              className="h-12 w-full rounded-full border border-zinc-800 bg-zinc-950 pl-11 pr-4 text-base text-zinc-100 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
          </label>
          <ul className="max-h-[55dvh] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800 divide-y divide-zinc-800/70">
            {choices.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-zinc-500">{t("No one else to add.")}</li>
            ) : (
              choices.map((s) => {
                const other = (shiftsOf.get(s.id) ?? []).filter((x) => x !== shift);
                const added = inShift.some((d) => d.staffId === s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => add(s)}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                        added ? "bg-emerald-500/10" : "hover:bg-zinc-950"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words text-base text-zinc-100">{s.name}</span>
                          <RankBadge rank={s.rank} />
                        </span>
                        {other.length > 0 && (
                          <span className="mt-0.5 block text-xs font-medium text-amber-600">
                            {t("In shift {s}", { s: other.join(", ") })} — {t("Overtime")}
                          </span>
                        )}
                      </span>
                      {added ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("Added")}
                        </span>
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600">
                          <Plus className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 text-base font-semibold text-white shadow-card transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98]"
          >
            <Check className="h-5 w-5" /> {t("Done")}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={t("Remove from shift {s}?", { s: shift })}
        description={remove?.name ?? ""}
        confirmText={t("Remove")}
        cancelText={t("Go Back")}
        variant="danger"
        onConfirm={() => {
          const d = remove;
          setRemove(null);
          if (d) void takeOff(d);
        }}
      />
    </div>
  );
}

/** The day's remarks: anyone planning can write or change them (today and later); past days read-only. */
function DayRemarks({ date, remark, editable, onSaved }: { date: string; remark: Remark; editable: boolean; onSaved: () => void }) {
  const t = useT();
  const savedText = remark?.text ?? "";
  const [draft, setDraft] = useState(savedText);
  const [shown, setShown] = useState(savedText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = draft.trim() !== shown.trim();

  const save = async () => {
    if (saving || !changed) return;
    setSaving(true);
    setError(null);
    const before = shown;
    setShown(draft); // shows as saved at once
    const res: any = await saveSecurityDutyRemark(date, draft).catch((e) => ({ error: actionErrorMessage(e, "Could not save. Please try again.") }));
    setSaving(false);
    if (res?.error) {
      setShown(before);
      setError(t(res.error));
      return;
    }
    onSaved();
  };

  return (
    <section className="space-y-3 rounded-3xl border border-zinc-800/80 bg-zinc-900 p-4 shadow-card">
      <p className="text-base font-semibold text-zinc-100">{t("Remarks for this day")}</p>
      {editable ? (
        <>
          <textarea
            value={draft}
            maxLength={1000}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("Anything to note for this day (optional)")}
            className="w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-base text-zinc-100 outline-none transition-colors focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
          />
          {changed && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 text-base font-semibold text-white transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98] disabled:opacity-60"
            >
              <Check className="h-5 w-5" /> {t("Save remarks")}
            </button>
          )}
        </>
      ) : (
        <p className={cn("whitespace-pre-wrap break-words text-base", shown ? "text-zinc-100" : "text-zinc-500")}>{shown || t("No remarks")}</p>
      )}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {remark && remark.text && !changed && (
        <p className="text-xs text-zinc-500">
          {remark.by} · {formatInstant(remark.at)}
        </p>
      )}
    </section>
  );
}

/** Start / End of one duty: On duty since …, Done …–…, or Not started (today only) */
export function DutyStatus({
  duty,
  today,
  line = false,
}: {
  duty: { startedAt?: string | null; endedAt?: string | null };
  today: boolean;
  /** A text line with a coloured dot (lists) instead of a chip */
  line?: boolean;
}) {
  const t = useT();
  if (line) {
    const state = duty.startedAt && duty.endedAt ? "done" : duty.startedAt ? "on" : today ? "waiting" : null;
    if (!state) return null;
    return (
      <span
        className={cn(
          "mt-1 flex items-center gap-1.5 text-xs font-medium tabular-nums",
          state === "on" ? "text-emerald-600" : state === "done" ? "text-zinc-500" : "text-zinc-400"
        )}
      >
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", state === "on" ? "bg-emerald-500" : state === "done" ? "bg-zinc-400" : "bg-zinc-300")}
          aria-hidden="true"
        />
        {state === "on"
          ? `${t("On duty")} · ${formatTime(duty.startedAt!)}`
          : state === "done"
          ? `${t("Done")} · ${formatTime(duty.startedAt!)} – ${formatTime(duty.endedAt!)}`
          : t("Not started")}
      </span>
    );
  }
  if (duty.startedAt && duty.endedAt)
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-950 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 tabular-nums">
        {t("Done")} · {formatTime(duty.startedAt)} – {formatTime(duty.endedAt)}
      </span>
    );
  if (duty.startedAt)
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 tabular-nums">
        {t("On duty")} · {formatTime(duty.startedAt)}
      </span>
    );
  if (!today) return null;
  return <span className="inline-flex items-center rounded-full bg-zinc-950 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">{t("Not started")}</span>;
}

/**
 * A screen others change (duty plan, My shift): fresh when the guard comes back
 * to the tab / phone screen, plus a small safety refresh in case a live ping was
 * missed (background tab, phone asleep). Live pings still update it at once.
 */
export function useDutyRefresh(reload: () => unknown) {
  useSafetyReload(reload, { isLive: () => liveSince() !== null, whenLiveMs: 2 * 60_000, whenDownMs: 30_000 });
  const ref = useRef(reload);
  useEffect(() => {
    ref.current = reload;
  });
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible") void ref.current();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);
}

"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, Loader2, Lock, MessageSquareText } from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";
import { cn } from "@/lib/utils";
import { useLiveTopics } from "@/lib/realtime/live";
import { istDateString } from "@/lib/time/ist";
import { markAllPresent, saveAttendanceRemark, setAttendanceMark, setStaffRank } from "@/server/actions/attendance";
import { callGate } from "@/lib/gate-call";
import { formatInstant } from "./format";

type Cell = { mark: string | null; by: string; at: string };
type Sheet = {
  month: string;
  daysInMonth: number;
  today: string;
  /** Head Security can change marks and remarks from this day (yesterday) */
  editableFrom: string;
  rows: { id: string; name: string; employeeId: string | null; rank: string }[];
  cells: Record<string, Record<number, Cell>>;
  remarks: Record<number, { text: string; by: string; at: string }>;
  canMark: boolean;
  isAdmin: boolean;
};

/** The marks, as written in the paper register */
const MARKS: { status: string; letter: string; label: string; cls: string }[] = [
  { status: "Present", letter: "P", label: "Present", cls: "text-zinc-100" },
  { status: "Absent", letter: "A", label: "Absent", cls: "text-red-500" },
  { status: "On Leave", letter: "L", label: "Leave", cls: "text-red-500" },
  { status: "Half Day", letter: "H", label: "Half day", cls: "text-amber-500" },
  { status: "Double Duty", letter: "P", label: "Double duty", cls: "text-zinc-100" },
  { status: "Late", letter: "Lt", label: "Late", cls: "text-amber-500" },
];
const markOf = (status: string | null | undefined) => MARKS.find((m) => m.status === status);

const RANKS = ["SUP", "H.G", "S.G"];

function MarkGlyph({ status }: { status: string | null | undefined }) {
  const m = markOf(status);
  if (!m) return null;
  if (m.status === "Double Duty") {
    // Paper style: a second, red P under the first
    return (
      <span className="relative inline-flex flex-col items-center leading-none">
        <span className="text-zinc-100">P</span>
        <span className="text-[10px] text-red-500 -mt-0.5">P</span>
      </span>
    );
  }
  return <span className={m.cls}>{m.letter}</span>;
}

export function AttendanceSheetView() {
  const t = useT();
  const [month, setMonth] = useState(() => istDateString().slice(0, 7));
  const [data, setData] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A save that was refused or failed (stays until dismissed)
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cell, setCell] = useState<{ staffId: string; day: number } | null>(null);
  const [dayOpen, setDayOpen] = useState<number | null>(null);
  const [rankFor, setRankFor] = useState<string | null>(null);

  /** silent: changed elsewhere (live update) — keep the sheet on screen while it reloads */
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res: any = await callGate("getAttendanceMonth", [month], 15_000);
      if (res?.error) {
        if (!silent) setError(res.error);
      } else setData(res);
    } catch (err) {
      if (!silent) setError(actionErrorMessage(err, t("Could not load the register.")));
    }
    setLoading(false);
  }, [month, t]);
  useEffect(() => {
    load();
  }, [load]);
  // Live: marks or remarks saved on another device (not while a mark is being saved
  // here — the reload would put back the cell's old value over the one being saved)
  const savingNow = useRef(0);
  useLiveTopics(["attendance"], () => {
    if (!busy && savingNow.current === 0) load(true);
  });

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  async function run(action: () => Promise<any>, done?: string) {
    setBusy(true);
    setSaveError(null);
    try {
      const res = await action();
      if (res?.error) {
        setSaveError(t(res.error));
        return false;
      }
      if (done) flash(done);
      await load();
      return true;
    } catch (err) {
      setSaveError(actionErrorMessage(err, t("Could not save. Please try again.")));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Marking is instant on screen: the cell changes at once and saves in the
  // background (several people can be marked quickly); a failed save goes back.
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  function patchCell(staffId: string, day: number, value: Cell | undefined) {
    setData((d) => {
      if (!d) return d;
      const row = { ...(d.cells[staffId] ?? {}) };
      if (value) row[day] = value;
      else delete row[day];
      return { ...d, cells: { ...d.cells, [staffId]: row } };
    });
  }
  async function markCell(staffId: string, day: number, status: string | null) {
    const key = `${staffId}:${day}`;
    // One save per cell at a time (a second one could be undone by the first's rollback)
    if (saving.has(key)) return;
    const before = data?.cells[staffId]?.[day];
    setCell(null);
    setSaveError(null);
    savingNow.current++;
    patchCell(staffId, day, { mark: status, by: before?.by ?? "", at: new Date().toISOString() });
    setSaving((s) => new Set(s).add(key));
    try {
      const res: any = await setAttendanceMark(staffId, dateOf(day), status);
      if (res?.error) {
        patchCell(staffId, day, before);
        setSaveError(t(res.error));
      } else if (res?.cell) {
        patchCell(staffId, day, res.cell);
      }
    } catch (err) {
      patchCell(staffId, day, before);
      setSaveError(actionErrorMessage(err, t("Could not save. Please try again.")));
    } finally {
      savingNow.current--;
      setSaving((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  const today = data?.today ?? istDateString();
  // Dates come from the month on screen (not the one still loading), so a tap
  // during a month switch can never mark the wrong date
  const shownMonth = data?.month ?? month;
  const isCurrentMonth = shownMonth === today.slice(0, 7);
  const dateOf = (day: number) => `${shownMonth}-${String(day).padStart(2, "0")}`;
  const canEditDay = (day: number) => {
    if (!data?.canMark) return false;
    const d = dateOf(day);
    return (d >= data.editableFrom && d <= today) || (data.isAdmin && d < today);
  };
  // Inside the 2-day window a saved mark can still be changed
  const canEditCell = (_staffId: string, day: number) => canEditDay(day);
  const shiftMonth = (by: number) => {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
    if (next <= today.slice(0, 7)) setMonth(next);
  };
  const monthLabel = new Date(`${shownMonth}-01T00:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const dayLabel = (day: number) =>
    new Date(`${dateOf(day)}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

  const days = data ? Array.from({ length: data.daysInMonth }, (_, i) => i + 1) : [];
  const todayDay = isCurrentMonth ? +today.slice(8, 10) : null;
  const count = (staffId: string, statuses: string[]) =>
    Object.values(data?.cells[staffId] ?? {}).filter((c) => c.mark && statuses.includes(c.mark)).length;
  const unmarkedToday = todayDay && data ? data.rows.filter((r) => !data.cells[r.id]?.[todayDay]?.mark).length : 0;

  const selectedRow = cell && data ? data.rows.find((r) => r.id === cell.staffId) : null;
  const selectedCell = cell && data ? data.cells[cell.staffId]?.[cell.day] : undefined;

  return (
    <div className="space-y-4">
      <LoadingPill active={loading} />

      {/* Month + quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1 shadow-card">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label={t("Previous month")} className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-950 hover:text-zinc-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-semibold text-zinc-100">{monthLabel}</span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={month >= today.slice(0, 7)}
            aria-label={t("Next month")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-950 hover:text-zinc-100 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        {data?.canMark && todayDay && unmarkedToday > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => markAllPresent(today), t("Marked present."))}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)] transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            {t("Mark all present today")} <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">{unmarkedToday}</span>
          </button>
        )}
      </div>

      {/* Legend + rules */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        {MARKS.map((m) => (
          <span key={m.status} className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 px-1 font-semibold">
              <MarkGlyph status={m.status} />
            </span>
            {t(m.label)}
          </span>
        ))}
      </div>
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-zinc-500">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {data?.isAdmin
          ? t("Tap a cell to mark. As Main Admin you can correct any day, including its remarks.")
          : t("Attendance and day remarks can be marked or changed for 2 days: today and yesterday. Older days are locked. Tap a date to see that day and its remarks.")}
      </p>

      {notice && (
        <div role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">{notice}</div>
      )}
      {saveError && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span className="min-w-0 flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="shrink-0 px-2 text-xs font-semibold hover:underline">
            OK
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span>{t(error)}</span>
          <button type="button" onClick={() => load()} className="h-10 rounded-full bg-red-500/10 px-4 text-sm font-semibold text-red-500 hover:bg-red-500/20">
            {t("Try again")}
          </button>
        </div>
      )}

      {/* The sheet */}
      {data && (
        <div className={cn("overflow-x-auto rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card transition-opacity", loading && "pointer-events-none opacity-60")}>
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 min-w-[9.5rem] sm:min-w-[13rem] border-b border-r border-zinc-800 bg-zinc-950 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {t("S.No")} · {t("Name")}
                </th>
                <th className="border-b border-r border-zinc-800 bg-zinc-950 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t("Rank")}</th>
                {days.map((d) => {
                  const isToday = d === todayDay;
                  const future = dateOf(d) > today;
                  return (
                    <th key={d} className={cn("border-b border-r border-zinc-800 p-0", isToday ? "bg-orange-500/10" : "bg-zinc-950")}>
                      <button
                        type="button"
                        disabled={future}
                        onClick={() => setDayOpen(d)}
                        aria-label={dayLabel(d)}
                        className={cn(
                          "relative flex h-10 w-9 items-center justify-center text-xs font-semibold tabular-nums transition-colors disabled:opacity-40",
                          isToday ? "text-orange-500" : "text-zinc-500 hover:text-zinc-100"
                        )}
                      >
                        {d}
                        {data.remarks[d] && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden="true" />}
                        {data.canMark && !future && dateOf(d) < data.editableFrom && !data.isAdmin && <Lock className="absolute bottom-0.5 h-2.5 w-2.5 text-zinc-600" aria-hidden="true" />}
                      </button>
                    </th>
                  );
                })}
                <th className="border-b border-r border-zinc-800 bg-zinc-950 px-2 py-2.5 text-[11px] font-semibold text-zinc-500">P</th>
                <th className="border-b border-zinc-800 bg-zinc-950 px-2 py-2.5 text-[11px] font-semibold text-zinc-500">L</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="sticky left-0 z-10 border-b border-r border-zinc-800 bg-zinc-900 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-zinc-500">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-zinc-100 max-w-[7rem] sm:max-w-[11rem]">{r.name}</span>
                        {r.employeeId && <span className="block truncate text-[11px] text-zinc-500">{r.employeeId}</span>}
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-r border-zinc-800 px-1 text-center">
                    {data.canMark ? (
                      <button type="button" onClick={() => setRankFor(r.id)} className="rounded-lg px-1.5 py-1 text-xs font-semibold text-orange-500 hover:bg-orange-500/10">
                        {r.rank}
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-zinc-300">{r.rank}</span>
                    )}
                  </td>
                  {days.map((d) => {
                    const c = data.cells[r.id]?.[d];
                    const future = dateOf(d) > today;
                    const editable = canEditCell(r.id, d);
                    const locked = !future && !editable && d !== todayDay;
                    return (
                      <td key={d} className={cn("border-b border-r border-zinc-800 p-0", d === todayDay && "bg-orange-500/5", locked && "bg-zinc-950/70")}>
                        <button
                          type="button"
                          disabled={future || (!editable && !c) || saving.has(`${r.id}:${d}`)}
                          onClick={() => setCell({ staffId: r.id, day: d })}
                          aria-label={`${r.name} — ${dayLabel(d)}${c?.mark ? ` — ${t(markOf(c.mark)?.label ?? c.mark)}` : ""}`}
                          className={cn(
                            "flex h-11 w-9 items-center justify-center text-sm font-bold transition-colors",
                            editable ? "hover:bg-orange-500/10 cursor-pointer" : "cursor-default",
                            saving.has(`${r.id}:${d}`) && "animate-pulse opacity-60",
                            future && "bg-zinc-950/40"
                          )}
                        >
                          <MarkGlyph status={c?.mark} />
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b border-r border-zinc-800 px-2 text-center text-xs font-semibold tabular-nums text-zinc-100">
                    {count(r.id, ["Present", "Double Duty", "Late"]) + count(r.id, ["Half Day"]) * 0.5}
                  </td>
                  <td className="border-b border-zinc-800 px-2 text-center text-xs font-semibold tabular-nums text-red-500">{count(r.id, ["On Leave"])}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={days.length + 4} className="px-4 py-10 text-center text-sm text-zinc-500">{t("No security staff yet.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* One cell: pick the mark (or see who marked it) */}
      <Modal open={!!cell && !!selectedRow} onClose={() => !busy && setCell(null)} title={selectedRow ? `${selectedRow.name} — ${cell ? dayLabel(cell.day) : ""}` : ""} className="max-w-md">
        {cell && selectedRow && (
          <div className="space-y-4">
            <CellPicker
              key={`${cell.staffId}-${cell.day}`}
              current={selectedCell}
              editable={canEditCell(cell.staffId, cell.day)}
              isAdmin={!!data?.isAdmin}
              pastDay={!!data && dateOf(cell.day) < data.editableFrom}
              onSave={(status) => markCell(cell.staffId, cell.day, status)}
            />
          </div>
        )}
      </Modal>

      {/* One day: everyone's mark + the day's remarks */}
      <Modal open={dayOpen !== null} onClose={() => !busy && setDayOpen(null)} title={dayOpen ? dayLabel(dayOpen) : ""} className="max-w-lg">
        {dayOpen !== null && data && (
          <DayPanel
            key={`${month}-${dayOpen}`}
            rows={data.rows.map((r) => ({ name: r.name, rank: r.rank, mark: data.cells[r.id]?.[dayOpen]?.mark ?? null }))}
            remark={data.remarks[dayOpen]}
            canWrite={data.canMark && dateOf(dayOpen) <= today && (data.isAdmin || dateOf(dayOpen) >= data.editableFrom)}
            busy={busy}
            onSave={(text) => run(() => saveAttendanceRemark(dateOf(dayOpen), text), t("Remarks saved."))}
          />
        )}
      </Modal>

      {/* Rank */}
      <Modal open={!!rankFor} onClose={() => !busy && setRankFor(null)} title={t("Rank")} className="max-w-sm">
        {rankFor && data && (
          <RankPicker
            current={data.rows.find((r) => r.id === rankFor)?.rank ?? ""}
            busy={busy}
            onPick={async (rank) => {
              if (await run(() => setStaffRank(rankFor, rank), t("Rank saved."))) setRankFor(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/** Pick a mark, then Save. Saved marks are final (only the Main Admin can correct). */
function CellPicker({
  current,
  editable,
  isAdmin,
  pastDay,
  onSave,
}: {
  current?: Cell;
  editable: boolean;
  isAdmin: boolean;
  pastDay: boolean;
  onSave: (status: string | null) => void;
}) {
  const t = useT();
  const [choice, setChoice] = useState<string | null>(current?.mark ?? null);
  const changed = choice !== (current?.mark ?? null);
  return (
    <div className="space-y-4">
      {editable && isAdmin && (pastDay || current?.mark) && (
        <p role="note" className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-500">
          {t("You are correcting a past day as Main Admin. It is saved as a correction; the earlier mark stays in the history.")}
        </p>
      )}
      {editable ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {MARKS.map((m) => {
              const active = choice === m.status;
              return (
                <button
                  key={m.status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setChoice(m.status)}
                  className={cn(
                    "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border-2 text-lg font-bold transition-[background-color,border-color,transform] active:scale-[0.97]",
                    active ? "border-orange-500 bg-orange-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-950"
                  )}
                >
                  <MarkGlyph status={m.status} />
                  <span className="text-xs font-medium text-zinc-400">{t(m.label)}</span>
                </button>
              );
            })}
          </div>
          {!isAdmin && <p className="text-xs text-zinc-500">{t("You can change a mark for 2 days (today and yesterday).")}</p>}
          <button
            type="button"
            disabled={!choice || !changed}
            onClick={() => onSave(choice)}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-orange-600 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98] disabled:opacity-40"
          >
            {choice ? t("Save — {mark}", { mark: t(markOf(choice)?.label ?? choice) }) : t("Choose a mark")}
          </button>
          {isAdmin && current?.mark && (
            <button
              type="button"
              onClick={() => onSave(null)}
              className="h-11 w-full rounded-full border border-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-950"
            >
              {t("Clear mark")}
            </button>
          )}
        </>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
          <Lock className="h-4 w-4 shrink-0" /> {current?.mark ? t("This day is locked. Only the Main Admin can correct it.") : t("This day is locked.")}
        </p>
      )}
      {current && (
        <p className="text-xs text-zinc-500">
          {current.mark ? t(markOf(current.mark)?.label ?? current.mark) : t("Cleared")} · {t("by")} {current.by} · {formatInstant(current.at)}
        </p>
      )}
    </div>
  );
}

function DayPanel({
  rows,
  remark,
  canWrite,
  busy,
  onSave,
}: {
  rows: { name: string; rank: string; mark: string | null }[];
  remark?: { text: string; by: string; at: string };
  canWrite: boolean;
  busy: boolean;
  onSave: (text: string) => Promise<boolean>;
}) {
  const t = useT();
  const [text, setText] = useState(remark?.text ?? "");
  const totals = MARKS.map((m) => ({ ...m, n: rows.filter((r) => r.mark === m.status).length })).filter((m) => m.n > 0);
  const unmarked = rows.filter((r) => !r.mark).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {totals.map((m) => (
          <span key={m.status} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
            <b className="tabular-nums">{m.n}</b> {t(m.label)}
          </span>
        ))}
        {unmarked > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-500">
            <b className="tabular-nums">{unmarked}</b> {t("Not marked")}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <MessageSquareText className="h-4 w-4 text-orange-400" /> {t("Remarks")}
        </p>
        {canWrite ? (
          <>
            <textarea
              value={text}
              maxLength={1000}
              rows={4}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("e.g. K. Prakash on leave (family function); G. Eswara Rao double duty")}
              className="flex min-h-[110px] w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
            <p className="text-xs text-zinc-500">{t("Remarks can be written or changed for 2 days (today and yesterday). After that they are locked.")}</p>
            <button
              type="button"
              disabled={busy || text.trim() === (remark?.text ?? "")}
              onClick={() => onSave(text)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-orange-600 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98] disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Save remarks")}
            </button>
          </>
        ) : remark ? (
          <div className="rounded-2xl bg-zinc-950 px-4 py-3">
            <p className="whitespace-pre-wrap break-words text-sm text-zinc-100">{remark.text}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Lock className="h-3 w-3" /> {remark.by} · {formatInstant(remark.at)}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm text-zinc-500">{t("No remarks for this day.")}</p>
        )}
      </div>

      <ul className="divide-y divide-zinc-800/70 rounded-2xl border border-zinc-800">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-zinc-100">{r.name}</span>
            <span className="text-xs text-zinc-500">{r.rank}</span>
            <span className="flex w-8 justify-center font-bold">{r.mark ? <MarkGlyph status={r.mark} /> : <span className="text-zinc-600">—</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankPicker({ current, busy, onPick }: { current: string; busy: boolean; onPick: (rank: string) => void }) {
  const t = useT();
  const [other, setOther] = useState(RANKS.includes(current) ? "" : current);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {RANKS.map((r) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => onPick(r)}
            className={cn(
              "h-14 rounded-2xl border-2 text-base font-bold transition-colors disabled:opacity-60",
              current === r ? "border-orange-500 bg-orange-500/10 text-orange-500" : "border-zinc-800 text-zinc-100 hover:bg-zinc-950"
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">{t("SUP = Supervisor · H.G = Head Guard · S.G = Security Guard")}</p>
      <div className="flex gap-2">
        <input
          value={other}
          maxLength={20}
          onChange={(e) => setOther(e.target.value)}
          placeholder={t("Other rank")}
          className="h-12 min-w-0 flex-1 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
        />
        <button
          type="button"
          disabled={busy || !other.trim()}
          onClick={() => onPick(other.trim())}
          className="h-12 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {t("Save")}
        </button>
      </div>
    </div>
  );
}

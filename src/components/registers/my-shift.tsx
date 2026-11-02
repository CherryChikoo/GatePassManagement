"use client";

/**
 * My shift details (every security guard): today's duty with Start / End,
 * and the coming days' duties (view only), with the day's remarks.
 * Separate from Staff Attendance. Times are taken from the server's clock.
 */
import { useEffect, useState } from "react";
import { scrollPageToTop } from "@/lib/ui/scroll-top";
import { CalendarClock, Loader2, Play, Square } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { GoBackButton } from "@/components/ui/go-back-button";
import { LoadingPill } from "@/components/ui/loading-pill";
import { prefetchGateData, useGateData } from "@/lib/gate-cache";
import { callGate } from "@/lib/gate-call";
import { actionErrorMessage } from "@/lib/deployment";
import { cn } from "@/lib/utils";
import { tapMyDuty } from "@/server/actions/security-duty";
import { formatDay } from "./format";
import { DutyStatus, useDutyRefresh } from "./security-duty";

type MyDuty = { id: string; date: string; shift: string; startedAt: string | null; endedAt: string | null; remark: string | null };
type MyData = { success?: boolean; today?: string; duties?: MyDuty[]; error?: string };

const KEY = "my-duties";
const LIVE = ["reg:SECURITY_DAILY"];
const load = () => callGate("getMyDuties", [], 15_000) as Promise<MyData>;
/** Warm the page before it opens (registers list button) */
export function prefetchMyDuties() {
  prefetchGateData(KEY, load, LIVE);
}

export function MyShiftView() {
  const t = useT();
  const { data, error, loading, reload } = useGateData<MyData>(KEY, load, LIVE);
  useDutyRefresh(reload);
  // Opens at the top (the portal scrolls in its own area, which kept the registers list's position);
  // after the router's own scroll, two frames later
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
  const today = data?.today ?? "";
  const all = data?.duties ?? [];
  // Start / End show at once; kept until the reloaded list has them
  const [taps, setTaps] = useState<Record<string, { startedAt?: string; endedAt?: string }>>({});
  const duties = all.map((d) => ({
    ...d,
    startedAt: d.startedAt ?? taps[d.id]?.startedAt ?? null,
    endedAt: d.endedAt ?? taps[d.id]?.endedAt ?? null,
  }));
  const now = duties.filter((d) => d.date <= today);
  const coming = duties.filter((d) => d.date > today);

  const [confirm, setConfirm] = useState<{ duty: MyDuty; action: "start" | "end" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tap = async (duty: MyDuty, action: "start" | "end") => {
    setBusy(duty.id);
    setActionError(null);
    const at = new Date().toISOString();
    setTaps((m) => ({ ...m, [duty.id]: { ...m[duty.id], [action === "start" ? "startedAt" : "endedAt"]: at } }));
    const res: any = await tapMyDuty(duty.id, action).catch((e) => ({ error: actionErrorMessage(e, "Could not save. Please try again.") }));
    setBusy(null);
    if (res?.error) {
      setActionError(t(res.error));
      setTaps((m) => {
        const next = { ...m[duty.id] };
        delete next[action === "start" ? "startedAt" : "endedAt"];
        return { ...m, [duty.id]: next };
      });
    }
    reload();
  };

  const dayLabel = (d: string) => formatDay(`${d}T00:00:00+05:30`);

  return (
    <div className={cn("mx-auto w-full space-y-5", coming.length > 0 ? "max-w-[1100px]" : "max-w-[720px]")}>
      <div>
        <GoBackButton className="mb-3" href="/security/registers" />
        <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">{t("My shift details")}</h1>
        <p className="mt-1 text-sm text-zinc-400">{t("Your shifts — start and end your duty here.")}</p>
      </div>
      <LoadingPill active={loading} />

      {(error || data?.error) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span>{t(error ?? data?.error ?? "")}</span>
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

      {data?.success && (
        // Phones / tablets: one column; large screens: Today | Coming up
        <div className={cn("space-y-5", coming.length > 0 && "lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0")}>
          {/* Today (and a night shift still open from yesterday) */}
          <section className="space-y-3">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("Today")}</h2>
            {now.length === 0 ? (
              <p className="rounded-3xl border border-zinc-800/80 bg-zinc-900 px-4 py-8 text-center text-base text-zinc-500 shadow-card">
                {t("No duty assigned for today.")}
              </p>
            ) : (
              now.map((d) => (
                <div key={d.id} className="space-y-3 rounded-3xl border border-zinc-800/80 bg-zinc-900 p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-2xl font-bold text-zinc-100">{t("Shift {s}", { s: d.shift })}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">{dayLabel(d.date)}</p>
                    </div>
                    <DutyStatus duty={d} today />
                  </div>
                  {!d.startedAt && d.date === today && (
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => setConfirm({ duty: d, action: "start" })}
                      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-semibold text-white shadow-card transition-[background-color,transform] hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
                    >
                      {busy === d.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />} {t("Start duty")}
                    </button>
                  )}
                  {d.startedAt && !d.endedAt && (
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => setConfirm({ duty: d, action: "end" })}
                      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 text-lg font-semibold text-white shadow-card transition-[background-color,transform] hover:bg-sky-700 active:scale-[0.98] disabled:opacity-60"
                    >
                      {busy === d.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Square className="h-5 w-5" />} {t("End duty")}
                    </button>
                  )}
                  {d.remark && (
                    <p className="whitespace-pre-wrap break-words rounded-2xl bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                      <span className="font-semibold text-zinc-100">{t("Remarks")}:</span> {d.remark}
                    </p>
                  )}
                </div>
              ))
            )}
          </section>

          {/* Coming days: view only */}
          {coming.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("Coming up")}</h2>
              <ul className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card divide-y divide-zinc-800/70">
                {coming.map((d) => (
                  <li key={d.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600">
                        <CalendarClock className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold text-zinc-100">{t("Shift {s}", { s: d.shift })}</span>
                        <span className="block text-sm text-zinc-500">{dayLabel(d.date)}</span>
                      </span>
                    </div>
                    {d.remark && <p className={cn("mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400")}>{d.remark}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={
          confirm
            ? confirm.action === "start"
              ? t("Start Shift {s} now?", { s: confirm.duty.shift })
              : t("End Shift {s} now?", { s: confirm.duty.shift })
            : ""
        }
        description={t("The time is saved now and can't be changed.")}
        confirmText={confirm?.action === "end" ? t("End duty") : t("Start duty")}
        cancelText={t("Go Back")}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c) void tap(c.duty, c.action);
        }}
      />
    </div>
  );
}

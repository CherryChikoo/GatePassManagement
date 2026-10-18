"use client";

import { DateField } from "@/components/ui/date-field";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useEffect, useState } from "react";
import { History, LogIn, LogOut } from "lucide-react";
import { StatusBadge } from "@/components/ui/primitives";
import { actionErrorMessage } from "@/lib/deployment";
import { istDateString } from "@/lib/time/ist";
import { formatDate, formatDateTime } from "@/lib/utils";
import { getPersonPassHistory } from "@/server/actions/history";
import { PagerBar } from "@/components/ui/pager-bar";

type Person = { kind: "student"; id: string } | { kind: "staff"; profileId: string };
const STATUSES = [
  { id: "ALL", label: "All" },
  { id: "APPROVED", label: "Approved" },
  { id: "PENDING", label: "Pending" },
  { id: "REJECTED", label: "Rejected / Expired" },
] as const;

/** A person's pass history with a date filter, status filter and pages of 10. */
export function PassHistoryPanel({ person }: { person: Person }) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]["id"]>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const personKey = person.kind === "student" ? `s:${person.id}` : `f:${person.profileId}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res: any = await getPersonPassHistory({ person, date: date || undefined, status, page });
        if (cancelled) return;
        if (res?.error) setError(res.error);
        else setData(res);
      } catch (err) {
        if (!cancelled) setError(actionErrorMessage(err, "Could not load the history."));
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // person is identified by personKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personKey, date, status, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-base font-medium text-zinc-100">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
            <History className="h-4 w-4" />
          </span>
          Pass history
        </p>
        <div className="flex items-center gap-2">
          <DateField
            aria-label="Filter by date"
            value={date}
            max={istDateString()}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            className="h-10 min-w-0 flex-1 sm:flex-none rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:light]"
          />
          {date && (
            <button
              type="button"
              onClick={() => {
                setDate("");
                setPage(1);
              }}
              className="h-10 shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-950 hover:text-zinc-200"
            >
              All dates
            </button>
          )}
        </div>
      </div>

      <div
        className="inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Filter by status"
      >
        {STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={status === s.id}
            onClick={() => {
              setStatus(s.id);
              setPage(1);
            }}
            className={`text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
              status === s.id ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">{error}</p>
      )}
      <LoadingPill active={loading} />
      <div className={`space-y-2.5 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {data?.passes?.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
              <History className="h-5 w-5" />
            </span>
            <p className="text-sm text-zinc-500">
              No passes {date ? `on ${formatDate(`${date}T00:00:00+05:30`)}` : "yet"}.
            </p>
          </div>
        )}
        {!data && !error && <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>}
        {data?.passes?.map((p: any) => (
          <div key={p.id} className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    p.type === "EXIT" ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400"
                  }`}
                >
                  {p.type}
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-zinc-100">{p.title}</span>
              </div>
              <span className="shrink-0">
                <StatusBadge status={p.status} />
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              {formatDate(p.exitDate)}
              {p.endDate && formatDate(p.endDate) !== formatDate(p.exitDate) ? ` – ${formatDate(p.endDate)}` : ""} • Requested {formatDateTime(p.createdAt)}
            </p>
            {p.rejectionReason && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">Reason: {p.rejectionReason}</p>
            )}
            {p.movements.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {p.movements.map((m: any, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400"
                  >
                    {m.type === "EXIT" ? (
                      <LogOut className="h-3 w-3 text-sky-400" />
                    ) : (
                      <LogIn className="h-3 w-3 text-emerald-400" />
                    )}
                    {formatDateTime(m.at)}
                    {m.gate ? ` (${m.gate})` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {data && data.total > 0 && (
        <PagerBar inline page={page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} itemLabel="passes" />
      )}
    </div>
  );
}

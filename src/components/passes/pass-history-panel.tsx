"use client";

import { useEffect, useState } from "react";
import { History, LogIn, LogOut } from "lucide-react";
import { StatusBadge } from "@/components/ui/primitives";
import { actionErrorMessage } from "@/lib/deployment";
import { istDateString } from "@/lib/time/ist";
import { formatDate, formatDateTime } from "@/lib/utils";
import { getPersonPassHistory } from "@/server/actions/history";
import { Pager } from "@/components/registers/toolbar";

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
    <div className="space-y-3">
      <p className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
        <History className="h-4 w-4 text-zinc-400" /> Pass history
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label="Filter by date"
          value={date}
          max={istDateString()}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-200 [color-scheme:light]"
        />
        {date && (
          <button
            type="button"
            onClick={() => {
              setDate("");
              setPage(1);
            }}
            className="h-9 px-2.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200"
          >
            All dates
          </button>
        )}
        <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setStatus(s.id);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold ${status === s.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className={`space-y-2 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {data?.passes?.length === 0 && (
          <p className="rounded-lg border border-zinc-800 px-3 py-6 text-center text-xs text-zinc-500">
            No passes {date ? `on ${formatDate(`${date}T00:00:00+05:30`)}` : "yet"}.
          </p>
        )}
        {!data && !error && <p className="text-xs text-zinc-500">Loading…</p>}
        {data?.passes?.map((p: any) => (
          <div key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${p.type === "EXIT" ? "bg-orange-500/15 text-orange-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                {p.type}
              </span>
              <span className="text-sm font-medium text-zinc-100 truncate max-w-[60%]">{p.title}</span>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-xs text-zinc-400">
              {formatDate(p.exitDate)}
              {p.endDate && formatDate(p.endDate) !== formatDate(p.exitDate) ? ` – ${formatDate(p.endDate)}` : ""} • Requested {formatDateTime(p.createdAt)}
            </p>
            {p.rejectionReason && <p className="text-xs text-red-300">Reason: {p.rejectionReason}</p>}
            {p.movements.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                {p.movements.map((m: any, i: number) => (
                  <span key={i} className="flex items-center gap-1">
                    {m.type === "EXIT" ? <LogOut className="h-3 w-3 text-orange-400" /> : <LogIn className="h-3 w-3 text-emerald-400" />}
                    {formatDateTime(m.at)}
                    {m.gate ? ` (${m.gate})` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}

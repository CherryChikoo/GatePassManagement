"use client";

/**
 * "My visitors": people Security registered as coming to meet me. While they
 * are inside, each shows its 4-digit meeting code — I tell it to the visitor
 * when our meeting is over, and Security lets them out with it. Rows like the
 * Students list; tap a row for the full details. Updates live when a visitor
 * arrives or leaves.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Clock, KeyRound, Loader2, Phone, ShieldAlert, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { dt, RowActions, IconAction } from "@/components/ui/data-table";
import { cn, formatDateTime, formatTime } from "@/lib/utils";
import { useOwnLive } from "@/lib/realtime/live";
import { listMyVisits, markVisitMet, type MyVisit, type MyVisitsPage } from "@/server/actions/visits";
import { DateField } from "@/components/ui/date-field";
import { PagerBar } from "@/components/ui/pager-bar";
import { istDateString } from "@/lib/time/ist";

const SOURCE: Record<string, string> = { VISITORS: "Visitor", ADMISSION: "Admission" };
const CATEGORY: Record<string, string> = { GUEST: "Guest", PARENT: "Parent / Guardian", VENDOR: "Vendor / Delivery", WORKER: "Worker / Staff" };

function Avatar({ v, size = "sm" }: { v: MyVisit; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-2xl text-lg" : "h-10 w-10 rounded-xl text-sm";
  if (v.photoUrl) {
    return <img src={v.photoUrl} alt="" className={cn(box, "shrink-0 border border-zinc-800 object-cover")} />;
  }
  return (
    <span className={cn(box, "flex shrink-0 items-center justify-center bg-orange-500/10 font-semibold text-orange-500")}>
      {v.visitorName.charAt(0).toUpperCase()}
    </span>
  );
}

function StatusChip({ v }: { v: MyVisit }) {
  const [label, cls] =
    v.status === "INSIDE"
      ? ["Inside", "bg-orange-500/10 text-orange-500"]
      : v.status === "MET"
      ? ["Met — leaving", "bg-emerald-500/10 text-emerald-600"]
      : ["Left", "bg-zinc-900 text-zinc-500 border border-zinc-800"];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", cls)}>{label}</span>;
}

function CodeChip({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/5 px-2.5 py-0.5 font-mono text-sm font-semibold tracking-[0.2em] text-zinc-100">
      <KeyRound className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" /> {code}
    </span>
  );
}

export function MyVisitorsClient({ initial }: { initial: MyVisitsPage }) {
  const [data, setData] = useState(initial);
  // Who came on this day: today, or a day picked on the calendar
  const [date, setDate] = useState(() => istDateString());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only the newest load updates the list
  const loadNo = useRef(0);
  const reload = useCallback(async () => {
    const no = ++loadNo.current;
    setLoading(true);
    try {
      const res = await listMyVisits({ view: "day", date, page });
      if (no !== loadNo.current) return;
      setData(res);
    } catch {
      // keep what is shown; the next change or visit refreshes it
    } finally {
      if (no === loadNo.current) setLoading(false);
    }
  }, [date, page]);

  // Date / page changed (today's first page came with the page itself)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void reload();
  }, [reload]);

  // Live: a visitor for me arrived / left (or I marked a meeting done in another tab)
  useOwnLive((changed) => {
    if (changed.includes("visits") || changed.includes("*")) void reload();
  });

  const rows = data.rows;

  async function done(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await markVisitMet(id);
      if (res?.error) setError(res.error);
      await reload();
    } catch {
      setError("Could not update. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  /** Everything about the visit, shown when its row is opened: three tiles (visitor, visit, meeting code) */
  const details = (v: MyVisit) => {
    const tile = "min-w-0 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4";
    const tileLabel = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
    const facts: [string, string | null][] = [
      ["Purpose", v.purpose],
      ["Vehicle", v.vehicleNumber],
      ["Arrived", formatDateTime(v.arrivedAt)],
      ["Meeting done", v.metAt ? formatTime(v.metAt) : null],
      ["Left", v.exitedAt ? formatDateTime(v.exitedAt) : null],
    ];
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Who */}
        <section className={tile}>
          <p className={tileLabel}>
            <UserRound className="h-3.5 w-3.5 text-orange-500" /> Visitor
          </p>
          <div className="flex items-center gap-3">
            <Avatar v={v} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-100">{v.visitorName}</p>
              <p className="text-xs text-zinc-500">
                {[SOURCE[v.register] ?? v.register, v.category ? CATEGORY[v.category] ?? v.category : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          {v.visitorPhone && (
            <a
              href={`tel:${v.visitorPhone}`}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 text-sm font-medium text-zinc-200 hover:border-orange-500/40 hover:text-orange-500"
            >
              <Phone className="h-4 w-4" /> Call {v.visitorPhone}
            </a>
          )}
        </section>

        {/* The visit */}
        <section className={tile}>
          <p className={tileLabel}>
            <Clock className="h-3.5 w-3.5 text-orange-500" /> Visit
          </p>
          <dl className="space-y-2 text-sm">
            {facts
              .filter(([, val]) => !!val)
              .map(([label, val]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-xs text-zinc-500">{label}</dt>
                  <dd className="min-w-0 break-words text-right text-zinc-200">{val}</dd>
                </div>
              ))}
          </dl>
        </section>

        {/* Meeting code */}
        <section className={cn(tile, v.code && "border-orange-500/30 bg-orange-500/5")}>
          <p className={cn(tileLabel, v.code && "text-orange-500")}>
            <KeyRound className="h-3.5 w-3.5" /> Meeting code
          </p>
          {v.code ? (
            <>
              <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-zinc-100 tabular-nums">{v.code}</p>
              <p className="text-xs text-zinc-500">Tell the visitor this code when your meeting is over.</p>
              {v.status === "INSIDE" ? (
                <button
                  type="button"
                  onClick={() => done(v.id)}
                  disabled={busyId === v.id}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 text-sm font-medium text-zinc-200 hover:bg-zinc-950 disabled:opacity-60"
                >
                  {busyId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  Meeting done
                </button>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Meeting done — waiting to leave
                </p>
              )}
            </>
          ) : v.exitMethod === "OVERRIDE" ? (
            <p className="flex items-start gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Let out without your code{v.overrideReason ? `: ${v.overrideReason}` : ""}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-zinc-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Left with your code
            </p>
          )}
        </section>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">My Visitors</h1>
        <p className="mt-1 text-sm text-zinc-500">
          People Security registered as coming to meet you. When your meeting is over, tell them their{" "}
          <span className="font-medium text-zinc-300">meeting code</span> — they need it to leave the campus.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setDate(istDateString());
            setPage(1);
          }}
          aria-pressed={date === istDateString()}
          className={cn(
            "inline-flex h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors",
            date === istDateString()
              ? "border-orange-500/30 bg-orange-500/10 text-orange-500"
              : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
          )}
        >
          Today
        </button>
        <DateField
          aria-label="Date"
          value={date}
          max={istDateString()}
          onChange={(e) => {
            if (!e.target.value) return;
            setDate(e.target.value);
            setPage(1);
          }}
          className="w-auto"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" aria-label="Loading" />}
      </div>

      <Card className={cn("transition-opacity", loading && "opacity-60")}>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-zinc-500">
              {date === istDateString() ? "No visitors have come to meet you today." : "No visitors came to meet you on this day."}
            </p>
          ) : (
            <>
              {/* Phones: stacked rows */}
              <ul className={`sm:hidden ${dt.mobileList}`}>
                {rows.map((v) => {
                  const open = expanded === v.id;
                  return (
                    <li key={v.id} className={open ? "bg-zinc-950/70" : ""}>
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : v.id)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                      >
                        <Avatar v={v} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-zinc-100">{v.visitorName}</span>
                          <span className="block truncate text-xs text-zinc-500">
                            {[v.purpose, `Arrived ${formatTime(v.arrivedAt)}`].filter(Boolean).join(" · ")}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <StatusChip v={v} />
                            {v.code && <CodeChip code={v.code} />}
                          </span>
                        </span>
                        <ChevronDown className={cn("h-5 w-5 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} />
                      </button>
                      {open && <div className="px-4 pb-4 animate-fade-in">{details(v)}</div>}
                    </li>
                  );
                })}
              </ul>

              {/* Tablet and up: table */}
              <div className={`hidden sm:block ${dt.wrap}`}>
                <table className={dt.table}>
                  <thead>
                    <tr>
                      <th className={dt.th}>Visitor</th>
                      <th className={dt.th}>Purpose</th>
                      <th className={dt.th}>Arrived</th>
                      <th className={dt.th}>Status</th>
                      <th className={dt.th}>Code / Left</th>
                      <th className={dt.thRight}>
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((v) => {
                      const open = expanded === v.id;
                      const toggle = () => setExpanded(open ? null : v.id);
                      return (
                        <React.Fragment key={v.id}>
                          <tr
                            onClick={toggle}
                            className={cn(
                              dt.trClickable,
                              "select-none",
                              open && "[&>td]:bg-zinc-950/70 [&>td]:border-b-0 [&>td:first-child]:rounded-bl-none [&>td:last-child]:rounded-br-none"
                            )}
                            title="Click row to view full details"
                          >
                            <td className={dt.td}>
                              <span className="flex items-center gap-3">
                                <Avatar v={v} />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-zinc-100">{v.visitorName}</span>
                                  {v.visitorPhone && (
                                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500 tabular-nums">
                                      <Phone className="h-3 w-3" /> {v.visitorPhone}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </td>
                            <td className={cn(dt.td, "max-w-[220px] truncate")}>{v.purpose || <span className="text-zinc-600">—</span>}</td>
                            <td className={cn(dt.tdMuted, "whitespace-nowrap tabular-nums")}>{formatTime(v.arrivedAt)}</td>
                            <td className={dt.td}>
                              <StatusChip v={v} />
                            </td>
                            <td className={dt.td}>
                              {v.code ? (
                                <CodeChip code={v.code} />
                              ) : (
                                <span className="text-xs text-zinc-500 tabular-nums">{v.exitedAt ? formatDateTime(v.exitedAt) : "—"}</span>
                              )}
                            </td>
                            <td className={dt.tdActions}>
                              <RowActions>
                                <IconAction
                                  label={open ? "Collapse details" : "View full details"}
                                  icon={<ChevronDown className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />}
                                  active={open}
                                  onClick={toggle}
                                />
                              </RowActions>
                            </td>
                          </tr>
                          {open && (
                            <tr className="animate-fade-in">
                              <td colSpan={6} className="px-0 pt-0 pb-3">
                                <div className="rounded-b-2xl bg-zinc-950/70 px-4 pb-5 pt-1 sm:px-5">{details(v)}</div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <PagerBar page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} itemLabel="visitors" />
    </div>
  );
}

"use client";
import { DateField } from "@/components/ui/date-field";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Info, Loader2, LogIn, Plus, Trash2, UserPlus } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Modal, StatusBadge } from "@/components/ui/primitives";
import { Card } from "@/components/ui/card";
import { dt, PersonCell } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
import { cn } from "@/lib/utils";
import { actionErrorMessage } from "@/lib/deployment";
import { istDateString } from "@/lib/time/ist";
import {
  addOutingNote,
  deleteOutingNote,
  listOutingNotes,
  getFacultyBook,
  getHomeOutingDay,
  getMovementDetails,
  getHomeOutingSummary,
  getHostelOutingBook,
  getPassGatePhotos,
  getVisitorDetails,
  getVisitorsBook,
  markFacultyReturn,
} from "@/server/actions/registers";
import { formatDay, formatInstant, newClientToken } from "./format";
import { formatTime } from "@/lib/utils";
import { RegisterToolbar, useRegisterFilters } from "./toolbar";

type Move = { at: string; gate: string | null; guard: string | null; guardEmployeeId: string | null } | null;

function MoveCell({ m }: { m: Move }) {
  if (!m) return <span className="text-zinc-600">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatInstant(m.at)}
      <span className="block text-[11px] text-zinc-500">
        {[m.gate, m.guard].filter(Boolean).join(" • ")}
      </span>
    </span>
  );
}

/** Loads data whenever `key` (the filters) changes; `reload` fetches again. */
function useLoader<T>(fetcher: () => Promise<any>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetcher();
        if (cancelled) return;
        if (res?.error) setError(res.error);
        else setData(res);
      } catch (err) {
        if (!cancelled) setError(actionErrorMessage(err, "Could not load the register."));
      }
      if (!cancelled) setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
    // The fetcher is rebuilt every render; `key` holds everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}

/** Card around a register list: stacked rows on phones + a table from `sm` (children render both). */
function Shell({ loading, error, empty, children }: { loading: boolean; error: string | null; empty: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <LoadingPill active={loading} />
      {error && <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <Card className={cn("overflow-hidden transition-opacity", loading && "opacity-60")}>
        {children}
        {empty && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
              <FileText className="h-5 w-5" />
            </span>
            <p className="text-sm text-zinc-500">{t("No records for this selection.")}</p>
          </div>
        )}
      </Card>
    </>
  );
}

/** Phone row: the tappable part of a stacked row (opens the details). */
const mobileRowBtn =
  "flex w-full min-h-[72px] items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-950/70 active:bg-zinc-950";
/** Avatar tile with the first letter of the name. */
function Initial({ name }: { name?: string | null }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-base font-semibold text-orange-400">
      {(name || "?").replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").charAt(0).toUpperCase() || "?"}
    </span>
  );
}
const chipCls = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap";
const markInBtnCls =
  "inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 font-semibold text-white transition-[background-color,transform] hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50";
const dtLabel = "text-[11px] font-medium uppercase tracking-wider text-zinc-500";

// ─── Form 1 — Faculty Book ────────────────────────────────────

export function FacultyBookView({ canMarkIn }: { canMarkIn: boolean }) {
  const t = useT();
  const f = useRegisterFilters();
  const { data, error, loading, reload } = useLoader<any>(
    () => getFacultyBook({ date: f.dateParam, q: f.q, page: f.page }),
    `${f.dateParam}|${f.q}|${f.page}`
  );
  const [selected, setSelected] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function markIn(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res: any = await markFacultyReturn(id);
      setMsg(res?.error ?? t("Return marked."));
      if (!res?.error) {
        setSelected(null);
        reload();
      }
    } catch (err) {
      setMsg(actionErrorMessage(err, t("Could not mark the return.")));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <RegisterToolbar filters={f} searchPlaceholder="Search name, department, employee ID…" />
      <p className="text-xs leading-relaxed text-zinc-500">
        {t("Requests come from the faculty portal and are approved there. The out-time is marked when security scans the pass;")}
        {canMarkIn ? t(" use “Mark In” when the faculty member returns.") : t(" the in-time when they return.")}
      </p>
      {msg && <div role="status" className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-200 shadow-card">{msg}</div>}
      <Shell loading={loading} error={error} empty={!!data && data.rows.length === 0}>
        {/* Phones */}
        {data?.rows.length > 0 && (
          <ul className={cn(dt.mobileList, "sm:hidden")}>
            {data.rows.map((r: any) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelected(r)} className={mobileRowBtn}>
                  <Initial name={r.facultyName} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-base font-medium text-zinc-100">{r.facultyName}</span>
                      <span className={cn(chipCls, "bg-orange-500/10 text-orange-400")}>{t(r.requestType)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-zinc-400">
                      {[r.designation, r.department].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500 tabular-nums">
                      {formatDay(r.startDate)}
                      {formatDay(r.endDate) !== formatDay(r.startDate) ? ` – ${formatDay(r.endDate)}` : ""}
                    </span>
                    <span className="mt-2 grid grid-cols-2 gap-2">
                      <span className="rounded-xl bg-zinc-950 px-3 py-2">
                        <span className={cn(dtLabel, "block")}>{t("Out")}</span>
                        <span className="block text-sm font-medium text-zinc-200 tabular-nums">{r.actualOut ? formatTime(r.actualOut.at) : "—"}</span>
                      </span>
                      <span className="rounded-xl bg-zinc-950 px-3 py-2">
                        <span className={cn(dtLabel, "block")}>{t("In")}</span>
                        <span className="block text-sm font-medium text-zinc-200 tabular-nums">{r.actualIn ? formatTime(r.actualIn.at) : "—"}</span>
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />
                </button>
                {!r.actualIn && canMarkIn && r.canMarkIn && (
                  <div className="px-4 pb-3.5 -mt-1">
                    <button onClick={() => markIn(r.id)} disabled={busy} className={cn(markInBtnCls, "h-12 w-full text-base")}>
                      <LogIn className="h-5 w-5" /> {t("Mark In")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Larger screens */}
        {data?.rows.length > 0 && (
          <div className={cn(dt.wrap, "hidden sm:block")}>
            <table className={dt.table}>
              <thead>
                <tr>
                  {["Request Date", "Faculty Name", "Designation", "Department", "Request Type", "Start Date", "End Date", "Actual Out-Time", "Actual In-Time"].map((h) => (
                    <th key={h} className={dt.th}>{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className={dt.trClickable}>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{formatDay(r.requestDate)}</td>
                    <td className={cn(dt.td, "whitespace-nowrap")}><PersonCell name={r.facultyName || "—"} /></td>
                    <td className={cn(dt.td, "whitespace-nowrap")}>{r.designation || "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap")}>{r.department || "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap")}>
                      <span className={cn(chipCls, "bg-orange-500/10 text-orange-400")}>{t(r.requestType)}</span>
                    </td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{formatDay(r.startDate)}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{formatDay(r.endDate)}</td>
                    <td className={dt.td}><MoveCell m={r.actualOut} /></td>
                    <td className={dt.td}>
                      {r.actualIn ? (
                        <MoveCell m={r.actualIn} />
                      ) : canMarkIn && r.canMarkIn ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markIn(r.id);
                          }}
                          disabled={busy}
                          className={cn(markInBtnCls, "h-10 px-4 text-sm whitespace-nowrap")}
                        >
                          <LogIn className="h-4 w-4" /> {t("Mark In")}
                        </button>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Shell>
      {data && <PagerBar page={f.page} pageSize={data.pageSize} total={data.total} onPageChange={f.setPage} itemLabel={t("records")} />}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={t("Faculty pass")} className="max-w-xl">
        {selected && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[
              ["Faculty Name", selected.facultyName],
              ["Employee ID", selected.employeeId],
              ["Designation", selected.designation],
              ["Department", selected.department],
              ["Request Type", t(selected.requestType)],
              ["Number of Days", selected.numberOfDays ?? "—"],
              ["Start Date", formatDay(selected.startDate)],
              ["End Date", formatDay(selected.endDate)],
              ["Request Date", formatInstant(selected.requestDate)],
              ["Approved", `${formatInstant(selected.approvedAt)} • ${selected.approvedBy}`],
              ["Reason", selected.reason],
              ["Note", selected.note],
            ].map(([k, v]) => (
              <div key={k as string} className="min-w-0">
                <dt className={dtLabel}>{t(k as string)}</dt>
                <dd className="mt-0.5 text-zinc-200 break-words">{(v as any) || "—"}</dd>
              </div>
            ))}
            <div>
              <dt className={dtLabel}>{t("Actual Out-Time")}</dt>
              <dd className="mt-0.5 text-zinc-200"><MoveCell m={selected.actualOut} /></dd>
            </div>
            <div>
              <dt className={dtLabel}>{t("Actual In-Time")}</dt>
              <dd className="mt-0.5 text-zinc-200"><MoveCell m={selected.actualIn} /></dd>
            </div>
            <GatePhotos permissionId={selected.id} />
            <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3 border-t border-zinc-800 pt-4">
              <StatusBadge status={selected.status} />
              {canMarkIn && selected.canMarkIn && (
                <button onClick={() => markIn(selected.id)} disabled={busy} className={cn(markInBtnCls, "h-14 sm:h-11 w-full sm:w-auto px-6 text-base sm:text-sm sm:ml-auto")}>
                  <LogIn className="h-5 w-5 sm:h-4 sm:w-4" /> {t("Mark In now")}
                </button>
              )}
            </div>
          </dl>
        )}
      </Modal>
    </div>
  );
}

// ─── Form 2 — Visitors Book ───────────────────────────────────

export function VisitorsBookView({ canRegister }: { canRegister: boolean }) {
  const t = useT();
  const f = useRegisterFilters();
  const { data, error, loading } = useLoader<any>(
    () => getVisitorsBook({ date: f.dateParam, q: f.q, page: f.page }),
    `${f.dateParam}|${f.q}|${f.page}`
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const insideChip = <span className={cn(chipCls, "bg-amber-500/10 text-amber-400")}>{t("Inside")}</span>;
  return (
    <div className="space-y-4">
      <RegisterToolbar
        filters={f}
        searchPlaceholder="Search name, phone, person to visit…"
        action={
          canRegister ? (
            <Link
              href="/security/visitors"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-14 sm:h-10 px-6 rounded-full bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white text-base sm:text-sm font-semibold whitespace-nowrap shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)] transition-[background-color,transform]"
            >
              <UserPlus className="h-5 w-5 sm:h-4 sm:w-4" /> {t("Register visitor")}
            </Link>
          ) : null
        }
      />
      <Shell loading={loading} error={error} empty={!!data && data.rows.length === 0}>
        {/* Phones */}
        {data?.rows.length > 0 && (
          <ul className={cn(dt.mobileList, "sm:hidden")}>
            {data.rows.map((r: any) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelectedId(r.id)} className={mobileRowBtn}>
                  <Initial name={r.name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-base font-medium text-zinc-100">{r.name}</span>
                      {!r.outTime && insideChip}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-zinc-400">
                      {[r.personToVisit, r.purpose].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 tabular-nums">
                      <span>{r.phone}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t("In")} {r.inTime ? formatTime(r.inTime) : "—"}
                      </span>
                      {r.outTime && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {t("Out")} {formatTime(r.outTime)}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Larger screens */}
        {data?.rows.length > 0 && (
          <div className={cn(dt.wrap, "hidden sm:block")}>
            <table className={dt.table}>
              <thead>
                <tr>
                  {["Visitor Name", "Address", "Mobile", "Person to Visit", "Purpose", "Department", "Date", "In-Time", "Out-Time", "Remarks", "Recorded by"].map((h) => (
                    <th key={h} className={dt.th}>{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.id} onClick={() => setSelectedId(r.id)} className={dt.trClickable}>
                    <td className={cn(dt.td, "whitespace-nowrap")}><PersonCell name={r.name || "—"} /></td>
                    <td className={cn(dt.td, "whitespace-nowrap max-w-[200px] truncate")}>{r.address || "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{r.phone}</td>
                    <td className={cn(dt.td, "whitespace-nowrap")}>{r.personToVisit || "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap max-w-[200px] truncate")}>{r.purpose}</td>
                    <td className={cn(dt.td, "whitespace-nowrap")}>{r.department || "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{formatDay(r.inTime)}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{r.inTime ? formatTime(r.inTime) : "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{r.outTime ? formatInstant(r.outTime) : insideChip}</td>
                    <td className={cn(dt.tdMuted, "whitespace-nowrap max-w-[200px] truncate")}>{r.remarks || "—"}</td>
                    <td className={cn(dt.tdMuted, "whitespace-nowrap")}>{r.recordedByName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Shell>
      {data && <PagerBar page={f.page} pageSize={data.pageSize} total={data.total} onPageChange={f.setPage} itemLabel={t("records")} />}

      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title={t("Visitor Details")} className="max-w-xl">
        {selectedId && <VisitorDetails id={selectedId} />}
      </Modal>
    </div>
  );
}

export function VisitorDetails({ id }: { id: string }) {
  const t = useT();
  const { data, error, loading } = useLoader<any>(() => getVisitorDetails(id), id);
  if (error) return <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>;
  if (loading || !data) return <p className="py-8 text-center text-sm text-zinc-500">{t("Loading…")}</p>;
  const v = data.visitor;
  const category: Record<string, string> = { GUEST: t("Guest / Visitor"), PARENT: t("Parent / Guardian"), VENDOR: t("Vendor / Delivery"), WORKER: t("Worker / Staff") };
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        {v.photoUrl ? (
          <img src={v.photoUrl} alt={`Photo of ${v.name}`} className="h-32 w-32 sm:h-40 sm:w-40 shrink-0 rounded-2xl object-cover border border-zinc-800" />
        ) : (
          <p className="rounded-2xl bg-zinc-950 px-4 py-3 text-xs text-zinc-500">{t("No photo was taken for this visitor.")}</p>
        )}
        <div className="ml-auto shrink-0">
          <StatusBadge status={v.status} />
        </div>
      </div>
      <DetailGrid
        items={[
          ["Visitor Name", v.name],
          ["Mobile Number", v.phone],
          ["Address", v.address],
          ["Person to Visit", v.personToVisit],
          ["Purpose of Visit", v.purpose],
          ["Department", v.department],
          ["Category", category[v.category] ?? v.category],
          ["Vehicle Number", v.vehicleNumber],
          ["Gate", v.gate],
          ["Date", formatDay(v.inTime)],
          ["Actual In-Time", formatInstant(v.inTime)],
          ["Actual Out-Time", v.outTime ? formatInstant(v.outTime) : t("Still inside")],
          ["Remarks", v.remarks],
          ["Registered by", v.recordedByName],
          ["Record created", formatInstant(v.createdAt)],
        ]}
      />
    </div>
  );
}

export function DetailGrid({ items }: { items: [string, unknown][] }) {
  const t = useT();
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className={dtLabel}>{t(k)}</dt>
          <dd className="mt-0.5 text-zinc-200 break-words">{(v as any) || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Gate photos for a pass (exit / entry), loaded when the details open. */
function GatePhotos({ permissionId }: { permissionId: string }) {
  const t = useT();
  const { data } = useLoader<any>(() => getPassGatePhotos(permissionId), permissionId);
  if (!data?.photos?.length) return null;
  return (
    <div className="sm:col-span-2">
      <p className={cn(dtLabel, "mb-2")}>{t("Gate photos")}</p>
      <div className="flex flex-wrap gap-3">
        {data.photos.map((p: any) => (
          <figure key={p.at} className="space-y-1.5">
            <img src={p.url} alt={`${p.type === "EXIT" ? "Exit" : "Entry"} photo`} className="h-32 w-32 rounded-2xl object-cover border border-zinc-800" />
            <figcaption className="text-[11px] text-zinc-500 tabular-nums">
              {p.type === "EXIT" ? t("Exit") : t("Entry")} • {formatInstant(p.at)}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ─── Forms 12 & 13 — Hostel outing books ──────────────────────

export function HostelOutingView({ hostel }: { hostel: "BOYS" | "LADIES" }) {
  const t = useT();
  const f = useRegisterFilters();
  const { data, error, loading } = useLoader<any>(
    () => getHostelOutingBook({ hostel, date: f.dateParam, q: f.q, page: f.page }),
    `${hostel}|${f.dateParam}|${f.q}|${f.page}`
  );
  const [selected, setSelected] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <RegisterToolbar filters={f} searchPlaceholder="Search name, roll number, room…" />
      <p className="text-xs leading-relaxed text-zinc-500">
        {t("Outing passes are requested by the student and approved by the warden in the portal. Out and return times are the actual gate scans.")}
      </p>
      {data?.unassignedHostellers > 0 && (
        <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">
          {t("{n} hosteller(s) have no Boys / Ladies hostel set in their profile and are not listed here. Set it in Admin → Users.", { n: data.unassignedHostellers })}
        </p>
      )}
      <Shell loading={loading} error={error} empty={!!data && data.rows.length === 0}>
        {/* Phones */}
        {data?.rows.length > 0 && (
          <ul className={cn(dt.mobileList, "sm:hidden")}>
            {data.rows.map((r: any) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelected(r)} className={mobileRowBtn}>
                  <Initial name={r.studentName} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-base font-medium text-zinc-100">{r.studentName}</span>
                      <span className={dt.chip}>{r.roll}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-zinc-400">
                      {[r.room, r.purpose].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500 tabular-nums">{formatDay(r.requestedFrom)}</span>
                    <span className="mt-2 grid grid-cols-2 gap-2">
                      <span className="rounded-xl bg-zinc-950 px-3 py-2">
                        <span className={cn(dtLabel, "block")}>{t("Out")}</span>
                        <span className="block text-sm font-medium tabular-nums">
                          {r.actualOut ? <span className="text-zinc-200">{formatTime(r.actualOut.at)}</span> : <span className="text-zinc-600">{t("Not yet out")}</span>}
                        </span>
                      </span>
                      <span className="rounded-xl bg-zinc-950 px-3 py-2">
                        <span className={cn(dtLabel, "block")}>{t("In")}</span>
                        <span className="block text-sm font-medium tabular-nums">
                          {r.actualReturn ? (
                            <span className="text-zinc-200">{formatTime(r.actualReturn.at)}</span>
                          ) : r.actualOut ? (
                            <span className="text-amber-400">{t("Not returned")}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </span>
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Larger screens */}
        {data?.rows.length > 0 && (
          <div className={cn(dt.wrap, "hidden sm:block")}>
            <table className={dt.table}>
              <thead>
                <tr>
                  {["Student Name", "Roll Number", "Room", "Mobile", "Parent / Guardian", "Outing Purpose", "Date", "Out Time", "Return Date & Time", "Remarks"].map((h) => (
                    <th key={h} className={dt.th}>{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className={dt.trClickable}>
                    <td className={cn(dt.td, "whitespace-nowrap")}><PersonCell name={r.studentName || "—"} /></td>
                    <td className={cn(dt.td, "whitespace-nowrap")}><span className={dt.chip}>{r.roll}</span></td>
                    <td className={cn(dt.td, "whitespace-nowrap")}>{r.room || "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{r.mobile || "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap")}>{r.guardianName || "—"}</td>
                    <td className={cn(dt.td, "whitespace-nowrap max-w-[200px] truncate")}>{r.purpose}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{formatDay(r.requestedFrom)}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>{r.actualOut ? formatTime(r.actualOut.at) : <span className="text-zinc-600">{t("Not yet out")}</span>}</td>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>
                      {r.actualReturn ? (
                        formatInstant(r.actualReturn.at)
                      ) : r.actualOut ? (
                        <span className={cn(chipCls, "bg-amber-500/10 text-amber-400")}>{t("Not returned")}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn(dt.tdMuted, "whitespace-nowrap max-w-[200px] truncate")}>{r.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Shell>
      {data && <PagerBar page={f.page} pageSize={data.pageSize} total={data.total} onPageChange={f.setPage} itemLabel={t("records")} />}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={t("Outing pass")} className="max-w-xl">
        {selected && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[
              ["Name", selected.studentName],
              ["Roll Number", selected.roll],
              ["Branch", selected.branch],
              ["Year & Semester", [selected.year && `${t("Year")} ${selected.year}`, selected.semester && `${t("Sem")} ${selected.semester}`].filter(Boolean).join(" • ")],
              ["Room", [selected.room, selected.hostelBlock && `${t("Block")} ${selected.hostelBlock}`].filter(Boolean).join(" • ")],
              ["Mobile", selected.mobile],
              ["Purpose", selected.purpose],
              ["Destination", selected.destination],
              ["Outing Date From", formatDay(selected.requestedFrom)],
              ["Outing Date To", formatDay(selected.requestedTo)],
              ["Planned Out", formatInstant(selected.plannedOut)],
              ["Planned In", formatInstant(selected.plannedIn)],
              ["Informed to Parent / Guardian", selected.parentInformed === true ? t("Yes") : selected.parentInformed === false ? t("No") : "—"],
              ["Video Call Made to", selected.videoCallNumber],
              ["Parent / Guardian", selected.guardianName],
              ["Relation with Student", selected.guardianRelation],
              ["Hostel In-charge", selected.hostelInchargeDetails],
              ["Warden", selected.wardenDetails],
              ["Remarks", selected.remarks],
            ].map(([k, v]) => (
              <div key={k as string} className="min-w-0">
                <dt className={dtLabel}>{t(k as string)}</dt>
                <dd className="mt-0.5 text-zinc-200 break-words">{(v as any) || "—"}</dd>
              </div>
            ))}
            <div>
              <dt className={dtLabel}>{t("Actual Out")}</dt>
              <dd className="mt-0.5 text-zinc-200"><MoveCell m={selected.actualOut} /></dd>
            </div>
            <div>
              <dt className={dtLabel}>{t("Actual Return")}</dt>
              <dd className="mt-0.5 text-zinc-200"><MoveCell m={selected.actualReturn} /></dd>
            </div>
            <GatePhotos permissionId={selected.id} />
            <div className="sm:col-span-2 border-t border-zinc-800 pt-4"><StatusBadge status={selected.status} /></div>
          </dl>
        )}
      </Modal>
    </div>
  );
}

// ─── Form 16 — Home outing passbook ───────────────────────────

export function HomeOutingSummaryView() {
  const t = useT();
  const today = istDateString();
  const [to, setTo] = useState(today);
  const [from, setFrom] = useState(() => istDateString(new Date(Date.now() - 13 * 86_400_000)));
  const { data, error, loading } = useLoader<any>(() => getHomeOutingSummary({ from, to }), `${from}|${to}`);
  // 14 days per page (a range can be up to 62 days)
  const DAYS_PER_PAGE = 14;
  const [page, setPage] = useState(1);
  const [rangeKey, setRangeKey] = useState(`${from}|${to}`);
  if (rangeKey !== `${from}|${to}`) {
    setRangeKey(`${from}|${to}`);
    setPage(1);
  }
  const [day, setDay] = useState<string | null>(null);

  // Information notes for one date or a set of dates
  const notesState = useLoader<any>(() => listOutingNotes({ from, to }), `${from}|${to}`);
  const notes: OutingNote[] = notesState.data?.notes ?? [];
  const notesOn = (date: string) => notes.filter((n) => n.from <= date && n.to >= date);
  const [onlyWithInfo, setOnlyWithInfo] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [removeNote, setRemoveNote] = useState<OutingNote | null>(null);

  const allDays: any[] = data?.days ?? [];
  const days = onlyWithInfo ? allDays.filter((d) => notesOn(d.date).length > 0) : allDays;
  const pageDays = days.slice((page - 1) * DAYS_PER_PAGE, page * DAYS_PER_PAGE);

  const cols = [
    ["boysPasses", "Boys passes"],
    ["boysOut", "Boys out"],
    ["ladiesPasses", "Girls passes"],
    ["ladiesOut", "Girls out"],
    ["facultyPasses", "Faculty passes"],
    ["facultyOut", "Faculty out"],
  ] as const;

  const dateInputCls =
    "h-12 sm:h-10 w-full sm:w-auto rounded-full border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 [color-scheme:light] outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 sm:flex-row sm:items-center sm:gap-2 sm:text-sm min-w-0">
          {t("From")}
          <DateField value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={dateInputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 sm:flex-row sm:items-center sm:gap-2 sm:text-sm min-w-0">
          {t("To")}
          <DateField value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className={dateInputCls} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAddingNote(true)}
          className="inline-flex h-11 sm:h-10 items-center gap-2 rounded-full bg-orange-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" /> {t("Add info")}
        </button>
        <button
          type="button"
          aria-pressed={onlyWithInfo}
          onClick={() => {
            setOnlyWithInfo((v) => !v);
            setPage(1);
          }}
          className={cn(
            "inline-flex h-11 sm:h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
            onlyWithInfo ? "border-orange-500/30 bg-orange-500/10 text-orange-400" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
          )}
        >
          <Info className="h-4 w-4" /> {t("Only days with info")}
          {notes.length > 0 && <span className="rounded-full bg-zinc-950 px-2 py-0.5 text-[11px] tabular-nums">{notes.length}</span>}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        {t("Totals are counted from approved passes (by pass date) and actual gate exits (by exit date). Total covers the whole selected range.")}
      </p>
      {/* Totals for the whole selected range: first thing under the dates */}
      {data && data.days.length > 0 && (
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 px-4 py-4 sm:px-5 shadow-card">
          <p className="text-sm font-semibold text-zinc-100">{t("Total")}</p>
          <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-6">
            {cols.map(([k, label]) => (
              <div key={k} className="min-w-0 rounded-2xl bg-zinc-950 px-3 py-2.5">
                <p className="truncate text-[11px] text-zinc-500">{t(label)}</p>
                <p className={cn("text-xl font-semibold tabular-nums", data.totals[k] ? "text-orange-500" : "text-zinc-600")}>{data.totals[k]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 px-4 py-4 sm:px-5 shadow-card">
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Info className="h-4 w-4 text-orange-400" /> {t("Information")}
            <span className="font-normal text-zinc-500 tabular-nums">({notes.length})</span>
          </p>
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <NoteItem key={n.id} note={n} onRemove={n.canDelete ? () => setRemoveNote(n) : undefined} />
            ))}
          </ul>
        </div>
      )}

      <Shell loading={loading} error={error} empty={!!data && days.length === 0}>
        {/* Phones */}
        {data && days.length > 0 && (
          <div className="sm:hidden">
            <ul className={dt.mobileList}>
              {pageDays.map((d: any) => (
                <li key={d.date}>
                  <button type="button" onClick={() => setDay(d.date)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-950/70 active:bg-zinc-950">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-base font-medium text-zinc-100 tabular-nums">
                        {formatDay(`${d.date}T00:00:00+05:30`)}
                        {notesOn(d.date).length > 0 && infoChip}
                      </span>
                      <span className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
                        {cols.map(([k, label]) => (
                          <span key={k} className="min-w-0">
                            <span className="block truncate text-[11px] text-zinc-500">{t(label)}</span>
                            <span className={cn("block text-base font-medium tabular-nums", d[k] ? "text-zinc-100" : "text-zinc-600")}>{d[k]}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Larger screens */}
        {data && days.length > 0 && (
          <div className={cn(dt.wrap, "hidden sm:block")}>
            <table className={dt.table}>
              <thead>
                <tr>
                  <th className={dt.th}>{t("Date")}</th>
                  {cols.map(([, label]) => (
                    <th key={label} className={dt.thRight}>{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageDays.map((d: any) => (
                  <tr key={d.date} onClick={() => setDay(d.date)} className={dt.trClickable}>
                    <td className={cn(dt.td, "whitespace-nowrap tabular-nums font-medium text-zinc-100")}>
                      <span className="inline-flex items-center gap-2">
                        {formatDay(`${d.date}T00:00:00+05:30`)}
                        {notesOn(d.date).length > 0 && infoChip}
                      </span>
                    </td>
                    {cols.map(([k]) => (
                      <td key={k} className={cn(dt.td, "text-right tabular-nums", d[k] ? "text-zinc-100" : "text-zinc-600")}>{d[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Shell>

      {data && <PagerBar page={page} pageSize={DAYS_PER_PAGE} total={days.length} onPageChange={setPage} itemLabel={t("days")} />}

      <Modal open={!!day} onClose={() => setDay(null)} title={day ? t("Passes on {date}", { date: formatDay(`${day}T00:00:00+05:30`) }) : ""} className="max-w-2xl">
        {day && (
          <div className="space-y-5">
            {notesOn(day).length > 0 && (
              <ul className="space-y-2">
                {notesOn(day).map((n) => (
                  <NoteItem key={n.id} note={n} />
                ))}
              </ul>
            )}
            <DayDetails date={day} />
          </div>
        )}
      </Modal>

      <Modal open={addingNote} onClose={() => setAddingNote(false)} title={t("Add info")} className="max-w-lg">
        {addingNote && (
          <AddNoteForm
            onSaved={() => {
              setAddingNote(false);
              notesState.reload();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!removeNote}
        onClose={() => setRemoveNote(null)}
        title={t("Remove this info?")}
        description={removeNote?.note ?? ""}
        confirmText={t("Remove")}
        cancelText={t("Go Back")}
        variant="danger"
        onConfirm={async () => {
          const n = removeNote;
          setRemoveNote(null);
          if (!n) return;
          const res: any = await deleteOutingNote(n.id).catch(() => ({ error: "Could not save. Please try again." }));
          if (res?.error) window.alert(t(res.error));
          notesState.reload();
        }}
      />
    </div>
  );
}

type OutingNote = { id: string; from: string; to: string; note: string; by: string; createdAt: string; canDelete: boolean };

function InfoChip() {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-semibold text-orange-400">
      <Info className="h-3 w-3" /> {t("Info")}
    </span>
  );
}
const infoChip = <InfoChip />;

/** One information note: its dates, the text and who wrote it. */
function NoteItem({ note, onRemove }: { note: OutingNote; onRemove?: () => void }) {
  const t = useT();
  const day = (d: string) => formatDay(`${d}T00:00:00+05:30`);
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-orange-500/15 bg-orange-500/5 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-orange-400 tabular-nums">
          {note.from === note.to ? day(note.from) : `${day(note.from)} – ${day(note.to)}`}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-100">{note.note}</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {note.by} · {formatInstant(note.createdAt)}
        </p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("Remove")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/** Information for one date, or a set of dates (From – To). */
function AddNoteForm({ onSaved }: { onSaved: () => void }) {
  const t = useT();
  const today = istDateString();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token] = useState(newClientToken);
  const inputCls =
    "h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 [color-scheme:light] outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res: any = await addOutingNote({ from, to, note }, token);
          if (res?.error) setError(t(res.error));
          else onSaved();
        } catch (err) {
          setError(actionErrorMessage(err, t("Could not save. Please try again.")));
        }
        setBusy(false);
      }}
      className="space-y-4"
    >
      {error && <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5 text-sm font-medium text-zinc-200">
          <span className="block">{t("From")}</span>
          <DateField
            required
            value={from}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setFrom(v);
              if (to < v) setTo(v);
            }}
            className={inputCls}
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-zinc-200">
          <span className="block">{t("To")}</span>
          <DateField required value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-zinc-500">{t("For one day, keep From and To the same.")}</p>
      <label className="block space-y-1.5 text-sm font-medium text-zinc-200">
        <span className="block">{t("Information")}</span>
        <textarea
          required
          value={note}
          maxLength={500}
          rows={3}
          placeholder={t("e.g. Dasara holidays — hostel closed")}
          onChange={(e) => setNote(e.target.value)}
          className="flex min-h-[96px] w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-orange-600 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {busy ? t("Saving…") : t("Save info")}
      </button>
    </form>
  );
}

/** The passes behind one day's totals in the home outing passbook. */
function DayDetails({ date }: { date: string }) {
  const t = useT();
  const { data, error, loading } = useLoader<any>(() => getHomeOutingDay(date), date);
  if (error) return <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>;
  if (loading || !data) return <p className="py-8 text-center text-sm text-zinc-500">{t("Loading…")}</p>;

  const dates = (r: any) => `${formatDay(r.from)}${r.to && formatDay(r.to) !== formatDay(r.from) ? ` – ${formatDay(r.to)}` : ""}`;

  const section = (title: string, rows: any[], faculty = false) => (
    <div key={title} className="space-y-2">
      <p className="text-sm font-medium text-zinc-100">
        {t(title)} <span className="text-zinc-500 font-normal tabular-nums">({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-zinc-950 px-4 py-3 text-xs text-zinc-500">{t("None")}</p>
      ) : (
        <>
          {/* Phones */}
          <ul className="sm:hidden divide-y divide-zinc-800/70 rounded-2xl border border-zinc-800">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-zinc-100">{r.name}</p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-400">
                  {faculty ? r.department || "—" : [r.roll, r.room].filter(Boolean).join(" • ")}
                  {" · "}
                  {faculty ? t(r.requestType) : r.purpose}
                </p>
                <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                  {dates(r)} · {t("Exited")}: {r.exitedAt ? formatInstant(r.exitedAt) : "—"}
                </p>
              </li>
            ))}
          </ul>
          {/* Larger screens */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">{t("Name")}</th>
                  <th className="px-3 py-2.5">{faculty ? t("Department") : t("Roll / Room")}</th>
                  <th className="px-3 py-2.5">{faculty ? t("Type") : t("Purpose")}</th>
                  <th className="px-3 py-2.5">{t("Dates")}</th>
                  <th className="px-3 py-2.5">{t("Exited")}</th>
                  <th className="px-3 py-2.5">{t("Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium text-zinc-100">{r.name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{faculty ? r.department || "—" : [r.roll, r.room].filter(Boolean).join(" • ")}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate">{faculty ? t(r.requestType) : r.purpose}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{dates(r)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{r.exitedAt ? formatInstant(r.exitedAt) : "—"}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {section("Boys hostel", data.boys)}
      {section("Ladies hostel", data.ladies)}
      {section("Faculty", data.faculty, true)}
    </div>
  );
}

/** Full details of one gate exit / entry (student or faculty), in the registers layout. */
export function MovementDetails({ id }: { id: string }) {
  const t = useT();
  const { data, error, loading } = useLoader<any>(() => getMovementDetails(id), id);
  if (error) return <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>;
  if (loading || !data) return <p className="py-8 text-center text-sm text-zinc-500">{t("Loading…")}</p>;
  const m = data.movement;
  const p = m.pass;
  const person = m.person;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(chipCls, "px-3 py-1 text-xs uppercase tracking-wide", m.type === "EXIT" ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400")}>
          {m.type === "EXIT" ? t("Exit") : t("Entry")}
        </span>
        <span className="text-sm font-medium text-zinc-200 tabular-nums">{formatInstant(m.at)}</span>
      </div>
      {m.photoUrl ? (
        <img src={m.photoUrl} alt={`Gate photo of ${person?.name ?? "the person"}`} className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl object-cover border border-zinc-800" />
      ) : (
        <p className="rounded-2xl bg-zinc-950 px-4 py-3 text-xs text-zinc-500">{person?.kind === "Faculty" ? t("No photo for this faculty pass.") : t("No photo for this movement.")}</p>
      )}
      <DetailGrid
        items={[
          [person?.kind === "Faculty" ? "Faculty Name" : "Student Name", person?.name],
          [person?.kind === "Faculty" ? "Employee ID" : "Roll Number", person?.id],
          ["Department", person?.department],
          [person?.kind === "Faculty" ? "Designation" : "Year / Semester", person?.detail],
          ["Type", person?.type ? t(person.type) : null],
          ["Phone", person?.phone],
          ["Gate", m.gate],
          ["Recorded by", m.guard],
          ["Notes", m.notes],
        ]}
      />
      {p && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t("Pass")}</p>
          <DetailGrid
            items={[
              ["Pass", t(p.hostelPass ? "Hostel pass" : p.requestType ?? (p.type === "EXIT" ? "Exit pass" : "Entry pass"))],
              ["Purpose / Reason", p.purpose],
              ["Destination", p.destination],
              ["Dates", p.dates.from ? `${formatDay(p.dates.from)}${p.dates.to && formatDay(p.dates.to) !== formatDay(p.dates.from) ? ` – ${formatDay(p.dates.to)}` : ""}` : null],
              ["Expected Out", p.expectedExit ? formatInstant(p.expectedExit) : null],
              ["Expected Return", p.expectedReturn ? formatInstant(p.expectedReturn) : null],
              ["Contact", p.contactNumber],
              ["Remarks", p.remarks],
              ["Requested", formatInstant(p.requestedAt)],
              ["Approved", p.approvedAt ? `${formatInstant(p.approvedAt)} • ${p.approvedBy}` : null],
            ]}
          />
        </div>
      )}
    </div>
  );
}

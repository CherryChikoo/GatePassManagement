"use client";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, UserPlus } from "lucide-react";
import { Modal, StatusBadge } from "@/components/ui/primitives";
import { actionErrorMessage } from "@/lib/deployment";
import { istDateString } from "@/lib/time/ist";
import {
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
import { formatDay, formatInstant } from "./format";
import { formatTime } from "@/lib/utils";
import { Pager, RegisterToolbar, useRegisterFilters } from "./toolbar";

type Move = { at: string; gate: string | null; guard: string | null; guardEmployeeId: string | null } | null;

function MoveCell({ m }: { m: Move }) {
  if (!m) return <span className="text-zinc-600">—</span>;
  return (
    <span className="whitespace-nowrap">
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

function Shell({ loading, error, empty, children }: { loading: boolean; error: string | null; empty: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <>
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</div>}
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
        <div className="overflow-x-auto">{children}</div>
        {empty && <p className="px-4 py-10 text-center text-sm text-zinc-500">{t("No records for this selection.")}</p>}
      </div>
    </>
  );
}

const th = "px-3 py-2.5 font-medium whitespace-nowrap";
const td = "px-3 py-2.5 whitespace-nowrap";

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
      <p className="text-xs text-zinc-500">
        {t("Requests come from the faculty portal and are approved there. The out-time is marked when security scans the pass;")}
        {canMarkIn ? t(" use “Mark In” when the faculty member returns.") : t(" the in-time when they return.")}
      </p>
      {msg && <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200">{msg}</div>}
      <Shell loading={loading} error={error} empty={!!data && data.rows.length === 0}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              {["Request Date", "Faculty Name", "Designation", "Department", "Request Type", "Start Date", "End Date", "Actual Out-Time", "Actual In-Time"].map((h) => (
                <th key={h} className={th}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {data?.rows.map((r: any) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer hover:bg-zinc-800/40 text-zinc-300">
                <td className={td}>{formatDay(r.requestDate)}</td>
                <td className={`${td} font-medium text-zinc-100`}>{r.facultyName}</td>
                <td className={td}>{r.designation || "—"}</td>
                <td className={td}>{r.department || "—"}</td>
                <td className={td}>{t(r.requestType)}</td>
                <td className={td}>{formatDay(r.startDate)}</td>
                <td className={td}>{formatDay(r.endDate)}</td>
                <td className={td}><MoveCell m={r.actualOut} /></td>
                <td className={td}>
                  {r.actualIn ? (
                    <MoveCell m={r.actualIn} />
                  ) : canMarkIn && r.canMarkIn ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markIn(r.id);
                      }}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <LogIn className="h-3.5 w-3.5" /> {t("Mark In")}
                    </button>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Shell>
      {data && <Pager page={f.page} pageSize={data.pageSize} total={data.total} onPage={f.setPage} />}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={t("Faculty pass")} className="max-w-xl">
        {selected && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t(k as string)}</dt>
                <dd className="text-zinc-200 break-words">{(v as any) || "—"}</dd>
              </div>
            ))}
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Actual Out-Time")}</dt>
              <dd className="text-zinc-200"><MoveCell m={selected.actualOut} /></dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Actual In-Time")}</dt>
              <dd className="text-zinc-200"><MoveCell m={selected.actualIn} /></dd>
            </div>
            <GatePhotos permissionId={selected.id} />
            <div className="sm:col-span-2 flex items-center gap-2">
              <StatusBadge status={selected.status} />
              {canMarkIn && selected.canMarkIn && (
                <button
                  onClick={() => markIn(selected.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <LogIn className="h-3.5 w-3.5" /> {t("Mark In now")}
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
  return (
    <div className="space-y-4">
      <RegisterToolbar
        filters={f}
        searchPlaceholder="Search name, phone, person to visit…"
        action={
          canRegister ? (
            <Link
              href="/security/visitors"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" /> {t("Register visitor")}
            </Link>
          ) : null
        }
      />
      <Shell loading={loading} error={error} empty={!!data && data.rows.length === 0}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              {["Visitor Name", "Address", "Mobile", "Person to Visit", "Purpose", "Department", "Date", "In-Time", "Out-Time", "Remarks", "Recorded by"].map((h) => (
                <th key={h} className={th}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
            {data?.rows.map((r: any) => (
              <tr key={r.id} onClick={() => setSelectedId(r.id)} className="cursor-pointer hover:bg-zinc-800/40">
                <td className={`${td} font-medium text-zinc-100`}>{r.name}</td>
                <td className={`${td} max-w-[200px] truncate`}>{r.address || "—"}</td>
                <td className={td}>{r.phone}</td>
                <td className={td}>{r.personToVisit || "—"}</td>
                <td className={`${td} max-w-[200px] truncate`}>{r.purpose}</td>
                <td className={td}>{r.department || "—"}</td>
                <td className={td}>{formatDay(r.inTime)}</td>
                <td className={td}>{r.inTime ? formatTime(r.inTime) : "—"}</td>
                <td className={td}>{r.outTime ? formatInstant(r.outTime) : <span className="text-amber-300">{t("Inside")}</span>}</td>
                <td className={`${td} max-w-[200px] truncate`}>{r.remarks || "—"}</td>
                <td className={td}>{r.recordedByName || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Shell>
      {data && <Pager page={f.page} pageSize={data.pageSize} total={data.total} onPage={f.setPage} />}

      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title={t("Visitor Details")} className="max-w-xl">
        {selectedId && <VisitorDetails id={selectedId} />}
      </Modal>
    </div>
  );
}

export function VisitorDetails({ id }: { id: string }) {
  const t = useT();
  const { data, error, loading } = useLoader<any>(() => getVisitorDetails(id), id);
  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (loading || !data) return <p className="text-sm text-zinc-500">{t("Loading…")}</p>;
  const v = data.visitor;
  const category: Record<string, string> = { GUEST: t("Guest / Visitor"), PARENT: t("Parent / Guardian"), VENDOR: t("Vendor / Delivery"), WORKER: t("Worker / Staff") };
  return (
    <div className="space-y-4">
      {v.photoUrl ? (
         
        <img src={v.photoUrl} alt={`Photo of ${v.name}`} className="h-40 w-40 rounded-xl object-cover border border-zinc-800" />
      ) : (
        <p className="text-xs text-zinc-500">{t("No photo was taken for this visitor.")}</p>
      )}
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
      <StatusBadge status={v.status} />
    </div>
  );
}

export function DetailGrid({ items }: { items: [string, unknown][] }) {
  const t = useT();
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t(k)}</dt>
          <dd className="text-zinc-200 break-words">{(v as any) || "—"}</dd>
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
      <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">{t("Gate photos")}</p>
      <div className="flex flex-wrap gap-3">
        {data.photos.map((p: any) => (
          <figure key={p.at} className="space-y-1">
            { }
            <img src={p.url} alt={`${p.type === "EXIT" ? "Exit" : "Entry"} photo`} className="h-32 w-32 rounded-lg object-cover border border-zinc-800" />
            <figcaption className="text-[11px] text-zinc-400">
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
      <p className="text-xs text-zinc-500">
        {t("Outing passes are requested by the student and approved by the warden in the portal. Out and return times are the actual gate scans.")}
      </p>
      {data?.unassignedHostellers > 0 && (
        <p className="text-xs text-amber-300">
          {t("{n} hosteller(s) have no Boys / Ladies hostel set in their profile and are not listed here. Set it in Admin → Users.", { n: data.unassignedHostellers })}
        </p>
      )}
      <Shell loading={loading} error={error} empty={!!data && data.rows.length === 0}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              {["Student Name", "Roll Number", "Room", "Mobile", "Parent / Guardian", "Outing Purpose", "Date", "Out Time", "Return Date & Time", "Remarks"].map((h) => (
                <th key={h} className={th}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
            {data?.rows.map((r: any) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer hover:bg-zinc-800/40">
                <td className={`${td} font-medium text-zinc-100`}>{r.studentName}</td>
                <td className={td}>{r.roll}</td>
                <td className={td}>{r.room || "—"}</td>
                <td className={td}>{r.mobile || "—"}</td>
                <td className={td}>{r.guardianName || "—"}</td>
                <td className={`${td} max-w-[200px] truncate`}>{r.purpose}</td>
                <td className={td}>{formatDay(r.requestedFrom)}</td>
                <td className={td}>{r.actualOut ? formatTime(r.actualOut.at) : <span className="text-zinc-600">{t("Not yet out")}</span>}</td>
                <td className={td}>{r.actualReturn ? formatInstant(r.actualReturn.at) : r.actualOut ? <span className="text-amber-300">{t("Not returned")}</span> : "—"}</td>
                <td className={`${td} max-w-[200px] truncate`}>{r.remarks || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Shell>
      {data && <Pager page={f.page} pageSize={data.pageSize} total={data.total} onPage={f.setPage} />}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={t("Outing pass")} className="max-w-xl">
        {selected && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t(k as string)}</dt>
                <dd className="text-zinc-200 break-words">{(v as any) || "—"}</dd>
              </div>
            ))}
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Actual Out")}</dt>
              <dd className="text-zinc-200"><MoveCell m={selected.actualOut} /></dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Actual Return")}</dt>
              <dd className="text-zinc-200"><MoveCell m={selected.actualReturn} /></dd>
            </div>
            <GatePhotos permissionId={selected.id} />
            <div className="sm:col-span-2"><StatusBadge status={selected.status} /></div>
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
  const days: any[] = data?.days ?? [];
  const pageDays = days.slice((page - 1) * DAYS_PER_PAGE, page * DAYS_PER_PAGE);
  const [day, setDay] = useState<string | null>(null);

  const cols = [
    ["boysPasses", "Boys passes"],
    ["boysOut", "Boys out"],
    ["ladiesPasses", "Girls passes"],
    ["ladiesOut", "Girls out"],
    ["facultyPasses", "Faculty passes"],
    ["facultyOut", "Faculty out"],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
        <label className="flex items-center gap-2">
          {t("From")}
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-zinc-200 [color-scheme:light]" />
        </label>
        <label className="flex items-center gap-2">
          {t("To")}
          <input type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-zinc-200 [color-scheme:light]" />
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        {t("Totals are counted from approved passes (by pass date) and actual gate exits (by exit date). The Total row covers the whole selected range.")}
      </p>
      <Shell loading={loading} error={error} empty={!!data && data.days.length === 0}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className={th}>{t("Date")}</th>
              {cols.map(([, label]) => (
                <th key={label} className={`${th} text-right`}>{t(label)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
            {pageDays.map((d: any) => (
              <tr key={d.date} onClick={() => setDay(d.date)} className="cursor-pointer hover:bg-zinc-800/40">
                <td className={td}>{formatDay(`${d.date}T00:00:00+05:30`)}</td>
                {cols.map(([k]) => (
                  <td key={k} className={`${td} text-right tabular-nums ${d[k] ? "text-zinc-100" : "text-zinc-600"}`}>{d[k]}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {data && (
            <tfoot className="bg-zinc-900/80 font-semibold text-zinc-100">
              <tr>
                <td className={td}>{t("Total")}</td>
                {cols.map(([k]) => (
                  <td key={k} className={`${td} text-right tabular-nums`}>{data.totals[k]}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </Shell>

      {data && <Pager page={page} pageSize={DAYS_PER_PAGE} total={days.length} onPage={setPage} />}

      <Modal open={!!day} onClose={() => setDay(null)} title={day ? t("Passes on {date}", { date: formatDay(`${day}T00:00:00+05:30`) }) : ""} className="max-w-2xl">
        {day && <DayDetails date={day} />}
      </Modal>
    </div>
  );
}

/** The passes behind one day's totals in the home outing passbook. */
function DayDetails({ date }: { date: string }) {
  const t = useT();
  const { data, error, loading } = useLoader<any>(() => getHomeOutingDay(date), date);
  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (loading || !data) return <p className="text-sm text-zinc-500">{t("Loading…")}</p>;

  const section = (title: string, rows: any[], faculty = false) => (
    <div key={title} className="space-y-2">
      <p className="text-sm font-semibold text-zinc-200">
        {t(title)} <span className="text-zinc-500 font-normal">({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">{t("None")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900 text-left text-zinc-500">
              <tr>
                <th className="px-2 py-2">{t("Name")}</th>
                <th className="px-2 py-2">{faculty ? t("Department") : t("Roll / Room")}</th>
                <th className="px-2 py-2">{faculty ? t("Type") : t("Purpose")}</th>
                <th className="px-2 py-2">{t("Dates")}</th>
                <th className="px-2 py-2">{t("Exited")}</th>
                <th className="px-2 py-2">{t("Status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.name}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{faculty ? r.department || "—" : [r.roll, r.room].filter(Boolean).join(" • ")}</td>
                  <td className="px-2 py-1.5 max-w-[180px] truncate">{faculty ? t(r.requestType) : r.purpose}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {formatDay(r.from)}{r.to && formatDay(r.to) !== formatDay(r.from) ? ` – ${formatDay(r.to)}` : ""}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.exitedAt ? formatInstant(r.exitedAt) : "—"}</td>
                  <td className="px-2 py-1.5"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (loading || !data) return <p className="text-sm text-zinc-500">{t("Loading…")}</p>;
  const m = data.movement;
  const p = m.pass;
  const person = m.person;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${m.type === "EXIT" ? "bg-orange-500/15 text-orange-300" : "bg-emerald-500/15 text-emerald-300"}`}>
          {m.type === "EXIT" ? t("Exit") : t("Entry")}
        </span>
        <span className="text-sm text-zinc-300">{formatInstant(m.at)}</span>
      </div>
      {m.photoUrl ? (
         
        <img src={m.photoUrl} alt={`Gate photo of ${person?.name ?? "the person"}`} className="h-40 w-40 rounded-xl object-cover border border-zinc-800" />
      ) : (
        <p className="text-xs text-zinc-500">{person?.kind === "Faculty" ? t("No photo for this faculty pass.") : t("No photo for this movement.")}</p>
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{t("Pass")}</p>
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

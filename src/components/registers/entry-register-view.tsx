"use client";
import { callGate } from "@/lib/gate-call";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useT } from "@/components/providers/language-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Clock, Eye, FilePlus2, FileText, History, KeyRound, Loader2, LogIn, LogOut, PencilLine, Trash2, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Modal } from "@/components/ui/primitives";
import { Card } from "@/components/ui/card";
import { dt, IconAction, RowActions } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
import { cn, withTimeout } from "@/lib/utils";
import type { EntryRegister, FieldDef } from "@/lib/registers/definitions";
import { isSirosLabour, pendingActions, updatableFields, yesNoWords } from "@/lib/registers/definitions";
import { adminDeleteRegisterEntry, adminUpdateRegisterEntry } from "@/server/actions/registers";
import { fetchEntryList, invalidateEntryLists, markEntryListsStale, peekEntryList } from "./entry-list-cache";
import { visitExitMessage } from "@/components/visits/visit-code";
import { useLiveTopics } from "@/lib/realtime/live";
import { actionErrorMessage } from "@/lib/deployment";
import { AdminEditForm, CloseRecordForm, MovementForm, RegisterForm, clearRegisterDraft, type StaffOption } from "./register-form";
import { formatFieldValue, formatInstant, newClientToken } from "./format";
import { displayValue } from "./localize";
import { FactList, InOutCard, RecordHeader, type Fact, type MoveSide } from "./record-layout";
import type { Translate } from "@/lib/i18n";
import { RegisterToolbar, useRegisterFilters } from "./toolbar";

type Supplement = {
  id: string;
  kind: string;
  data: Record<string, any>;
  reason: string | null;
  createdAt: string;
  recordedByName: string;
  recordedByRole: string;
  recordedByEmployeeId: string | null;
  recordedAtGate: string | null;
};
type Entry = {
  id: string;
  entryDate: string;
  createdAt: string;
  recordedByName: string;
  recordedByRole: string;
  recordedByEmployeeId: string | null;
  recordedAtGate: string | null;
  original: Record<string, any>;
  current: Record<string, any>;
  supplements: Supplement[];
  /** Came to meet a faculty / staff member (meeting code needed to go out while open) */
  visit?: {
    hostName: string;
    open: boolean;
    met: boolean;
    locked: boolean;
    exitMethod: string | null;
    overrideReason: string | null;
    exitedByName: string | null;
  } | null;
};

function recorderLine(r: { recordedByName: string; recordedByRole: string; recordedByEmployeeId: string | null; recordedAtGate: string | null }, t: Translate) {
  return [r.recordedByName, r.recordedByEmployeeId, r.recordedAtGate, r.recordedByRole === "ADMIN" ? t("Admin") : null].filter(Boolean).join(" • ");
}

/** "Record In" / "Record Out" / "Mark workers out" — what the guard can still record. */
function nextActionLabel(def: EntryRegister, current: Record<string, any>, t: Translate): string | null {
  const p = pendingActions(def, current);
  if (p.next) return t("Record {side}", { side: p.next.label });
  if (p.groups.length) return t("Mark {group} out", { group: p.groups[0].group.label.toLowerCase() });
  return null;
}

export function EntryRegisterView({
  def,
  canCreate,
  canAdminEdit = false,
  canEdit = false,
}: {
  def: EntryRegister;
  canCreate: boolean;
  /** Main Admin: edit and delete saved records */
  canAdminEdit?: boolean;
  /** Security on registers they may edit (e.g. Cooli Book): edit, saved as a correction */
  canEdit?: boolean;
}) {
  const t = useT();
  const filters = useRegisterFilters();
  const [data, setData] = useState<{ entries: Entry[]; total: number; pageSize: number; canOverrideVisit?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [mode, setMode] = useState<null | "new" | "record" | "edit" | "close">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Bumped on each failed save: the popup scrolls up to the error message
  const [errorNo, setErrorNo] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState(newClientToken);
  const [formKey, setFormKey] = useState(0);

  const needsStaff = def.fields.some((f) => f.type === "staff");
  // Registers with a Shift choice (Security Daily Book, Attendance) get shift chips
  const shiftField = def.fields.find((f) => f.key === "shift" && f.type === "select");

  // Only the newest load may update the list or clear the loading state
  const loadNo = useRef(0);
  /**
   * fresh: the register just changed here — skip the cached copy.
   * silent: changed elsewhere (live update) — keep the list on screen, no
   * loading state, and swap in the new list when it arrives.
   */
  const load = useCallback(async (fresh = false, silent = false) => {
    const no = ++loadNo.current;
    const params = { register: def.key, date: filters.dateParam, q: filters.q, page: filters.page, shift: filters.shift };
    if (fresh) invalidateEntryLists(def.key);
    // A list seen before shows at once; the fresh copy replaces it quietly
    const cached = fresh || silent ? null : peekEntryList(params);
    if (cached) setData(cached);
    if (!silent) {
      setLoading(!cached);
      setError(null);
    }
    try {
      const res = await withTimeout(fetchEntryList(params, !fresh && !silent));
      if (no !== loadNo.current) return;
      setData(res);
      if (silent) setError(null);
      return res.entries as Entry[];
    } catch (err) {
      if (no === loadNo.current && !silent) setError(actionErrorMessage(err, t("Could not load the register.")));
    } finally {
      if (no === loadNo.current) setLoading(false);
    }
  }, [def.key, filters.dateParam, filters.q, filters.page, filters.shift, t]);

  // Live: another guard (or the admin) changed a register
  useLiveTopics(["reg:"], (changed) => {
    const all = changed.includes("*");
    const regs = changed.filter((c) => c.startsWith("reg:")).map((c) => c.slice(4));
    markEntryListsStale(all ? "*" : regs);
    if (!all && !regs.includes(def.key)) return;
    load(false, true).then((entries) => {
      // An open record shows its newest state (e.g. Out just recorded at another gate)
      if (entries) setSelected((cur) => (cur ? entries.find((e) => e.id === cur.id) ?? cur : cur));
    });
  });

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (needsStaff) callGate("getRegisterStaffOptions", [], 15_000).then((s: any) => setStaff(Array.isArray(s) ? s : [])).catch(() => setStaff([]));
  }, [needsStaff]);

  function openMode(m: "new" | "record" | "edit" | "close", entry?: Entry | null) {
    setFormError(null);
    setToken(newClientToken());
    setFormKey((k) => k + 1);
    if (entry !== undefined) setSelected(entry);
    setMode(m);
  }

  async function run(action: () => Promise<any>, done: string) {
    setBusy(true);
    setFormError(null);
    try {
      const res = await action();
      if (res?.error) {
        setFormError(visitExitMessage(t, res));
        setErrorNo((n) => n + 1);
      } else {
        setNotice(done);
        setTimeout(() => setNotice(null), 4000);
        setMode(null);
        setSelected(null);
        const entries = await load(true);
        // Registers with a list (e.g. coolies): show the saved record and its list
        if (res?.id && def.groups?.length) {
          const saved = entries?.find((e) => e.id === res.id);
          if (saved) setSelected(saved);
        }
      }
    } catch (err) {
      setFormError(actionErrorMessage(err, t("Could not save. Please try again.")));
      setErrorNo((n) => n + 1);
    }
    setBusy(false);
  }

  // One tap on a row: record the missing side now (e.g. "Duty end"). A side
  // that needs a reading (Car Book km) opens the small form instead.
  const [quickId, setQuickId] = useState<string | null>(null);
  async function quickRecord(e: Entry) {
    const next = pendingActions(def, e.current).next;
    if (!next || quickId) return;
    if (next.readingKey || (e.visit?.open && next.direction === "OUT")) {
      openMode("record", e);
      return;
    }
    setQuickId(e.id);
    setError(null);
    try {
      const res: any = await callGate("completeRegisterEntry", [e.id, { markMovement: true }, newClientToken()]);
      if (res?.error) {
        setError(res.error);
      } else {
        setNotice(t("{side} recorded.", { side: next.label }));
        setTimeout(() => setNotice(null), 4000);
        await load(true);
      }
    } catch (err) {
      setError(actionErrorMessage(err, t("Could not save. Please try again.")));
    }
    setQuickId(null);
  }
  // Lists with people still in (e.g. coolies): "Mark out" opens the tick-list
  const hasQuick = (e: Entry) => {
    if (!canCreate) return false;
    const p = pendingActions(def, e.current);
    return !!p.next || p.groups.length > 0;
  };
  const quickButton = (e: Entry, size: "lg" | "sm") => {
    const pend = canCreate ? pendingActions(def, e.current) : null;
    const next = pend?.next ?? null;
    if (!next && pend?.groups.length) {
      return (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            openMode("record", e);
          }}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-sky-600 font-semibold text-white transition-[background-color,transform] hover:bg-sky-700 active:scale-[0.97]",
            size === "lg" ? "h-11 px-4 text-sm" : "h-8 px-3 text-xs"
          )}
        >
          <LogOut className="h-4 w-4" />
          <span className="whitespace-nowrap">{t("Mark out")}</span>
        </button>
      );
    }
    if (!next) return null;
    const Icon = next.direction === "OUT" ? LogOut : LogIn;
    const saving = quickId === e.id;
    return (
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          quickRecord(e);
        }}
        disabled={!!quickId}
        aria-label={t("Record {side}", { side: next.label })}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold text-white transition-[background-color,transform] active:scale-[0.97] disabled:opacity-60",
          next.direction === "OUT" ? "bg-sky-600 hover:bg-sky-700" : "bg-emerald-600 hover:bg-emerald-700",
          size === "lg" ? "h-11 px-4 text-sm" : "h-8 px-3 text-xs"
        )}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        <span className="whitespace-nowrap">{next.label}</span>
      </button>
    );
  };

  const columns = def.listFields.map((k) => def.fields.find((f) => f.key === k)).filter((f): f is NonNullable<typeof f> => !!f);
  // Yes / No statuses (e.g. Payment completed): their own column in the list
  const statusCols = updatableFields(def).filter((f) => f.type === "yesno" && !def.listFields.includes(f.key));
  // Security (on registers they record in) and Main Admin change status / remarks from the record
  const canUpdate = canCreate || canAdminEdit;

  /** Saves one status / remarks change; returns an error message, or null when saved. */
  async function updateField(key: string, value: unknown): Promise<string | null> {
    const entry = selected;
    if (!entry) return null;
    try {
      const res: any = await callGate("updateRegisterField", [entry.id, key, value, newClientToken()]);
      if (res?.error) return t(res.error);
      // Show the change at once; the reload adds the history line
      const shown = typeof value === "string" ? value.trim() || null : value;
      setSelected((cur) => (cur && cur.id === entry.id ? { ...cur, current: { ...cur.current, [key]: shown } } : cur));
      const entries = await load(true);
      const fresh = entries?.find((x) => x.id === entry.id);
      if (fresh) setSelected((cur) => (cur && cur.id === fresh.id ? fresh : cur));
      return null;
    } catch (err) {
      return actionErrorMessage(err, t("Could not save. Please try again."));
    }
  }

  const hasStarted = !!def.movement && !def.movement.single;
  const directionChip = (dir: unknown) =>
    def.movement && (dir === "IN" || dir === "OUT") ? (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
          dir === "IN" ? "bg-emerald-500/10 text-emerald-400" : "bg-sky-500/10 text-sky-400"
        }`}
      >
        {dir === "IN" ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
        {dir === "IN" ? def.movement.in.label : def.movement.out.label}
      </span>
    ) : null;
  const openChip = (
    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 whitespace-nowrap">
      {t("Open")}
    </span>
  );

  return (
    <div className="space-y-4">
      <RegisterToolbar
        filters={filters}
        action={
          canCreate ? (
            <button
              onClick={() => openMode("new", null)}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-14 sm:h-10 px-6 rounded-full bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white text-base sm:text-sm font-semibold shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)] transition-[background-color,transform]"
            >
              <FilePlus2 className="h-5 w-5 sm:h-4 sm:w-4" /> {t("New entry")}
            </button>
          ) : null
        }
      />

      {shiftField && (
        <div role="radiogroup" aria-label={t("Shift")} className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <span className="shrink-0 text-xs font-medium text-zinc-500">{t("Shift")}</span>
          {[
            { v: "", l: t("All") },
            ...(shiftField.options ?? []).map((o) => ({ v: o, l: t(o) })),
            ...(shiftField.allowOther ? [{ v: "OTHER", l: t("Other") }] : []),
          ].map((o) => {
            const active = filters.shift === o.v;
            return (
              <button
                key={o.v || "all"}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => filters.setShift(o.v)}
                className={cn(
                  "h-10 min-w-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                  active
                    ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                    : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                )}
              >
                {o.l}
              </button>
            );
          })}
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span>{t(error)}</span>
          <button type="button" onClick={() => load(true)} className="h-10 rounded-full bg-red-500/10 px-4 text-sm font-semibold text-red-500 hover:bg-red-500/20">
            {t("Try again")}
          </button>
        </div>
      )}

      <LoadingPill active={loading} />
      <Card className={cn("overflow-hidden transition-opacity", loading && "opacity-60")}>
        {/* Phones: stacked rows */}
        {data && data.entries.length > 0 && (
          <ul className={cn(dt.mobileList, "lg:hidden")}>
            {data.entries.map((e) => {
              const open = pendingActions(def, e.current).any;
              const [first, ...rest] = columns;
              const meta = rest
                .map((c) => displayValue(c, e.current[c.key], t))
                .filter((v) => v && v !== "—")
                .join(" · ");
              return (
                <li key={e.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setSelected(e)}
                    className="flex min-w-0 flex-1 min-h-[72px] items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-zinc-950 hover:bg-zinc-950/70"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-base font-medium text-zinc-100">
                          {first ? displayValue(first, e.current[first.key], t) : formatFieldValue({ key: "d", label: "", type: "date" }, e.entryDate)}
                        </span>
                        {open && openChip}
                      </span>
                      {meta && <span className="mt-0.5 block truncate text-sm text-zinc-400">{meta}</span>}
                      {e.visit && <MeetingChip visit={e.visit} />}
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                        {statusCols.map((c) => (
                          <StatusChip key={c.key} field={c} withLabel value={e.current[c.key]} />
                        ))}
                        {hasStarted && directionChip(e.current.direction)}
                        <span className="tabular-nums">{formatFieldValue({ key: "d", label: "", type: "date" }, e.entryDate)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{e.recordedByName}</span>
                      </span>
                    </span>
                    {!hasQuick(e) && (
                      <ChevronRight className="h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />
                    )}
                  </button>
                  {hasQuick(e) && <span className="pr-4">{quickButton(e, "lg")}</span>}
                </li>
              );
            })}
          </ul>
        )}

        {/* Larger screens: table */}
        {data && data.entries.length > 0 && (
          <div className={cn(dt.wrap, "hidden lg:block")}>
            <table className={dt.table}>
              <thead>
                <tr>
                  <th className={dt.th}>{t("Date")}</th>
                  {hasStarted && <th className={dt.th}>{t("Started")}</th>}
                  {columns.map((c) => (
                    <th key={c.key} className={dt.th}>{c.label}</th>
                  ))}
                  {statusCols.map((c) => (
                    <th key={c.key} className={dt.th}>{c.label}</th>
                  ))}
                  <th className={dt.th}>{t("Recorded by")}</th>
                  <th className={dt.thRight}>
                    <span className="sr-only">{t("Action")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => {
                  const open = pendingActions(def, e.current).any;
                  return (
                    <tr key={e.id} onClick={() => setSelected(e)} className={dt.trClickable}>
                      <td className={cn(dt.td, "whitespace-nowrap tabular-nums")}>
                        <span className="flex flex-col items-start gap-1">
                          {formatFieldValue({ key: "d", label: "", type: "date" }, e.entryDate)}
                          {open && openChip}
                          {e.visit && <MeetingChip visit={e.visit} />}
                        </span>
                      </td>
                      {hasStarted && <td className={cn(dt.td, "whitespace-nowrap")}>{directionChip(e.current.direction) ?? <span className="text-zinc-600">—</span>}</td>}
                      {columns.map((c, i) => (
                        <td key={c.key} className={cn(dt.td, "whitespace-nowrap max-w-[220px] truncate", i === 0 ? "font-medium text-zinc-100" : "text-zinc-400")}>
                          {displayValue(c, e.current[c.key], t)}
                        </td>
                      ))}
                      {statusCols.map((c) => (
                        <td key={c.key} className={cn(dt.td, "whitespace-nowrap")}>
                          <StatusChip field={c} value={e.current[c.key]} />
                        </td>
                      ))}
                      <td className={cn(dt.tdMuted, "whitespace-nowrap")}>{e.recordedByName}</td>
                      <td className={dt.tdActions}>
                        <RowActions>
                          {quickButton(e, "sm")}
                          <IconAction label={t("View details")} icon={<Eye />} onClick={() => setSelected(e)} />
                        </RowActions>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
              <FileText className="h-5 w-5" />
            </span>
            <p className="text-sm text-zinc-500">{filters.dateParam === "all" ? t("No records yet.") : t("No records for this date.")}</p>
          </div>
        )}
        {!data && !error && <p className="px-4 py-12 text-center text-sm text-zinc-500">{t("Loading…")}</p>}
      </Card>

      {data && <PagerBar page={filters.page} pageSize={data.pageSize} total={data.total} onPageChange={filters.setPage} itemLabel={t("records")} />}

      {/* Details */}
      <Modal open={!!selected && mode === null} onClose={() => setSelected(null)} title={def.title} className="max-w-2xl">
        {selected && (
          <EntryDetails
            def={def}
            entry={selected}
            onRecord={canCreate && pendingActions(def, selected.current).any ? () => openMode("record") : undefined}
            // Someone with an open meeting code leaves through Out (with the code), not "Close record"
            onCloseRecord={canCreate && pendingActions(def, selected.current).next && !selected.visit?.open ? () => openMode("close") : undefined}
            onEdit={canAdminEdit || canEdit ? () => openMode("edit") : undefined}
            onDelete={canAdminEdit ? () => setConfirmDelete(true) : undefined}
            onUpdateField={canUpdate ? updateField : undefined}
          />
        )}
      </Modal>

      {/* New record / record the other side */}
      <Modal
        open={mode !== null}
        onClose={() => !busy && setMode(null)}
        title={
          mode === "new"
            ? `${t("New entry")} — ${def.title}`
            : mode === "edit"
            ? `${t("Edit record")} — ${def.title}`
            : mode === "close"
            ? t("Close record")
            : selected
            ? nextActionLabel(def, selected.current, t) ?? def.title
            : def.title
        }
        className="max-w-2xl"
        scrollTopKey={errorNo}
      >
        {formError && <div role="alert" className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{formError}</div>}
        {mode === "new" && (
          <RegisterForm
            key={formKey}
            def={def}
            staff={staff}
            busy={busy}
            onSubmit={(payload) =>
              run(async () => {
                const res: any = await callGate("createRegisterEntry", [def.key, payload, token]);
                if (!res?.error) clearRegisterDraft(def.key);
                return res;
              }, t("Record saved."))
            }
          />
        )}
        {mode === "edit" && selected && (
          <AdminEditForm
            key={formKey}
            keepsHistory={!canAdminEdit}
            def={def}
            current={selected.current}
            staff={staff}
            busy={busy}
            onSubmit={(payload) =>
              run(
                () => (canAdminEdit ? adminUpdateRegisterEntry(selected.id, payload) : callGate("securityEditRegisterEntry", [selected.id, payload, token])),
                t("Record updated.")
              )
            }
          />
        )}
        {mode === "close" && selected && (
          <CloseRecordForm
            key={formKey}
            def={def}
            current={selected.current}
            busy={busy}
            onSubmit={(payload) => run(() => callGate("completeRegisterEntry", [selected.id, payload, token]), t("Record closed."))}
          />
        )}
        {mode === "record" && selected && (
          <MovementForm
            key={formKey}
            def={def}
            current={selected.current}
            visit={selected.visit ?? null}
            canOverrideVisit={!!data?.canOverrideVisit}
            busy={busy}
            onSubmit={(payload) => run(() => callGate("completeRegisterEntry", [selected.id, payload, token]), t("Saved."))}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this record?"
        description="The record is removed permanently from this register and cannot be recovered."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => {
          setConfirmDelete(false);
          if (selected) {
            const id = selected.id;
            run(() => adminDeleteRegisterEntry(id), "Record deleted.");
          }
        }}
      />
    </div>
  );
}

/** Photo saved with a register entry (signed, short-lived link). */
function RegisterPhoto({ path }: { path: unknown }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  // The link could not be loaded: say so instead of a placeholder forever
  const [failed, setFailed] = useState(false);
  const valid = typeof path === "string" && path.startsWith("registers/");
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    callGate("getRegisterPhotoUrl", [path as string], 15_000)
      .then((u) => {
        if (cancelled) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [path, valid]);
  if (!valid) return <span className="text-zinc-600">—</span>;
  if (failed) return <span className="text-sm text-zinc-500">{t("Photo unavailable")}</span>;
  if (!url) return <span className="inline-block h-40 w-40 animate-pulse rounded-2xl bg-zinc-950" />;
  return (
     
    <img src={url} alt="" className="h-40 w-40 rounded-2xl border border-zinc-800 object-cover" />
  );
}

/** A register record, top to bottom: who it is, the In / Out card, then the filled details */
function ValuesGrid({ def, values }: { def: EntryRegister; values: Record<string, any> }) {
  const t = useT();
  const m = def.movement;
  const fieldOf = (key?: string) => (key ? def.fields.find((f) => f.key === key) : undefined);
  const show = (key?: string) => {
    const f = fieldOf(key);
    const v = key ? values[key] : undefined;
    if (!f || v === null || v === undefined || v === "") return null;
    return displayValue(f, v, t);
  };

  // 1. Who / what: the list's headline field, and the next two as a short line
  const headField = fieldOf(def.listFields[0]);
  const title = headField && headField.type !== "photo" ? show(headField.key) : null;
  const moveKeys = new Set(
    m ? [m.in.timeKey, m.out.timeKey, m.in.readingKey, m.out.readingKey, m.directionField, "direction"].filter(Boolean) : []
  );
  const subtitle = def.listFields
    .slice(1)
    .filter((k) => !moveKeys.has(k) && fieldOf(k)?.type !== "photo")
    .map((k) => show(k))
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");

  // 2. In / Out, in the order they happened
  let sides: MoveSide[] = [];
  let status: React.ReactNode = null;
  if (m) {
    const startDir: "IN" | "OUT" = values.direction === "OUT" ? "OUT" : values.direction === "IN" ? "IN" : m.firstDirections[0] ?? "IN";
    const sideOf = (dir: "IN" | "OUT") => (dir === "IN" ? m.in : m.out);
    const reading = (key?: string) => (key && show(key) ? `${fieldOf(key)?.label}: ${show(key)}` : null);
    if (m.single) {
      const side = sideOf(startDir);
      sides = [{ label: side.label, time: show(side.timeKey), detail: reading(side.readingKey), direction: startDir }];
    } else {
      const otherDir: "IN" | "OUT" = startDir === "IN" ? "OUT" : "IN";
      const first = sideOf(startDir);
      const second = sideOf(otherDir);
      const firstTime = show(first.timeKey);
      const secondTime = show(second.timeKey);
      sides = [
        { label: first.label, time: firstTime, detail: reading(first.readingKey), direction: startDir },
        {
          label: second.label,
          time: secondTime,
          detail: reading(second.readingKey),
          direction: otherDir,
          pending: firstTime ? (otherDir === "IN" ? t("Not back yet") : t("Still inside")) : undefined,
        },
      ];
      const chip = (text: string, cls: string) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{text}</span>
      );
      if (firstTime && secondTime) status = chip(t("Completed"), "bg-emerald-500/10 text-emerald-600");
      else if (firstTime && values.oneWay !== true)
        status = startDir === "IN" ? chip(t("Inside"), "bg-amber-500/10 text-amber-600") : chip(t("Out"), "bg-sky-500/10 text-sky-500");
    }
  }

  // 3. Everything else (status / remarks sections and the In / Out fields have their own places)
  const facts: Fact[] = [
    ...(def.fixed ?? []).filter((x) => !x.note).map((x) => ({ label: x.label, value: x.value })),
    ...def.fields
      .filter((f) => !f.updatable && !moveKeys.has(f.key) && f.key !== headField?.key)
      .map((f) => ({
        label: f.label,
        value:
          f.type === "photo"
            ? values[f.key]
              ? <RegisterPhoto path={values[f.key]} />
              : null
            : show(f.key),
        wide: f.type === "textarea" || f.type === "photo",
      })),
  ];

  return (
    <div className="space-y-5">
      {(title || status) && <RecordHeader title={title ?? def.title} subtitle={subtitle || null} status={status} />}
      {sides.length > 0 && sides.some((x) => x.time) && <InOutCard sides={sides} />}
      <FactList facts={facts} title={t("Details")} />
      {(def.groups ?? []).map((g) => {
        const rows = Array.isArray(values[g.key]) ? (values[g.key] as Record<string, any>[]) : [];
        const total = isSirosLabour(def.key) && typeof values.totalWorkers === "number" ? values.totalWorkers : null;
        return (
          <div key={g.key}>
            <p className="text-sm font-medium text-zinc-100 mb-2">
              {g.label} <span className="font-normal text-zinc-500 tabular-nums">({rows.length}{total !== null ? ` / ${total}` : ""})</span>
            </p>
            {total !== null && rows.length < total && (
              <p className="text-xs text-amber-400 mb-2">{t("Details were entered for {n} of {total} workers.", { n: rows.length, total })}</p>
            )}
            {rows.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("None")}</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-950 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      {g.fields.map((f) => (
                        <th key={f.key} className="px-3 py-2.5 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2.5 text-zinc-500 tabular-nums">{i + 1}</td>
                        {g.fields.map((f) => (
                          <td key={f.key} className="px-3 py-2.5 text-zinc-200 whitespace-nowrap">{displayValue(f, r[f.key], t)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "Yes" (green) / "No" (amber) chip — in the status's own words — for a Yes / No status; not set counts as No. */
function StatusChip({ field, value, withLabel = false }: { field: FieldDef; value: unknown; withLabel?: boolean }) {
  const t = useT();
  const yes = value === true;
  const [yesWord, noWord] = yesNoWords(field);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        yes ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
      )}
    >
      {yes ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {withLabel ? `${field.label}: ` : ""}
      {yes ? t(yesWord) : t(noWord)}
    </span>
  );
}

/** A status (Yes / No buttons) or remarks (text with Add / Edit) section on a saved record. */
function UpdatableSection({
  field,
  value,
  onSave,
}: {
  field: FieldDef;
  value: unknown;
  onSave?: (value: unknown) => Promise<string | null>;
}) {
  const t = useT();
  const [saving, setSaving] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const busy = saving !== undefined;

  async function save(v: unknown) {
    if (!onSave || busy) return;
    setSaving(v);
    setError(null);
    const err = await onSave(v);
    setSaving(undefined);
    if (err) setError(err);
    else setEditing(false);
  }

  const yes = value === true;
  const shown = typeof value === "string" ? value.trim() : "";
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{field.label}</h3>
        {field.type === "yesno" && <StatusChip field={field} value={value} />}
      </div>

      {field.type === "yesno" ? (
        onSave && (
          <div role="radiogroup" aria-label={field.label} className="grid grid-cols-2 gap-2">
            {[true, false].map((opt) => {
              const active = yes === opt;
              return (
                <button
                  key={String(opt)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => !active && save(opt)}
                  className={cn(
                    "inline-flex h-12 items-center justify-center gap-2 rounded-full border text-base font-semibold transition-[background-color,transform] active:scale-[0.98] disabled:opacity-70",
                    active
                      ? opt
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-amber-500 bg-amber-500 text-white"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                  )}
                >
                  {saving === opt ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : opt ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                  {t(yesNoWords(field)[opt ? 0 : 1])}
                </button>
              );
            })}
          </div>
        )
      ) : editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(text);
          }}
        >
          <textarea
            value={text}
            maxLength={field.type === "textarea" ? 1000 : 200}
            rows={3}
            autoFocus
            aria-label={field.label}
            onChange={(e) => setText(e.target.value)}
            className="flex min-h-[96px] w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="h-12 sm:h-11 rounded-full border border-zinc-800 bg-zinc-900 px-5 text-sm font-medium text-zinc-200 hover:bg-zinc-950 disabled:opacity-60"
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-12 sm:h-11 items-center justify-center gap-2 rounded-full bg-orange-600 px-6 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {busy ? t("Saving…") : t("Save")}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className={cn("whitespace-pre-wrap break-words text-sm", shown ? "text-zinc-200" : "text-zinc-500")}>
            {shown || t("Nothing added yet.")}
          </p>
          {onSave && (
            <button
              type="button"
              onClick={() => {
                setText(shown);
                setError(null);
                setEditing(true);
              }}
              className="inline-flex w-full sm:w-auto h-12 sm:h-11 items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-5 text-sm font-medium text-zinc-200 hover:bg-zinc-950 hover:border-zinc-700 transition-colors"
            >
              <PencilLine className="h-4 w-4 text-orange-400" />
              {shown ? t("Edit {field}", { field: field.label }) : t("Add {field}", { field: field.label })}
            </button>
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}

type Visit = NonNullable<Entry["visit"]>;

/** "Meeting: Dr X" chip; amber while the meeting code is still needed to go out. */
function MeetingChip({ visit }: { visit: Visit }) {
  const t = useT();
  return (
    <span
      className={cn(
        "mt-1 inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        visit.open ? "bg-orange-500/10 text-orange-500" : "bg-zinc-900 text-zinc-500"
      )}
    >
      <KeyRound className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{t("Meeting: {name}", { name: visit.hostName })}</span>
    </span>
  );
}

/** Who they came to meet, and how they left (code / let out by Head Security). */
function MeetingSection({ visit }: { visit: Visit }) {
  const t = useT();
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <KeyRound className="h-3.5 w-3.5" /> {t("Meeting")}
      </h3>
      <p className="text-sm font-medium text-zinc-100">{visit.hostName}</p>
      <p className="text-sm text-zinc-400">
        {visit.open
          ? visit.locked
            ? t("Code locked after 5 wrong tries — Head Security can let the visitor out.")
            : t("Meeting code needed to record Out.")
          : visit.exitMethod === "OVERRIDE"
          ? t("Let out without the code by {name}: {reason}", { name: visit.exitedByName ?? "—", reason: visit.overrideReason ?? "—" })
          : t("Left with the meeting code.")}
      </p>
    </section>
  );
}

function EntryDetails({
  def,
  entry,
  onRecord,
  onCloseRecord,
  onEdit,
  onDelete,
  onUpdateField,
}: {
  def: EntryRegister;
  entry: Entry;
  onRecord?: () => void;
  /** Close without recording the other side */
  onCloseRecord?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Change a status / remarks section (returns an error message, or null) */
  onUpdateField?: (key: string, value: unknown) => Promise<string | null>;
}) {
  const t = useT();
  const label = nextActionLabel(def, entry.current, t);
  const p = pendingActions(def, entry.current);
  const Icon = p.next?.direction === "OUT" ? LogOut : LogIn;
  // One-way record: "Out only" / "In only" (chosen when saved, or closed later)
  const m = def.movement;
  const startSide = m && entry.current.direction ? (entry.current.direction === "IN" ? m.in : m.out) : null;
  const otherSide = m && entry.current.direction ? (entry.current.direction === "IN" ? m.out : m.in) : null;
  const oneWay = entry.current.oneWay === true && startSide && otherSide && !entry.current[otherSide.timeKey];
  return (
    <div className="space-y-5">
      {oneWay && (
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-zinc-100">{t("{side} only", { side: startSide.label })}</p>
            <p className="text-zinc-500">{t("Closed — no {side} recorded.", { side: otherSide.label })}</p>
            {entry.current.closeNote && <p className="mt-1 text-zinc-300">{t("Note")}: {String(entry.current.closeNote)}</p>}
          </div>
        </div>
      )}
      <ValuesGrid def={def} values={entry.current} />

      {entry.visit && <MeetingSection visit={entry.visit} />}

      {updatableFields(def).map((f) => (
        <UpdatableSection
          key={f.key}
          field={f}
          value={entry.current[f.key]}
          onSave={onUpdateField ? (v) => onUpdateField(f.key, v) : undefined}
        />
      ))}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> {t("Record history")}</p>
        <ul className="space-y-2 text-sm text-zinc-300">
          <li>
            <span className="text-zinc-500">{formatInstant(entry.createdAt)}</span> — {t("Recorded by")} {recorderLine(entry, t)}
          </li>
          {entry.supplements.map((s) => (
            <li key={s.id}>
              <span className="text-zinc-500">{formatInstant(s.createdAt)}</span> — {s.kind === "CORRECTION" ? t("Correction by") : s.data?.oneWay === true ? t("Closed by") : t("Updated by")} {recorderLine(s, t)}
              {s.reason && <span className="block text-zinc-400 pl-3">{t("Reason")}: {t(s.reason)}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        {onRecord && label && (
          <button onClick={onRecord} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-14 sm:h-11 px-6 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-base sm:text-sm font-semibold transition-[background-color,transform]">
            <Icon className="h-5 w-5 sm:h-4 sm:w-4" /> {label}
          </button>
        )}
        {onCloseRecord && (
          <button onClick={onCloseRecord} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 sm:h-11 px-5 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-950 hover:border-zinc-700 text-sm font-medium transition-colors">
            <CheckCircle2 className="h-4 w-4 text-orange-400" /> {t("Close record")}
          </button>
        )}
        {onEdit && (
          <button onClick={onEdit} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 sm:h-11 px-5 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-950 hover:border-zinc-700 text-sm font-medium transition-colors">
            <PencilLine className="h-4 w-4 text-orange-400" /> {t("Edit")}
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 sm:h-11 px-5 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors">
            <Trash2 className="h-4 w-4" /> {t("Delete")}
          </button>
        )}
      </div>
    </div>
  );
}

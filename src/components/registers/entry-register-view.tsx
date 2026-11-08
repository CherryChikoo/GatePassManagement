"use client";
import { callGate } from "@/lib/gate-call";
import { ZoomablePhoto } from "@/components/ui/zoomable-photo";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useT } from "@/components/providers/language-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ShieldCheck, Timer, ChevronDown, ChevronRight, Info, Clock, Eye, FilePlus2, FileText, History, KeyRound, Loader2, LogIn, LogOut, MapPin, PencilLine, Trash2, Users, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Modal } from "@/components/ui/primitives";
import { Card } from "@/components/ui/card";
import { dt, IconAction, RowActions } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
import { cn, withTimeout } from "@/lib/utils";
import type { EntryRegister, FieldDef } from "@/lib/registers/definitions";
import { isSirosLabour, pendingActions, updatableFields, yesNoWords, ESTATE_BOOKS } from "@/lib/registers/definitions";
import { adminDeleteRegisterEntry, adminUpdateRegisterEntry, verifyRegisterEntry } from "@/server/actions/registers";
import { fetchEntryList, invalidateEntryLists, markEntryListsStale, peekEntryList } from "./entry-list-cache";
import { visitExitMessage } from "@/components/visits/visit-code";
import { useLiveTopics } from "@/lib/realtime/live";
import { actionErrorMessage } from "@/lib/deployment";
import { AdminEditForm, CloseRecordForm, MovementForm, PhotoInput, RegisterForm, restoreRegisterDraft, takeRegisterDraft, type StaffOption, MultiPhotoInput, photoList } from "./register-form";
import { exitBatches, workersInside } from "@/lib/registers/validate";
import { formatFieldValue, formatInstant, newClientToken, formatClock } from "./format";
import { displayValue, registerMessage } from "./localize";
import { FactList, InOutCard, RecordHeader, type Fact, type MoveSide } from "./record-layout";
import { SirosPersonDialog, prefetchSirosPerson, useSirosPeople } from "./siros-people";
import type { Translate } from "@/lib/i18n";
import { RegisterToolbar, useRegisterFilters } from "./toolbar";
import { fetchInsideEntries, invalidateInsideEntries, peekInsideEntries } from "./inside-entries";
import { insideForLabel, useMinuteClock } from "@/components/visits/hub-tiles";
import { ListEmpty, ListLoading, PersonCard, PersonCardAction } from "@/components/visits/person-card";

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
  canVerify = false,
  insideOnly = false,
  onInsideTotal,
}: {
  def: EntryRegister;
  canCreate: boolean;
  /** Estate Manager: "✓ Verify" on records of the stock / labour / work-vehicle books */
  canVerify?: boolean;
  /** Main Admin: edit and delete saved records */
  canAdminEdit?: boolean;
  /** Security on registers they may edit (e.g. Cooli Book): edit, saved as a correction */
  canEdit?: boolean;
  /**
   * "Inside now" (Admission Book buttons): only today's and yesterday's records
   * still waiting for Out, with how long each has been inside; no date filter,
   * 20 per page.
   */
  insideOnly?: boolean;
  /** Inside now: how many are inside (the screen's title count), after every load */
  onInsideTotal?: (total: number) => void;
}) {
  const t = useT();
  const filters = useRegisterFilters();
  const [data, setData] = useState<{ entries: Entry[]; total: number; pageSize: number; canOverrideVisit?: boolean } | null>(null);
  const insideTotal = insideOnly ? data?.total : undefined;
  useEffect(() => {
    if (insideTotal !== undefined) onInsideTotal?.(insideTotal);
  }, [insideTotal, onInsideTotal]);
  // "Inside 2 h 10 min" moves on once a minute (no requests)
  const now = useMinuteClock(insideOnly);
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
    if (insideOnly) {
      if (fresh) {
        invalidateEntryLists(def.key);
        invalidateInsideEntries(def.key);
      }
      // A page seen before shows at once; the fresh copy replaces it quietly
      const kept = fresh || silent ? null : peekInsideEntries(def.key, filters.page);
      if (kept) setData({ entries: kept.entries, total: kept.total, pageSize: kept.pageSize, canOverrideVisit: kept.canOverrideVisit });
      if (!silent) {
        setLoading(!kept);
        setError(null);
      }
      try {
        // One page (20) of the records still inside; the server picks them
        const res = await withTimeout(fetchInsideEntries(def, !fresh && !silent, filters.page));
        if (no !== loadNo.current) return;
        setData({ entries: res.entries, total: res.total, pageSize: res.pageSize, canOverrideVisit: res.canOverrideVisit });
        // The page's last records just went out: its last page was sent instead
        if (res.page !== filters.page) filters.setPage(res.page);
        if (silent) setError(null);
        return res.entries as Entry[];
      } catch (err) {
        if (no === loadNo.current && !silent) setError(actionErrorMessage(err, t("Could not load the register.")));
      } finally {
        if (no === loadNo.current) setLoading(false);
      }
      return;
    }
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
    // `def` matters only for the Inside now list (its key is already a dependency)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.key, filters.dateParam, filters.q, filters.page, filters.shift, t, insideOnly]);

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

  /**
   * New record: the form closes at once ("Saving…") and the record is saved
   * meanwhile. If it fails, the form opens again with everything typed and the reason.
   */
  async function saveNew(payload: Parameters<React.ComponentProps<typeof RegisterForm>["onSubmit"]>[0]) {
    const tok = token;
    const kept = takeRegisterDraft(def.key);
    setFormError(null);
    setMode(null);
    setNotice(t("Saving…"));
    let res: any;
    try {
      res = await callGate("createRegisterEntry", [def.key, payload, tok]);
    } catch (err) {
      res = { error: actionErrorMessage(err, t("Could not save. Please try again.")), keepToken: true };
    }
    if (res?.error) {
      setNotice(null);
      restoreRegisterDraft(def.key, kept);
      // A network failure may have saved it: the same token makes a retry save it only once
      setToken(res.keepToken ? tok : newClientToken());
      setFormKey((k) => k + 1);
      setFormError(res.keepToken ? res.error : visitExitMessage(t, res));
      setErrorNo((n) => n + 1);
      setMode("new");
      return;
    }
    setNotice(t("Record saved."));
    setTimeout(() => setNotice(null), 4000);
    const entries = await load(true);
    // Registers with a list (e.g. coolies): show the saved record and its list
    if (res?.id && def.groups?.length) {
      const saved = entries?.find((e) => e.id === res.id);
      if (saved) setSelected(saved);
    }
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
    // A reading, a meeting code or counts to enter: the small form instead of one tap
    if (
      next.readingKey ||
      (e.visit?.open && next.direction === "OUT") ||
      ((def.movement?.exitCounts || def.movement?.outReasonKey) && next.direction === "OUT")
    ) {
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

  /** A list column's value; an older record without it shows its fallback field */
  const cellOf = (c: FieldDef, cur: Record<string, any>) => (cur[c.key] ?? "") !== "" || !c.listFallback ? cur[c.key] : cur[c.listFallback];
  const columns = def.listFields.map((k) => def.fields.find((f) => f.key === k)).filter((f): f is NonNullable<typeof f> => !!f);
  // Yes / No statuses (e.g. Payment completed): their own column in the list
  const statusCols = updatableFields(def).filter((f) => f.type === "yesno" && !def.listFields.includes(f.key));
  // Security (on registers they record in) and Main Admin change status / remarks from the record
  const canUpdate = canCreate || canAdminEdit;

  /** Saves one status / remarks change; returns an error message, or null when saved. */
  async function verifySelected(): Promise<string | null> {
    const entry = selected;
    if (!entry) return null;
    try {
      const res: any = await verifyRegisterEntry(entry.id);
      if (res?.error) return t(res.error);
      const entries = await load(true);
      const fresh = entries?.find((x) => x.id === entry.id);
      if (fresh) setSelected((cur) => (cur && cur.id === fresh.id ? fresh : cur));
      return null;
    } catch (err) {
      return actionErrorMessage(err, t("Could not save. Please try again."));
    }
  }

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

  // Inside now (Admission Book): who, phone, the other list columns, time in and how long
  const inField = def.movement ? def.fields.find((f) => f.key === def.movement!.in.timeKey) : undefined;
  const insideCard = (e: Entry) => {
    const [first, ...rest] = columns;
    const name = first ? displayValue(first, cellOf(first, e.current), t) : formatFieldValue({ key: "d", label: "", type: "date" }, e.entryDate);
    const phoneKey = def.visitHost?.phoneField;
    const phone = phoneKey && typeof e.current[phoneKey] === "string" ? (e.current[phoneKey] as string) : null;
    const details = rest
      .filter((c) => c.type !== "time")
      .map((c) => displayValue(c, cellOf(c, e.current), t))
      .filter((v) => v && v !== "—")
      .join(" · ");
    const timeIn = inField && e.current[inField.key] ? displayValue(inField, e.current[inField.key], t) : null;
    const pend = canCreate ? pendingActions(def, e.current) : null;
    const next = pend?.next ?? null;
    const action = next ? (
      <PersonCardAction
        icon={next.direction === "OUT" ? LogOut : LogIn}
        label={next.direction === "OUT" ? t("Mark exit") : t("Record {side}", { side: next.label })}
        tone={next.direction === "OUT" ? "sky" : "emerald"}
        onClick={() => quickRecord(e)}
        busy={quickId === e.id}
        disabled={!!quickId}
      />
    ) : pend?.groups.length ? (
      <PersonCardAction icon={LogOut} label={t("Mark out")} onClick={() => openMode("record", e)} />
    ) : null;
    const chips = (e.visit || statusCols.length > 0) && (
      <>
        {e.visit && <MeetingChip visit={e.visit} />}
        {statusCols.map((c) => (
          <StatusChip key={c.key} field={c} withLabel value={e.current[c.key]} />
        ))}
      </>
    );
    return (
      <PersonCard
        name={name}
        phone={phone}
        details={details}
        chips={chips}
        time={timeIn ? `${t("In")} ${timeIn}` : null}
        since={insideForLabel(t, e.createdAt, now)}
        onOpen={() => setSelected(e)}
        action={action}
      />
    );
  };

  return (
    <div className="space-y-4">
      {!insideOnly && (
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
      )}

      {shiftField && !insideOnly && (
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
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3.5 text-lg font-bold leading-snug text-red-700">
          <span className="flex min-w-0 items-start gap-2.5">
            <XCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" /> {registerMessage(t, error)}
          </span>
          <button type="button" onClick={() => load(true)} className="h-11 rounded-full bg-red-600 px-5 text-base font-bold text-white hover:bg-red-700">
            {t("Try again")}
          </button>
        </div>
      )}

      <LoadingPill active={loading} />
      {insideOnly ? (
        // Inside now: one card per person, the main action on the right (tablets) or under (phones)
        data && data.entries.length > 0 ? (
          <ul className={cn("space-y-2.5 transition-opacity", loading && "opacity-60")}>
            {data.entries.map((e) => (
              <li key={e.id} className="min-w-0">
                {insideCard(e)}
              </li>
            ))}
          </ul>
        ) : data ? (
          <ListEmpty icon={MapPin} title={t("Nobody is inside now.")} hint={t("People still inside appear here by themselves.")} />
        ) : error ? null : (
          <ListLoading />
        )
      ) : (
      <Card className={cn("overflow-hidden transition-opacity", loading && "opacity-60")}>
        {/* Phones: stacked rows */}
        {data && data.entries.length > 0 && (
          <ul className={cn(dt.mobileList, "xl:hidden")}>
            {data.entries.map((e) => {
              const open = pendingActions(def, e.current).any;
              const [first, ...rest] = columns;
              const has = (c: FieldDef) => {
                const v = displayValue(c, cellOf(c, e.current), t);
                return !!v && v !== "—";
              };
              // In / Out style values (Inward / Outward, In / Out): a coloured chip on the right
              const dirCol = rest.find((c) => c.type === "select" && (c.options ?? []).some((o) => /^(in|inward|out|outward)$/i.test(o)));
              const dirValue = dirCol ? String(cellOf(dirCol, e.current) ?? "") : "";
              const dirIn = /^(in|inward)$/i.test(dirValue);
              const times = rest.filter((c) => c.type === "time" && has(c));
              const pairs = rest.filter((c) => c !== dirCol && c.type !== "time" && has(c));
              const moveIn = def.movement?.in.timeKey;
              // In → Out with how long it took (registers with In and Out)
              const trip = tripOf(def, e);
              const tripKeys = def.movement ? [def.movement.in.timeKey, def.movement.out.timeKey] : [];
              const otherTimes = trip ? times.filter((c) => !tripKeys.includes(c.key)) : times;
              return (
                <li key={e.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setSelected(e)}
                    className="flex min-w-0 flex-1 min-h-[72px] items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-zinc-950 hover:bg-zinc-950/70"
                  >
                    <span className="min-w-0 flex-1 space-y-1.5">
                      {/* The name keeps its width; the chips move to the next line when there is no room */}
                      <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
                        <span className="min-w-[55%] flex-1 break-words text-lg font-bold leading-snug text-zinc-100">
                          {first ? displayValue(first, cellOf(first, e.current), t) : formatFieldValue({ key: "d", label: "", type: "date" }, e.entryDate)}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {dirValue && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-sm font-bold",
                                dirIn ? "bg-emerald-500/15 text-emerald-700" : "bg-sky-500/15 text-sky-700"
                              )}
                            >
                              {dirIn ? <LogIn className="h-3.5 w-3.5" aria-hidden="true" /> : <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
                              {t(dirValue)}
                            </span>
                          )}
                          {open && !trip && openChip}
                        </span>
                      </span>
                      {/* Each value with its small label, so it is clear what it is */}
                      {pairs.length > 0 && (
                        <span className="flex flex-wrap gap-x-3 gap-y-1 text-base">
                          {pairs.map((c) => (
                            <span key={c.key} className="min-w-0 break-words">
                              <span className="text-sm text-zinc-500">{t(c.label)}</span>{" "}
                              <span className="font-semibold text-zinc-200">{displayValue(c, cellOf(c, e.current), t)}</span>
                            </span>
                          ))}
                        </span>
                      )}
                      {/* In → Out, and how long */}
                      {trip && <TripLine trip={trip} />}
                      {/* Other times as green / blue chips */}
                      {otherTimes.length > 0 && (
                        <span className="flex flex-wrap gap-1.5">
                          {otherTimes.map((c) => {
                            const isIn = c.key === moveIn || /in/i.test(c.key) && !/out/i.test(c.key);
                            return (
                              <span
                                key={c.key}
                                className={cn(
                                  "inline-flex items-center rounded-lg px-2 py-0.5 text-sm font-bold tabular-nums",
                                  isIn ? "bg-emerald-500/15 text-emerald-700" : "bg-sky-500/15 text-sky-700"
                                )}
                              >
                                {isIn ? t("In") : t("Out")} {displayValue(c, cellOf(c, e.current), t)}
                              </span>
                            );
                          })}
                        </span>
                      )}
                      {e.visit && <MeetingChip visit={e.visit} />}
                      {insideOnly && (
                        <span className="mt-1 block text-xs font-semibold text-amber-600 tabular-nums">{insideForLabel(t, e.createdAt, now)}</span>
                      )}
                      {ESTATE_BOOKS.includes(def.key) && (
                        <span className="block">
                          <VerifyChip entry={e} />
                        </span>
                      )}
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
                        {statusCols.map((c) => (
                          <StatusChip key={c.key} field={c} withLabel value={e.current[c.key]} />
                        ))}
                        {hasStarted && !trip && directionChip(e.current.direction)}
                        <span className="tabular-nums">{formatFieldValue({ key: "d", label: "", type: "date" }, e.entryDate)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate font-medium text-zinc-400">{e.recordedByName}</span>
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
          <div className={cn(dt.wrap, "hidden xl:block")}>
            <table className={dt.table}>
              <thead>
                <tr>
                  <th className={dt.th}>{t("Date")}</th>
                  {hasStarted && <th className={dt.th}>{t("Timings")}</th>}
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
                          {ESTATE_BOOKS.includes(def.key) && <VerifyChip entry={e} />}
                          {e.visit && <MeetingChip visit={e.visit} />}
                          {insideOnly && <span className="text-xs font-semibold text-amber-600">{insideForLabel(t, e.createdAt, now)}</span>}
                        </span>
                      </td>
                      {hasStarted && (
                        <td className={dt.td}>
                          {(() => {
                            const trip = tripOf(def, e);
                            return trip ? <TripLine trip={trip} /> : directionChip(e.current.direction) ?? <span className="text-zinc-600">—</span>;
                          })()}
                        </td>
                      )}
                      {columns.map((c, i) => (
                        <td key={c.key} className={cn(dt.td, "whitespace-nowrap max-w-[220px] truncate", i === 0 ? "font-medium text-zinc-100" : "text-zinc-400")}>
                          {displayValue(c, cellOf(c, e.current), t)}
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
            <p className="text-sm text-zinc-500">
              {insideOnly ? t("Nobody is inside now.") : filters.dateParam === "all" ? t("No records yet.") : t("No records for this date.")}
            </p>
          </div>
        )}
        {!data && !error && <p className="px-4 py-12 text-center text-sm text-zinc-500">{t("Loading…")}</p>}
      </Card>
      )}

      {data && <PagerBar page={filters.page} pageSize={data.pageSize} total={data.total} onPageChange={filters.setPage} itemLabel={t("records")} />}

      {/* Details */}
      <Modal
        open={!!selected && mode === null}
        onClose={() => setSelected(null)}
        title={def.title}
        className="max-w-2xl md:max-w-[min(92vw,1000px)] border-2 border-orange-500/80"
        frosted
      >
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
            onAddLater={canVerify ? updateField : undefined}
            onVerify={canVerify ? verifySelected : undefined}
          />
        )}
      </Modal>

      {/* New record / record the other side */}
      <Modal
        open={mode !== null}
        onClose={() => !busy && setMode(null)}
        title={
          mode === "new"
            ? def.title
            : mode === "edit"
            ? `${t("Edit record")} — ${def.title}`
            : mode === "close"
            ? t("Close record")
            : selected
            ? nextActionLabel(def, selected.current, t) ?? def.title
            : def.title
        }
        className="max-w-2xl md:max-w-[min(92vw,1000px)] border-2 border-orange-500/80"
        scrollTopKey={errorNo}
      >
        {formError && (
          <div role="alert" className="mb-4 rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3 text-base font-bold leading-snug text-red-700">
            {registerMessage(t, formError)}
          </div>
        )}
        {mode === "new" && (
          <RegisterForm
            key={formKey}
            def={def}
            staff={staff}
            busy={busy}
            onSubmit={(payload) => void saveNew(payload)}
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
function RegisterPhoto({ path, small = false }: { path: unknown; small?: boolean }) {
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
  const size = small ? "h-20 w-20 rounded-xl" : "h-40 w-40 rounded-2xl";
  if (!url) return <span className={`inline-block animate-pulse bg-zinc-950 ${size}`} />;
  return <ZoomablePhoto src={url} className={`border border-zinc-800 object-cover ${size}`} />;
}

/** A worker type and its count, e.g. "పెద్దమేస్త్రి [4]" (no × sign) */
function CountTag({ label, n, tone = "sky" }: { label: string; n: number; tone?: "sky" | "amber" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 py-0.5 pl-2.5 pr-1 text-base font-semibold text-zinc-100">
      {label}
      <span
        className={`min-w-[1.75rem] rounded-md px-1.5 text-center text-base font-bold tabular-nums text-white ${tone === "amber" ? "bg-amber-600" : "bg-sky-600"}`}
      >
        {n}
      </span>
    </span>
  );
}

/** Labour books: each group of workers that went out (time and counts), and who is still inside */
function ExitBatchesCard({ def, data }: { def: EntryRegister; data: Record<string, any> }) {
  const t = useT();
  const batches = exitBatches(data);
  const left = workersInside(def, data).filter((w) => w.inside > 0);
  const insideTotal = left.reduce((sum, w) => sum + w.inside, 0);
  if (batches.length === 0) return null;
  return (
    // Same look as the workers list above: the heading, then one card
    <section className="space-y-2">
      <p className="flex items-center gap-2 text-base font-bold text-zinc-100">
        <LogOut className="h-5 w-5 text-sky-600" aria-hidden="true" /> {t("Went out")}
        <span className="text-zinc-500">({batches.length})</span>
      </p>
      <div className="overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 shadow-card">
      <ul className="divide-y divide-zinc-800">
        {batches.map((b, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-2.5 py-1 text-base font-bold tabular-nums text-sky-700">
              <Clock className="h-4 w-4" aria-hidden="true" /> {formatClock(b.time)}
            </span>
            {/* Each type as its own tag: name, then the count in a bold box */}
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {Object.entries(b.n ?? {}).map(([type, n]) => (
                <CountTag key={type} label={t(type)} n={Number(n) || 0} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      {insideTotal > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800 bg-amber-500/10 px-4 py-2.5">
          <span className="text-base font-bold text-amber-700">{t("Still inside: {n}", { n: insideTotal })}</span>
          {left.map((w) => (
            <CountTag key={w.type} label={t(w.type)} n={w.inside} tone="amber" />
          ))}
        </div>
      )}
      </div>
    </section>
  );
}

/** One photo, or several side by side (e.g. the stock photos) */
function RegisterPhotos({ value, small = false }: { value: unknown; small?: boolean }) {
  const list = photoList(value);
  if (list.length === 0) return <span className="text-zinc-600">—</span>;
  if (list.length === 1) return <RegisterPhoto path={list[0]} small={small} />;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((p) => (
        <RegisterPhoto key={p} path={p} small={small} />
      ))}
    </div>
  );
}

/** Photo taken at a QR check-in (signed, short-lived link); nothing when the record was typed by Security. */
function CheckInPhoto({ recordId }: { recordId: string }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    callGate("getCheckInPhotoUrl", [recordId], 15_000)
      .then((u) => !cancelled && setUrl(typeof u === "string" ? u : null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recordId]);
  if (!url) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t("Photo at check-in")}</p>
      <ZoomablePhoto src={url} className="h-40 w-40 rounded-2xl border border-zinc-800 object-cover" />
    </div>
  );
}

/** A register record, top to bottom: who it is, the In / Out card, then the filled details */
function ValuesGrid({ def, values, duration }: { def: EntryRegister; values: Record<string, any>; duration?: string | null }) {
  const t = useT();
  const [showEmpty, setShowEmpty] = useState(false);
  // Siros labour: tap a coolie / the contractor for their full details
  const sirosPeople = useSirosPeople(isSirosLabour(def.key));
  const [personNo, setPersonNo] = useState<number | null>(null);
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
  const title = headField && headField.type !== "photo" ? show(headField.key) ?? (headField.listFallback ? show(headField.listFallback) : null) : null;
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
      // Added-later fields stay with the details on records that had them from the start
      .filter((f) => (!f.updatable || (!!f.addLaterWhen && values[f.addLaterWhen] !== true)) && !moveKeys.has(f.key) && f.key !== headField?.key)
      .map((f) => ({
        label: f.label,
        value:
          f.type === "photo"
            ? photoList(values[f.key]).length
              ? <RegisterPhotos value={values[f.key]} />
              : null
            : show(f.key),
        wide: f.type === "textarea" || f.type === "photo",
      })),
  ];

  const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
  const filled = facts.filter((f) => !isEmpty(f.value));
  const emptyFacts = facts.filter((f) => isEmpty(f.value));
  const [first, second] = sides;
  const done = !!first?.time && !!second?.time;
  const inside = !!first?.time && !second?.time && values.oneWay !== true;
  return (
    <div className="space-y-5">
      {/* Who, and the In / Out times: the summary, tinted */}
      <div className="rounded-2xl border-[1.5px] border-orange-500/30 bg-orange-50 px-4 py-3.5 shadow-card">
        {(() => {
          const n = String(values.contractorName ?? "").trim().toLowerCase();
          const no = n ? sirosPeople?.people.find((p) => p.kind === "CONTRACTOR" && p.name.trim().toLowerCase() === n)?.no : undefined;
          return no ? (
            <button type="button" onClick={() => setPersonNo(no)} className="flex items-center gap-2 text-left">
              <span className="break-words text-2xl font-bold leading-snug text-zinc-100 underline decoration-zinc-400 decoration-2 underline-offset-4">{title ?? def.title}</span>
              <Info className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" />
            </button>
          ) : (
            <p className="break-words text-2xl font-bold leading-snug text-zinc-100">{title ?? def.title}</p>
          );
        })()}
        {/* In / Out times as two clear chips */}
        {first?.time && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {[first, second].filter((x): x is MoveSide => !!x?.time).map((x) => (
              <span
                key={x.direction}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xl font-bold tabular-nums",
                  x.direction === "IN" ? "bg-emerald-500/15 text-emerald-700" : "bg-sky-500/15 text-sky-700"
                )}
              >
                {x.direction === "IN" ? <LogIn className="h-5 w-5" aria-hidden="true" /> : <LogOut className="h-5 w-5" aria-hidden="true" />}
                {x.label} {x.time}
              </span>
            ))}
            {done && duration && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border-[1.5px] border-zinc-700 bg-zinc-900 px-3 py-1.5 text-lg font-bold tabular-nums text-zinc-100">
                <Timer className="h-5 w-5 text-orange-500" aria-hidden="true" /> {duration}
              </span>
            )}
            {inside && <span className="text-sm font-semibold text-emerald-700">{t("Still inside")}</span>}
            {done && <span className="sr-only">{t("Completed")}</span>}
          </div>
        )}
      </div>

      {/* Details: only the filled ones; label left, value right */}
      <div className="space-y-3">
        <p className="flex items-center gap-2 border-t-2 border-zinc-700 pt-4 text-lg font-bold text-zinc-100">
          <FileText className="h-5 w-5 text-orange-500" aria-hidden="true" /> {t("Details")}
        </p>
      {filled.length > 0 && (
        <dl className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 shadow-card">
          {filled.map((f, i) => (
            <div
              key={i}
              className={
                f.wide
                  ? "space-y-1 px-4 py-3"
                  : "grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-baseline gap-3 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
              }
            >
              <dt className="text-base font-semibold text-zinc-300">{t(f.label)}</dt>
              <dd className="min-w-0 break-words text-lg font-bold text-zinc-100">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* Not filled: under their own button */}
      {emptyFacts.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowEmpty((v) => !v)}
            aria-expanded={showEmpty}
            className="flex h-12 w-full items-center gap-3 rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-900 px-4 text-base font-semibold text-zinc-100 shadow-card transition-colors hover:bg-zinc-950"
          >
            <span className="min-w-0 flex-1 text-left">
              {t("Not filled")} <span className="font-normal text-zinc-500 tabular-nums">({emptyFacts.length})</span>
            </span>
            <ChevronDown className={cn("h-5 w-5 shrink-0 text-zinc-400 transition-transform", showEmpty && "rotate-180")} aria-hidden="true" />
          </button>
          {showEmpty && (
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950">
              {emptyFacts.map((f, i) => (
                <li key={i} className="px-4 py-2.5 text-sm text-zinc-500">
                  {t(f.label)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>

      {/* Workers: a small card each — number, name, other details, In → Out */}
      {(def.groups ?? []).map((g) => {
        const rows = Array.isArray(values[g.key]) ? (values[g.key] as Record<string, any>[]) : [];
        const timeFields = g.fields.filter((f) => f.type === "time");
        // The title is the name (or, for items, the details): not repeated below
        const titleKey = g.fields.some((x) => x.key === "name") ? "name" : "description";
        const photoField = g.fields.find((f) => f.type === "photo");
        const otherFields = g.fields.filter((f) => f.type !== "time" && f.type !== "photo" && f.key !== "no" && f.key !== titleKey);
        return (
          <div key={g.key} className="space-y-3">
            <p className="flex items-center gap-2 border-t-2 border-zinc-700 pt-4 text-lg font-bold text-zinc-100">
              <Users className="h-5 w-5 text-amber-600" aria-hidden="true" /> {t(g.label)}{" "}
              <span className="font-semibold text-zinc-400 tabular-nums">({rows.length})</span>
            </p>
            {rows.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("None")}</p>
            ) : (
              <ul className="divide-y divide-amber-500/25 overflow-hidden rounded-2xl border-[1.5px] border-amber-500/40 bg-amber-50 shadow-card">
                {rows.map((row, i) => {
                  const meta = otherFields.filter((f) => !isEmpty(row[f.key])).map((f) => displayValue(f, row[f.key], t));
                  // Short In / Out chips (the row's time fields: the first is In, a later one Out)
                  const times = timeFields
                    .filter((f) => !isEmpty(row[f.key]))
                    .map((f) => ({ key: f.key, out: !!f.completion, text: displayValue(f, row[f.key], t) }));
                  return (
                    <li
                      key={i}
                      onPointerDown={isSirosLabour(def.key) && !isEmpty(row.no) ? () => prefetchSirosPerson(row.no) : undefined}
                      onClick={isSirosLabour(def.key) && !isEmpty(row.no) ? () => setPersonNo(Number(row.no)) : undefined}
                      className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3",
                        isSirosLabour(def.key) && !isEmpty(row.no) && "cursor-pointer transition-colors hover:bg-amber-500/10"
                      )}
                    >
                      {/* One line: number, name, then the In / Out chips (they wrap under the name only on a narrow phone) */}
                      <div className="flex min-w-[10rem] flex-1 items-center gap-3">
                        <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/25 px-2 text-base font-bold tabular-nums text-amber-800">
                          {isEmpty(row.no) ? i + 1 : String(row.no)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-lg font-bold leading-snug text-zinc-100">{!isEmpty(row.name) ? String(row.name) : !isEmpty(row.description) ? String(row.description) : `${t(g.itemLabel)} ${i + 1}`}</span>
                          {meta.length > 0 && <span className="block text-base text-zinc-400">{meta.join(" · ")}</span>}
                        </span>
                      </div>
                      {photoField && photoList(row[photoField.key]).length > 0 && (
                        <div className="shrink-0">
                          <RegisterPhotos value={row[photoField.key]} small />
                        </div>
                      )}
                      {times.length > 0 && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {times.map((x) => (
                            <span
                              key={x.key}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-base font-bold tabular-nums",
                                x.out ? "bg-sky-500/15 text-sky-700" : "bg-emerald-500/15 text-emerald-700"
                              )}
                            >
                              {x.out ? t("Out") : t("In")} {x.text}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {personNo !== null && <SirosPersonDialog no={personNo} onClose={() => setPersonNo(null)} />}
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
              className="inline-flex h-12 sm:h-11 items-center justify-center gap-1.5 rounded-full border-2 border-red-500 bg-red-50 font-bold text-red-600 hover:bg-red-100 px-5 text-sm disabled:opacity-60"
            >
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("Cancel")}
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
      {error && <p role="alert" className="text-sm text-red-400">{registerMessage(t, error)}</p>}
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
  onAddLater,
  onVerify,
}: {
  def: EntryRegister;
  entry: Entry;
  /** Estate Manager: mark this record verified (returns an error message, or null) */
  onVerify?: () => Promise<string | null>;
  onRecord?: () => void;
  /** Close without recording the other side */
  onCloseRecord?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Change a status / remarks section (returns an error message, or null) */
  onUpdateField?: (key: string, value: unknown) => Promise<string | null>;
  /** Only the photos added later (e.g. the bill photos): the Estate Manager, who changes nothing else */
  onAddLater?: (key: string, value: unknown) => Promise<string | null>;
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
      {/* Estate Manager books: verified or not, first */}
      {ESTATE_BOOKS.includes(def.key) && <VerificationCard entry={entry} onVerify={onVerify} />}

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
      <ValuesGrid def={def} values={entry.current} duration={(() => { const tr = tripOf(def, entry); return tr && tr.minutes !== null ? durationText(t, tr.minutes) : null; })()} />

      {/* Labour books: the groups that went out, right under the workers */}
      {def.movement?.exitCounts && <ExitBatchesCard def={def} data={entry.current} />}

      {/* Admission Book: the photo Security took when letting a QR check-in in (none for typed records) */}
      {def.key === "ADMISSION" && <CheckInPhoto recordId={entry.id} />}

      {entry.visit && <MeetingSection visit={entry.visit} />}

      {updatableFields(def).map((f) => {
        // Added later only on records saved without it (e.g. the bill after "No bill")
        if (f.addLaterWhen && entry.current[f.addLaterWhen] !== true) return null;
        if (f.type === "photo") {
          return (
            <PhotoLaterSection
              key={f.key}
              field={f}
              registerKey={def.key}
              value={entry.current[f.key]}
              onSave={(() => {
                const save = onUpdateField ?? (f.addLaterWhen ? onAddLater : undefined);
                return save ? (v: unknown) => save(f.key, v) : undefined;
              })()}
            />
          );
        }
        // A Yes / No that locks a name (e.g. "Bill taken"): drawn together with that name
        if (def.fields.some((x) => x.lockedBy === f.key)) return null;
        const flag = f.lockedBy ? def.fields.find((x) => x.key === f.lockedBy) : undefined;
        if (flag) {
          return (
            <TakenSection
              key={f.key}
              nameField={f}
              flagField={flag}
              name={entry.current[f.key]}
              taken={entry.current[flag.key] === true}
              onSave={onUpdateField}
            />
          );
        }
        // A short name / note (e.g. "Given To"): one line with Save
        if (f.type === "text") {
          return <QuickTextSection key={f.key} field={f} value={entry.current[f.key]} onSave={onUpdateField ? (v) => onUpdateField(f.key, v) : undefined} />;
        }
        return <UpdatableSection key={f.key} field={f} value={entry.current[f.key]} onSave={onUpdateField ? (v) => onUpdateField(f.key, v) : undefined} />;
      })}

      <HistoryCards def={def} entry={entry} />

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

type HistoryStep = {
  id: string;
  createdAt: string;
  kind?: string;
  data?: Record<string, any> | null;
  /** The record itself: what was typed when it was saved */
  original?: Record<string, any> | null;
  reason?: string | null;
  recordedByName: string;
  recordedByRole: string;
  recordedByEmployeeId: string | null;
  recordedAtGate: string | null;
};

/** Record history as small cards: what happened and when (bold), and the guard as clear tags (name, ID, gate). */
function HistoryCards({ def, entry }: { def: EntryRegister; entry: HistoryStep & { supplements: HistoryStep[] } }) {
  const t = useT();
  const m = def.movement;
  // In = green, Out = blue (like the In / Out buttons); other steps their own colour
  const IN = { tone: "bg-emerald-500/15 text-emerald-700", icon: LogIn };
  const OUT = { tone: "bg-sky-500/15 text-sky-700", icon: LogOut };
  const what = (step: HistoryStep, first: boolean): { text: string; tone: string; icon: typeof LogIn } => {
    if (first) {
      // The first step says what was recorded: In / Out for In-Out books, otherwise just "Recorded"
      // (the record's own details come as "original"; steps added later as "data")
      const dir = (step.original ?? step.data)?.direction;
      if (m && dir === "IN") return { text: t("{side} recorded", { side: t(m.in.label) }), ...IN };
      if (m && dir === "OUT") return { text: t("{side} recorded", { side: t(m.out.label) }), ...OUT };
      return { text: t("Recorded"), tone: "bg-orange-500/10 text-orange-700", icon: FilePlus2 };
    }
    if (step.kind === "VERIFICATION") return { text: t("Verified by Estate Manager"), tone: "bg-emerald-600 text-white", icon: ShieldCheck };
    if (step.kind === "CORRECTION") return { text: t("Correction"), tone: "bg-amber-500/15 text-amber-700", icon: PencilLine };
    // Labour books: a group went out (the last group also records the Out time)
    if (m && Array.isArray(step.data?.exits) && step.data.exits.length) {
      const n = step.data.exits.reduce((sum: number, b: { total?: number }) => sum + (Number(b?.total) || 0), 0);
      return { text: `${t("{side} recorded", { side: t(m.out.label) })} · ${n}`, ...OUT };
    }
    if (step.data?.oneWay === true) return { text: t("Closed"), tone: "bg-zinc-950 text-zinc-300", icon: CheckCircle2 };
    if (m && step.data?.[m.out.timeKey]) return { text: t("{side} recorded", { side: t(m.out.label) }), ...OUT };
    if (m && step.data?.[m.in.timeKey]) return { text: t("{side} recorded", { side: t(m.in.label) }), ...IN };
    return { text: t("Updated"), tone: "bg-zinc-950 text-zinc-300", icon: PencilLine };
  };
  const steps = [entry, ...entry.supplements];
  return (
    <section className="space-y-3">
      <p className="flex items-center gap-2 border-t-2 border-zinc-700 pt-4 text-lg font-bold text-zinc-100">
        <History className="h-5 w-5 text-orange-500" aria-hidden="true" /> {t("Record history")}
      </p>
      <ul className="space-y-2">
        {steps.map((step, i) => {
          const w = what(step, i === 0);
          const Icon = w.icon;
          return (
            <li key={step.id} className="overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 shadow-card">
              {/* Every card the same: what happened (a coloured tag), then When and By on their own divided rows */}
              <div className="px-4 pb-2.5 pt-3">
                <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-base font-bold ${w.tone}`}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {w.text}
                </span>
              </div>
              <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-2.5">
                <span className="w-16 shrink-0 text-sm font-medium text-zinc-500">{t("When")}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-base font-bold tabular-nums text-zinc-100">
                  <Clock className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" /> {formatInstant(step.createdAt)}
                </span>
              </div>
              <div className="flex items-start gap-3 border-t border-zinc-800 px-4 py-2.5">
              <span className="mt-0.5 w-16 shrink-0 text-sm font-medium text-zinc-500">{t("By")}</span>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-base font-bold text-zinc-100">{step.recordedByName}</span>
                {step.recordedByEmployeeId && (
                  <span className="rounded-lg bg-zinc-950 px-2 py-0.5 text-sm font-semibold tabular-nums text-zinc-300">{step.recordedByEmployeeId}</span>
                )}
                {step.recordedAtGate && <span className="rounded-lg bg-orange-500/10 px-2 py-0.5 text-sm font-semibold text-orange-600">{step.recordedAtGate}</span>}
                {step.recordedByRole === "ADMIN" && <span className="rounded-lg bg-zinc-950 px-2 py-0.5 text-sm font-semibold text-zinc-300">{t("Admin")}</span>}
              </div>
              </div>
              {step.reason && (
                <div className="flex items-start gap-3 border-t border-zinc-800 px-4 py-2.5">
                  <span className="w-16 shrink-0 text-sm font-medium text-zinc-500">{t("Reason")}</span>
                  <span className="min-w-0 break-words text-base text-zinc-200">{t(step.reason)}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A short name filled in later (e.g. "Given To"): one line — the box and Save; once set, the name with Edit. */
function QuickTextSection({ field, value, onSave }: { field: FieldDef; value: unknown; onSave?: (value: unknown) => Promise<string | null> }) {
  const t = useT();
  const shown = typeof value === "string" ? value.trim() : "";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(shown);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!onSave || busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    const err = await onSave(text.trim());
    setBusy(false);
    if (err) setError(err);
    else setEditing(false);
  };
  const open = editing || (!shown && !!onSave);
  return (
    <section className="space-y-2 rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 px-4 py-3 shadow-card">
      <p className="text-sm font-semibold text-zinc-400">{t(field.label)}</p>
      {open ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            value={text}
            maxLength={200}
            autoComplete="off"
            aria-label={t(field.label)}
            onChange={(e) => setText(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-zinc-600 bg-zinc-950 px-3 text-base text-zinc-100 outline-none focus:border-orange-500 focus:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-orange-600 px-4 text-base font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t("Save")}
          </button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 break-words text-lg font-bold text-zinc-100">{shown || "—"}</p>
          {onSave && (
            <button
              type="button"
              onClick={() => {
                setText(shown);
                setEditing(true);
              }}
              className="shrink-0 text-sm font-semibold text-orange-600 hover:underline"
            >
              {t("Edit")}
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-600">{registerMessage(t, error)}</p>}
    </section>
  );
}

/**
 * Who took something and whether it is done (e.g. the bill): one line — the name box and
 * "Bill taken"; once marked, one green line with the name (locked).
 */
function TakenSection({
  nameField,
  flagField,
  name,
  taken,
  onSave,
}: {
  nameField: FieldDef;
  flagField: FieldDef;
  name: unknown;
  taken: boolean;
  onSave?: (key: string, value: unknown) => Promise<string | null>;
}) {
  const t = useT();
  const saved = typeof name === "string" ? name.trim() : "";
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yesWord] = yesNoWords(flagField);
  const mark = async () => {
    if (!onSave || busy) return;
    const who = text.trim();
    if (!who) return setError(t("Fill \"{field}\" first", { field: t(nameField.label) }));
    setBusy(true);
    setError(null);
    // The name first (if new / changed), then mark it
    const err = (who !== saved ? await onSave(nameField.key, who) : null) ?? (await onSave(flagField.key, true));
    setBusy(false);
    if (err) setError(err);
  };
  if (taken) {
    return (
      <section className="flex items-center gap-2 rounded-2xl border-[1.5px] border-emerald-500/40 bg-emerald-500/10 px-4 py-3 shadow-card">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <p className="min-w-0 break-words text-base font-bold text-emerald-800">
          {t(yesWord)}
          {saved && <span className="font-semibold"> · {saved}</span>}
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-2 rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 px-4 py-3 shadow-card">
      <p className="text-sm font-semibold text-zinc-400">{t(nameField.label)}</p>
      {onSave ? (
        <div className="flex gap-2">
          <input
            value={text}
            maxLength={200}
            autoComplete="off"
            aria-label={t(nameField.label)}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            className="h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-zinc-600 bg-zinc-950 px-3 text-base text-zinc-100 outline-none focus:border-orange-500 focus:bg-zinc-900"
          />
          <button
            type="button"
            onClick={() => void mark()}
            disabled={busy}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t(yesWord)}
          </button>
        </div>
      ) : (
        <p className="text-base font-semibold text-zinc-300">{saved || t("Not taken yet")}</p>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-600">{registerMessage(t, error)}</p>}
    </section>
  );
}

/** The record's "Verified by Estate Manager" step, if any */
function verificationOf(entry: Entry) {
  return entry.supplements.find((x) => x.kind === "VERIFICATION") ?? null;
}

/** Chip on list rows: solid green "Verified by Estate Manager" (with a shield) / amber "Not verified yet" */
function VerifyChip({ entry }: { entry: Entry }) {
  const t = useT();
  const v = verificationOf(entry);
  return v ? (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-sm font-bold text-white shadow-sm">
      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("Verified by Estate Manager")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-sm font-semibold text-amber-700">
      <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("Not verified yet")}
    </span>
  );
}

/** In the record: verified by whom and when — or "Not verified yet", with ✓ Verify for the Estate Manager */
function VerificationCard({ entry, onVerify }: { entry: Entry; onVerify?: () => Promise<string | null> }) {
  const t = useT();
  const v = verificationOf(entry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (v) {
    return (
      <section className="flex items-start gap-3 rounded-2xl border-[1.5px] border-emerald-500/40 bg-emerald-500/10 px-4 py-3 shadow-card">
        <ShieldCheck className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-base font-bold text-emerald-800">{t("Verified by Estate Manager")}</p>
          <p className="text-sm font-medium text-emerald-700">
            {v.recordedByName} · {formatInstant(v.createdAt)}
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-3 rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 px-4 py-3 shadow-card">
      <p className="flex items-center gap-2 text-base font-bold text-zinc-300">
        <Clock className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" /> {t("Not verified yet")}
      </p>
      {onVerify && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const err = await onVerify();
            setBusy(false);
            if (err) setError(err);
          }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-card transition-[background-color,transform] hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} {t("Verify")}
        </button>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-600">{registerMessage(t, error)}</p>}
    </section>
  );
}

/** "1 h 5 min", "45 min", "2 d 3 h" */
function durationText(t: Translate, mins: number): string {
  if (mins < 60) return t("{m} min", { m: mins });
  const h = Math.floor(mins / 60);
  if (h < 24) return mins % 60 ? t("{h} h {m} min", { h, m: mins % 60 }) : t("{h} h", { h });
  return t("{d} d {h} h", { d: Math.floor(h / 24), h: h % 24 });
}

type TripSide = { dir: "IN" | "OUT"; label: string; time: string | null };
type Trip = { first: TripSide; second: TripSide | null; pending: string | null };

/** The day (India time) a step was saved: "2026-11-06" */
const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * A record's In → Out (or Out → In): both times, and how long between them.
 * The second time's day is the day it was recorded (a trip can cross midnight).
 */
function tripOf(def: EntryRegister, e: Entry): (Trip & { minutes: number | null }) | null {
  const m = def.movement;
  if (!m || m.single) return null;
  const v = e.current;
  const startDir: "IN" | "OUT" = v.direction === "OUT" ? "OUT" : v.direction === "IN" ? "IN" : m.firstDirections[0] ?? "IN";
  const otherDir: "IN" | "OUT" = startDir === "IN" ? "OUT" : "IN";
  const sideOf = (d: "IN" | "OUT") => (d === "IN" ? m.in : m.out);
  const raw = (key: string) => (typeof v[key] === "string" && /^\d{1,2}:\d{2}/.test(v[key]) ? (v[key] as string) : null);
  const t1 = raw(sideOf(startDir).timeKey);
  if (!t1) return null;
  const t2 = raw(sideOf(otherDir).timeKey);
  const clock = (x: string | null) => (x ? formatFieldValue({ key: "t", label: "", type: "time" }, x) : null);
  const first: TripSide = { dir: startDir, label: sideOf(startDir).label, time: clock(t1) };
  const oneWay = v.oneWay === true;
  const second: TripSide | null = oneWay && !t2 ? null : { dir: otherDir, label: sideOf(otherDir).label, time: clock(t2) };
  let minutes: number | null = null;
  if (t2) {
    const day1 = String(e.entryDate).slice(0, 10);
    const done = [...e.supplements].reverse().find((x) => x.data && Object.prototype.hasOwnProperty.call(x.data, sideOf(otherDir).timeKey));
    const day2 = done ? istDay(done.createdAt) : day1;
    const at = (day: string, hm: string) => Date.parse(`${day}T${hm.length === 4 ? "0" + hm : hm.slice(0, 5)}:00+05:30`);
    const a = at(day1, t1);
    let b = at(day2, t2);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (b < a && day1 === day2) b += 86_400_000;
      const mins = Math.round((b - a) / 60_000);
      if (mins >= 0 && mins < 60 * 24 * 60) minutes = mins;
    }
  }
  return { first, second, pending: second && !second.time ? (otherDir === "IN" ? "Not back yet" : "Still inside") : null, minutes };
}

/** One clear line: "In 10:30 AM → Out 11:30 AM · ⏱ 1 h" (or "→ Out: Still inside") */
function TripLine({ trip }: { trip: Trip & { minutes: number | null } }) {
  const t = useT();
  const part = (x: TripSide) => (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", x.dir === "IN" ? "text-emerald-700" : "text-sky-700")}>
      {x.dir === "IN" ? <LogIn className="h-4 w-4" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
      {t(x.label)} {x.time}
    </span>
  );
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-base font-bold tabular-nums">
      {part(trip.first)}
      {trip.second && (
        <>
          <span className="text-zinc-400" aria-hidden="true">→</span>
          {trip.second.time ? (
            part(trip.second)
          ) : (
            <span className="whitespace-nowrap text-sm font-semibold text-amber-700">{t(trip.pending ?? "")}</span>
          )}
        </>
      )}
      {trip.minutes !== null && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-zinc-900 px-2 py-0.5 text-sm text-zinc-100 shadow-sm">
          <Timer className="h-4 w-4 text-orange-500" aria-hidden="true" /> {durationText(t, trip.minutes)}
        </span>
      )}
    </span>
  );
}

/** A photo added later on the saved record (e.g. the bill after "No bill"): the photo, or "Add" */
function PhotoLaterSection({
  field,
  registerKey,
  value,
  onSave,
}: {
  field: FieldDef;
  registerKey: string;
  value: unknown;
  onSave?: (value: unknown) => Promise<string | null>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Several photos: taken here first, then saved together
  const [taken, setTaken] = useState<string[]>([]);
  const has = photoList(value).length > 0;
  const [doneWord, pendingWord] = field.laterStatus ?? ["Added", "Not added yet"];
  const saveTaken = async () => {
    if (!onSave || busy || taken.length === 0) return;
    setBusy(true);
    setError(null);
    const err = await onSave(taken);
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <section className="space-y-3 rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-zinc-100">{t(field.label)}</h3>
        {has ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-sm font-bold text-white">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t(doneWord)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg border-[1.5px] border-amber-500/60 bg-amber-500/15 px-2.5 py-1 text-sm font-bold text-amber-700">
            <Clock className="h-4 w-4" aria-hidden="true" /> {t(pendingWord)}
          </span>
        )}
      </div>
      {has ? (
        <RegisterPhotos value={value} />
      ) : onSave && field.maxPhotos ? (
        <div className="space-y-3">
          <div>
          <MultiPhotoInput
            id={`later-${field.key}`}
            value={taken}
            onChange={setTaken}
            registerKey={registerKey}
            label={field.label}
            max={field.maxPhotos}
          />
          </div>
          {taken.length > 0 && (
            <button
              type="button"
              onClick={saveTaken}
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
              {t("Save {label}", { label: t(field.label) })}
            </button>
          )}
        </div>
      ) : onSave ? (
        <div className="w-44">
          <PhotoInput
            id={`later-${field.key}`}
            value=""
            registerKey={registerKey}
            label={t(field.label)}
            onChange={async (path) => {
              if (!path) return;
              setBusy(true);
              setError(null);
              const err = await onSave(path);
              setBusy(false);
              if (err) setError(err);
            }}
          />
        </div>
      ) : null}
      {busy && (
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("Saving…")}
        </p>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-600">{registerMessage(t, error)}</p>}
    </section>
  );
}

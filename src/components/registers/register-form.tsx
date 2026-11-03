"use client";
import { ThemedSelect } from "@/components/ui/themed-select";
import { DateField } from "@/components/ui/date-field";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useRef, useState } from "react";
import { VoicePanel, useVoiceFill } from "@/components/voice/voice-fill";
import { HostPicker } from "@/components/visits/host-picker";
import { VisitCodeFields, visitInputReady, type VisitExitInput } from "@/components/visits/visit-code";
import type { VoiceFill } from "@/lib/voice/spec";
import { AlertCircle, FileText, CalendarDays, Camera, CheckCircle2, FileX, ChevronDown, Clock, History, Info, KeyRound, Loader2, LogIn, LogOut, Mic, Plus, PlusCircle, RotateCcw, Save, Trash2, X } from "lucide-react";
import { callGate } from "@/lib/gate-call";
import { DepartmentSelect } from "@/components/ui/department-select";
import { CooliePicker, SirosNewPeople, SirosPersonDialog, contractorItems, useSirosPeople } from "./siros-people";
import { ComboInput, useVehicleOptions, type ComboItem } from "./combo-input";
import { compressPhoto } from "@/lib/images/compress-photo";
import type { Direction, EntryRegister, FieldDef, GroupDef } from "@/lib/registers/definitions";
import { isFieldRequired, pendingActions, yesNoWords } from "@/lib/registers/definitions";
import { cn, formatDate } from "@/lib/utils";
import { Modal } from "@/components/ui/primitives";
import type { readBillPhoto } from "@/server/actions/bill-reader";
import { useGateData } from "@/lib/gate-cache";
import { displayValue } from "./localize";

export type StaffOption = { id: string; name: string; employeeId: string | null };
type Values = Record<string, any>;

/**
 * What was typed in a new record, kept for this browser tab until it is saved:
 * a mistaken Back (or closing the form) loses nothing, and reopening the form
 * brings it all back. Cleared on save (clearRegisterDraft) or with "Clear form".
 */
const DRAFT_PREFIX = "gatepass:register-draft:";
const DRAFT_MAX_AGE_MS = 12 * 60 * 60_000;
type Draft = { values: Values; rows: Record<string, Values[]>; direction: Direction | null; oneWay: boolean; visitHost: string; at: number };

function readDraft(registerKey: string): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_PREFIX + registerKey) || "null") as Draft | null;
    return d && Date.now() - d.at < DRAFT_MAX_AGE_MS ? d : null;
  } catch {
    return null;
  }
}

/**
 * Save started (the form closes / clears at once): take the kept copy out, so a
 * new form doesn't show these details again. Put it back with restoreRegisterDraft
 * if the save fails, and the reopened form shows everything that was typed.
 */
export function takeRegisterDraft(registerKey: string): string | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + registerKey);
    sessionStorage.removeItem(DRAFT_PREFIX + registerKey);
    return raw;
  } catch {
    return null;
  }
}
export function restoreRegisterDraft(registerKey: string, raw: string | null) {
  if (!raw) return;
  try {
    sessionStorage.setItem(DRAFT_PREFIX + registerKey, raw);
  } catch {}
}

/** The record was saved: its kept copy is no longer needed */
export function clearRegisterDraft(registerKey: string) {
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + registerKey);
  } catch {}
}

const filledIn = (v: unknown) => String(v ?? "").trim() !== "";

/** The last In / Out saved in this register (this tab), so the next fresh form starts on it */
const LAST_DIRECTION_PREFIX = "gatepass:register-direction:";
function readLastDirection(registerKey: string): Direction | null {
  try {
    const v = sessionStorage.getItem(LAST_DIRECTION_PREFIX + registerKey);
    return v === "IN" || v === "OUT" ? v : null;
  } catch {
    return null;
  }
}
function rememberDirection(registerKey: string, d: Direction | null | undefined) {
  if (d !== "IN" && d !== "OUT") return;
  try {
    sessionStorage.setItem(LAST_DIRECTION_PREFIX + registerKey, d);
  } catch {}
}
/** Anything typed or picked (a direction alone does not count) */
function hasTyped(values: Values, rows: Record<string, Values[]>, visitHost: string) {
  return (
    !!visitHost ||
    Object.values(values).some(filledIn) ||
    Object.values(rows).some((list) => list.some((row) => Object.values(row).some(filledIn)))
  );
}

// text-base on phones keeps iOS from zooming into the field
export const inputCls =
  "flex h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 [color-scheme:light] outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 disabled:opacity-60";

export type PersonOption = { name: string; employeeId: string | null; designation: string | null; department: string | null };

// Faculty / staff list: shared by every picker; fetched again when over 30 s old
let peopleCache: { at: number; list: Promise<PersonOption[]> } | null = null;
function loadPeople(): Promise<PersonOption[]> {
  if (!peopleCache || Date.now() - peopleCache.at > 30_000) {
    peopleCache = {
      at: Date.now(),
      list: callGate("getRegisterPeopleOptions", [], 15_000).catch(() => {
        peopleCache = null;
        return [];
      }),
    };
  }
  return peopleCache.list;
}

const personLabel = (p: PersonOption) => (p.employeeId ? `${p.name} (${p.employeeId})` : p.name);

/**
 * Faculty / staff picker: type to search the portal's faculty, HODs, Deans and
 * Wardens and pick one, or just type a name that isn't listed.
 */
function PersonInput({
  id,
  value,
  onChange,
  onPick,
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick?: (p: PersonOption) => void;
  required?: boolean;
}) {
  const t = useT();
  const [people, setPeople] = useState<PersonOption[] | null>(null);
  const [open, setOpen] = useState(false);
  // The list opens downwards: scroll just enough that all of it shows above the sticky Save bar
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    let alive = true;
    loadPeople().then((list) => alive && setPeople(list));
    return () => {
      alive = false;
    };
  }, []);

  // A picked name shows the whole list again (to change it); typing searches
  const exact = (people ?? []).some((p) => personLabel(p) === value);
  const q = exact ? "" : value.trim().toLowerCase();
  const matches = (people ?? [])
    .filter(
      (p) =>
        !q ||
        personLabel(p).toLowerCase().includes(q) ||
        (p.department ?? "").toLowerCase().includes(q) ||
        (p.designation ?? "").toLowerCase().includes(q)
    )
    .slice(0, exact ? 50 : 8);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        value={value}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        placeholder={t("Search name, or type it")}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        className={`${inputCls} ${value ? "pr-20" : "pr-11"}`}
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
        {value && (
          <button
            type="button"
            aria-label={t("Clear")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setOpen(true);
              inputRef.current?.focus();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-950 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("Show list")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen((o) => !o);
            inputRef.current?.focus();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-950 hover:text-zinc-200"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <ul ref={listRef} id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-1 shadow-card">
          {people === null ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Loading…")}
            </li>
          ) : matches.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-zinc-500">{t("Not in the list: the typed name will be saved.")}</li>
          ) : (
            matches.map((p) => (
              <li key={personLabel(p)} role="option" aria-selected={personLabel(p) === value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(personLabel(p));
                    onPick?.(p);
                    setOpen(false);
                  }}
                  className={`flex w-full min-h-11 flex-col items-start justify-center rounded-xl px-3 py-2 text-left transition-colors ${
                    personLabel(p) === value ? "bg-orange-500/10" : "hover:bg-zinc-950"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    {personLabel(p)}
                    {personLabel(p) === value && <CheckCircle2 className="h-4 w-4 text-orange-400" />}
                  </span>
                  {(p.designation || p.department) && (
                    <span className="text-xs text-zinc-500">{[p.designation, p.department].filter(Boolean).join(" · ")}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

const OTHER_CHOICE = "__other__";

/** Choice list plus "Other", which opens a box to type any value (e.g. Shift: A / B / C / Other). */
function ChoiceWithOther({
  id,
  options,
  value,
  onChange,
  required,
}: {
  id: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const t = useT();
  const [choice, setChoice] = useState(() => (value && !options.includes(value) ? OTHER_CHOICE : value));
  const [custom, setCustom] = useState(() => (value && !options.includes(value) ? value : ""));
  return (
    <div className="space-y-2">
      <ThemedSelect
        id={id}
        value={choice}
        required={required}
        onChange={(e) => {
          setChoice(e.target.value);
          onChange(e.target.value === OTHER_CHOICE ? custom.trim() : e.target.value);
        }}
        className={`${inputCls} [&>option]:bg-zinc-900`}
      >
        <option value="">{t("— Select —")}</option>
        {options.map((o) => (
          <option key={o} value={o}>{t(o)}</option>
        ))}
        <option value={OTHER_CHOICE}>{t("Other")}</option>
      </ThemedSelect>
      {choice === OTHER_CHOICE && (
        <input
          type="text"
          value={custom}
          maxLength={60}
          required={required}
          autoFocus
          placeholder={t("Type here")}
          aria-label={t("Type here")}
          onChange={(e) => {
            setCustom(e.target.value);
            onChange(e.target.value.trim());
          }}
          className={inputCls}
        />
      )}
    </div>
  );
}

/** Plain number box (no up / down arrows): keeps digits and one decimal point. */
function numericOnly(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  return dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}

/** Large save button pinned to the bottom of the popup while the form scrolls. */
// Docked Save bar: a soft shadow above it so fields scrolling underneath read as
// "more above", and a gap before it so the last field is never tucked under it.
// It sticks at -bottom-4 / -bottom-6 (the popup body's padding): a sticky bar stops
// at the padding edge, so at bottom-0 a strip was left below it with fields
// scrolling through.
const stickyFooterCls =
  "sticky -bottom-4 sm:-bottom-6 z-10 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6 !mt-6 space-y-2 rounded-b-3xl border-t border-zinc-800 bg-zinc-900 px-4 pt-3 pb-4 sm:px-6 sm:pb-6 shadow-[0_-12px_24px_-14px_rgba(16,24,40,0.25)]";
const saveBtnCls =
  "inline-flex w-full h-14 items-center justify-center gap-2 rounded-full text-base font-semibold text-white transition-[background-color,transform] active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100";

/** Today's date and a live clock. The server records its own time when saving. */
export function LiveDateTime() {
  const tr = useT();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    // Minutes only: a ticking seconds display changed width and made the form below jump
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const time = now
    ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "—";
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      {/* Fixed layout (never re-wraps): date and time side by side */}
      <div className="flex items-center gap-x-5 whitespace-nowrap">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <CalendarDays className="h-4 w-4 text-orange-400" /> {now ? formatDate(now) : "—"}
        </span>
        <span className="flex items-center gap-2 text-base font-semibold text-zinc-100 tabular-nums">
          <Clock className="h-4 w-4 text-orange-400" /> {time}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{tr("Date and time are recorded automatically when you save.")}</p>
    </div>
  );
}

/** Date and time on one small line ("1 Nov · 11:27 pm"). The server records its own time when saving. */
function CompactDateTime() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  const text = now
    ? `${now.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · ${now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}`
    : "—";
  return (
    <p className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-zinc-300 tabular-nums">
      <Clock className="h-4 w-4 text-orange-400" aria-hidden="true" /> {text}
    </p>
  );
}

/** Fields the new-entry form shows (no date / time boxes, only the chosen side's reading) */
function visibleFields(def: EntryRegister, direction: Direction | null, values: Record<string, unknown> = {}): FieldDef[] {
  const m = def.movement;
  const side = m && direction ? (direction === "IN" ? m.in : m.out) : null;
  const readingKeys = new Set([m?.in.readingKey, m?.out.readingKey].filter(Boolean) as string[]);
  return def.fields.filter(
    (f) =>
      f.type !== "date" &&
      f.type !== "time" &&
      f.key !== m?.directionField &&
      (!readingKeys.has(f.key) || f.key === side?.readingKey) &&
      !f.formHidden &&
      // Shown only after its button (e.g. Supplier name after "Supplier known")
      (!f.showWhen || values[f.showWhen] === "yes")
  );
}

/**
 * Required fields (and photos at the very top of the definition) show first;
 * everything else folds under "More details".
 */
function splitFields(
  def: EntryRegister,
  direction: Direction | null,
  values: Record<string, unknown> = {}
): { primary: FieldDef[]; more: FieldDef[] } {
  const all = visibleFields(def, direction, values);
  const topPhotos = new Set<string>();
  for (const f of all) {
    // A leading In / Out button pair (stock registers) sits above the photos
    if (f.type !== "photo") {
      if (topPhotos.size === 0 && f.buttons && f.type === "select") continue;
      break;
    }
    topPhotos.add(f.key);
  }
  const anyOf = new Set((def.requiredAny ?? []).flat());
  const flagKey = def.requiredUnless?.flag;
  // Car Book / Auto Book: the few shown fields are all up front
  let primary = def.highlightRequired
    ? all
    : all.filter(
        (f) =>
          def.required.includes(f.key) ||
          f.upFront ||
          !!f.showWhen ||
          def.fields.some((x) => x.showWhen === f.key) ||
          anyOf.has(f.key) ||
          topPhotos.has(f.key) ||
          f.key === flagKey
      );
  // Nothing required: show the first few so the form is not just a toggle
  if (primary.length === 0) primary = all.slice(0, 3);
  const keys = new Set(primary.map((f) => f.key));
  return { primary, more: all.filter((f) => !keys.has(f.key)) };
}


function emptyRow(g: GroupDef): Values {
  return Object.fromEntries(g.fields.filter((f) => f.type !== "time").map((f) => [f.key, ""]));
}

/** Camera photo for a register entry: compressed in the browser, uploaded at once, the stored path is the value. */
function PhotoInput({
  id,
  value,
  onChange,
  registerKey,
  label,
  required = false,
  dimmed = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  registerKey: string;
  label: string;
  required?: boolean;
  dimmed?: boolean;
}) {
  const t = useT();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const has = !!(preview || value);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const b64 = await compressPhoto(file);
      setPreview(b64);
      const res: any = await callGate("uploadRegisterPhoto", [b64, registerKey], 30_000);
      if (res.error || !res.path) {
        setError(t("Photo upload failed:") + " " + (res.error || t("unknown error")));
        setPreview(null);
        onChange("");
      } else {
        onChange(res.path);
      }
    } catch (err: any) {
      setError(t(err?.message || "Photo upload failed:"));
      setPreview(null);
      onChange("");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-1.5">
      <div className={`photo-tile relative aspect-[4/3] w-full ${dimmed ? "opacity-40" : ""}`}>
        <label
          htmlFor={id}
          className={`flex h-full w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 text-center transition-colors ${
            has ? "border-zinc-800 bg-zinc-950" : "border-dashed border-orange-500/50 bg-orange-500/5 hover:bg-orange-500/10"
          } ${busy || dimmed ? "pointer-events-none" : "cursor-pointer"}`}
        >
          {preview ? (
            <img src={preview} alt={t(label)} className="h-full w-full object-cover" />
          ) : (
            <>
              {value ? <CheckCircle2 className="h-8 w-8 text-emerald-500" /> : <Camera className="h-8 w-8 text-orange-500" />}
              <span className="px-2 text-xs font-semibold leading-tight text-zinc-300">
                {dimmed ? t("No bill") : t(label)}
                {required && !dimmed && <span className="ml-0.5 text-orange-500">*</span>}
              </span>
            </>
          )}
        </label>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-orange-600" aria-label={t("Uploading…")} />
          </span>
        )}
        <input ref={inputRef} id={id} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        {has && !busy && !dimmed && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="absolute bottom-1.5 left-1.5 inline-flex h-7 items-center gap-1 rounded-full bg-orange-600 px-2.5 text-[11px] font-semibold text-white shadow-sm hover:bg-orange-700"
            >
              <Camera className="h-3 w-3" aria-hidden="true" /> {t("Retake")}
            </button>
            <button
              type="button"
              aria-label={t("Remove")}
              onClick={() => {
                setPreview(null);
                setError(null);
                onChange("");
              }}
              className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/80 text-white hover:bg-zinc-900"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function FieldInput({
  f,
  id,
  value,
  onChange,
  staff,
  required = false,
  registerKey = "",
  dimmed = false,
  onPickPerson,
  combo,
}: {
  f: FieldDef;
  id: string;
  value: any;
  onChange: (v: any) => void;
  staff: StaffOption[];
  required?: boolean;
  registerKey?: string;
  /** Photo tile shown as "No bill" (the bill is waived) */
  dimmed?: boolean;
  /** "person" fields: the picked faculty / staff member (to fill designation etc.) */
  onPickPerson?: (p: PersonOption) => void;
  /** Driver / car / faculty boxes (Car Book, Auto Book): the list behind the "Select" button */
  combo?: { items: ComboItem[]; loading: boolean; onPick?: (item: ComboItem) => void };
}) {
  const t = useT();
  if (f.combo && combo) {
    return (
      <ComboInput
        id={id}
        value={value ?? ""}
        onChange={onChange}
        onPick={combo.onPick}
        items={combo.items}
        loading={combo.loading}
        required={required}
        placeholder={f.placeholder}
        title={f.label}
        inputClassName={inputCls}
      />
    );
  }
  switch (f.type) {
    case "person":
      return (
        <div className="space-y-2">
          {/* Remounted on a one-tap answer, so the search box shows it */}
          <PersonInput key={f.quickValues?.includes(value ?? "") ? `q-${value}` : "typed"} id={id} value={value ?? ""} onChange={onChange} onPick={onPickPerson} required={required} />
          {f.quickValues?.length ? (
            <div className="flex flex-wrap gap-2">
              {f.quickValues.map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={value === q}
                  onClick={() => onChange(value === q ? "" : q)}
                  className={cn(
                    "inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
                    value === q ? "border-orange-500 bg-orange-500/10 text-orange-600" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                  )}
                >
                  {t(q)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    case "department":
      return <DepartmentSelect id={id} value={value ?? ""} onChange={onChange} required={required} allowOther />;
    case "photo":
      return <PhotoInput id={id} value={value ?? ""} onChange={onChange} registerKey={registerKey} label={f.label} required={required} dimmed={dimmed} />;
    case "textarea":
      return (
        <textarea
          id={id}
          value={value}
          maxLength={1000}
          rows={2}
          placeholder={f.placeholder}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} h-auto min-h-[96px] py-3 resize-none`}
        />
      );
    case "select":
    case "yesno":
    case "staff": {
      if (f.buttons && f.type === "yesno") {
        const on = value === "yes";
        return (
          <button
            id={id}
            type="button"
            onClick={() => onChange(on ? "" : "yes")}
            aria-pressed={on}
            className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 px-3 text-base font-semibold transition-colors ${
              on ? "border-orange-500 bg-orange-500/15 text-orange-600" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            {on && <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />}
            {t(yesNoWords(f)[0])}
          </button>
        );
      }
      if (f.buttons && f.type === "select" && !f.allowOther) {
        return (
          <div role="group" aria-labelledby={id} className="grid grid-cols-2 gap-2">
            {(f.options ?? []).map((o) => {
              const on = value === o;
              // In / Inward green, Out / Outward blue (like the In / Out buttons); other choices coral
              const dir = /^(in|inward)$/i.test(o) ? "in" : /^(out|outward)$/i.test(o) ? "out" : null;
              const DirIcon = dir === "in" ? LogIn : LogOut;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => onChange(o)}
                  aria-pressed={on}
                  data-big-btn=""
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] px-3 text-base font-semibold outline-none transition-[background-color,border-color,color,transform] focus-visible:ring-4 focus-visible:ring-orange-500/20 active:scale-[0.98] ${
                    on
                      ? dir === "in"
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_6px_14px_-8px_rgba(5,150,105,0.7)]"
                        : dir === "out"
                        ? "border-sky-600 bg-sky-600 text-white shadow-[0_6px_14px_-8px_rgba(2,132,199,0.7)]"
                        : "border-orange-500 bg-orange-500/15 text-orange-600"
                      : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:bg-zinc-950"
                  }`}
                >
                  {on ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                  ) : dir ? (
                    <DirIcon className={`h-4 w-4 shrink-0 ${dir === "in" ? "text-emerald-600" : "text-sky-600"}`} aria-hidden="true" />
                  ) : null}
                  {t(o)}
                </button>
              );
            })}
          </div>
        );
      }
      if (f.type === "select" && f.allowOther) {
        return <ChoiceWithOther id={id} options={f.options ?? []} value={value ?? ""} onChange={onChange} required={required} />;
      }
      const options =
        f.type === "yesno"
          ? yesNoWords(f).map((w, i) => ({ v: i === 0 ? "yes" : "no", l: t(w) }))
          : f.type === "staff"
          ? staff.map((s) => ({ v: s.id, l: `${s.name}${s.employeeId ? ` (${s.employeeId})` : ""}` }))
          : (f.options ?? []).map((o) => ({ v: o, l: t(o) }));
      return (
        <ThemedSelect id={id} value={value} required={required} onChange={(e) => onChange(e.target.value)} className={`${inputCls} [&>option]:bg-zinc-900`}>
          <option value="">{t("— Select —")}</option>
          {options.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </ThemedSelect>
      );
    }
    case "number": {
      const box = (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          required={required}
          onChange={(e) => onChange(numericOnly(e.target.value))}
          className={`${inputCls} ${f.label.includes("₹") ? "pl-9" : ""}`}
        />
      );
      // Money: a ₹ sign inside the box (numbers only)
      return f.label.includes("₹") ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-zinc-400" aria-hidden="true">
            ₹
          </span>
          {box}
        </div>
      ) : (
        box
      );
    }
    case "phone":
      return <input id={id} type="tel" maxLength={15} value={value} placeholder={f.placeholder} required={required} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    default:
      return <input id={id} type="text" maxLength={200} value={value} placeholder={f.placeholder} required={required} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
  }
}

function FieldBlock({
  f,
  id,
  required = false,
  voice = false,
  missing = false,
  highlight = false,
  error = null,
  fieldKey,
  children,
}: {
  f: FieldDef;
  id: string;
  /** Marker the form scrolls to (default: the field key; worker rows use "group.row.field") */
  fieldKey?: string;
  /** Not filled / not valid: red border and this message under the box (the form scrolls here) */
  error?: string | null;
  required?: boolean;
  /** Filled from the guard's voice: highlighted until they check / edit it */
  voice?: boolean;
  /** Required, but not heard in what the guard said */
  missing?: boolean;
  /** Required field of a register with highlightRequired: tinted box */
  highlight?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const buttonOnly = f.type === "yesno" && !!f.buttons;
  const errorLine = error ? (
    <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-red-600">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
    </p>
  ) : null;
  if (f.type === "photo")
    return (
      <div data-field={fieldKey ?? f.key} className="min-w-0 space-y-1.5 scroll-mt-24">
        <div className={error ? "rounded-2xl ring-2 ring-red-500" : undefined}>{children}</div>
        {errorLine}
      </div>
    );
  return (
    <div data-field={fieldKey ?? f.key} className={`space-y-1.5 min-w-0 scroll-mt-24 ${f.type === "textarea" || f.buttons ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className={cn("field-label flex flex-wrap items-baseline gap-1 text-sm font-medium text-zinc-200", buttonOnly && "sr-only")}>
        <span className="min-w-0">{f.label}</span>
        {required && (
          <span className="text-base leading-none font-semibold text-orange-500" aria-hidden="true">
            *
          </span>
        )}
        {voice && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
            <Mic className="h-3 w-3" aria-hidden="true" /> {t("Check")}
          </span>
        )}
        {missing && <span className="ml-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-500">{t("Not heard — fill in")}</span>}
      </label>
      <div
        className={
          error
            ? "rounded-2xl ring-2 ring-red-500 [&_input]:!border-red-500 [&_textarea]:!border-red-500 [&_button[role=combobox]]:!border-red-500"
            : voice
            ? "rounded-2xl ring-2 ring-amber-400/60"
            : missing
            ? "rounded-2xl ring-2 ring-red-400/60"
            : highlight && required
            ? "[&_input]:border-orange-400/40 [&_input]:bg-white"
            : undefined
        }
      >{children}</div>
      {errorLine}
      {f.hint && <p className="field-hint text-[11px] leading-snug text-zinc-500">{f.hint}</p>}
    </div>
  );
}

function DirectionPicker({
  def,
  value,
  onChange,
  compact = false,
}: {
  def: EntryRegister;
  value: Direction | null;
  onChange: (d: Direction) => void;
  /** Small two-button control (the new-entry form) */
  compact?: boolean;
}) {
  const t = useT();
  const m = def.movement!;
  const choices = (["IN", "OUT"] as Direction[]).filter((d) => m.firstDirections.includes(d));
  if (compact)
    return (
      <fieldset>
        <legend className="sr-only">{t("In or Out")}</legend>
        {/* Two separate buttons (not one merged bar) */}
        <div className={`grid gap-3 ${choices.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {choices.map((d) => {
            const side = d === "IN" ? m.in : m.out;
            const active = value === d;
            const Icon = d === "IN" ? LogIn : LogOut;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onChange(d)}
                aria-pressed={active}
                data-big-btn=""
                className={`flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border-[1.5px] px-3 text-base font-semibold leading-tight transition-[background-color,border-color,color,transform] outline-none focus-visible:ring-4 focus-visible:ring-orange-500/20 active:scale-[0.98] ${
                  // Only the chosen one is coloured (In green, Out blue); the other is plain
                  active
                    ? d === "IN"
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_6px_14px_-8px_rgba(5,150,105,0.7)]"
                      : "border-sky-600 bg-sky-600 text-white shadow-[0_6px_14px_-8px_rgba(2,132,199,0.7)]"
                    : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:bg-zinc-950"
                }`}
              >
                {active ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                ) : (
                  <Icon className={`h-4 w-4 shrink-0 ${d === "IN" ? "text-emerald-600" : "text-sky-600"}`} aria-hidden="true" />
                )}
                <span className="min-w-0 text-center">{side.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-zinc-200 mb-2">{t("In or Out")}</legend>
      <div className={`grid gap-3 ${choices.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {choices.map((d) => {
          const side = d === "IN" ? m.in : m.out;
          const active = value === d;
          const Icon = d === "IN" ? LogIn : LogOut;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              aria-pressed={active}
              className={`relative flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-3 text-base font-semibold transition-[background-color,border-color,color,transform] active:scale-[0.98] ${
                active
                  ? d === "IN"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-sky-500 bg-sky-500/10 text-sky-400"
                  : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-950"
              }`}
            >
              {active && <CheckCircle2 className="absolute right-2.5 top-2.5 h-5 w-5" aria-hidden="true" />}
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  active ? (d === "IN" ? "bg-emerald-500/15" : "bg-sky-500/15") : "bg-zinc-950 text-zinc-500"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-center leading-tight">{side.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * New record form. Every input is optional (at least one detail is needed);
 * the date and time are set by the server when it is saved.
 */
export function RegisterForm({
  def,
  staff,
  busy,
  onSubmit,
}: {
  def: EntryRegister;
  staff: StaffOption[];
  busy: boolean;
  onSubmit: (payload: { fields: Values; groups: Record<string, Values[]>; direction?: Direction; oneWay?: boolean; visitHost?: string }) => void;
}) {
  const t = useT();
  const m = def.movement;
  // What was typed here before and not saved (the form only opens on a tap, so this runs in the browser)
  const [draft] = useState(() => readDraft(def.key));
  const defaultDirection: Direction | null = m ? m.startWith ?? (m.firstDirections.length === 1 ? m.firstDirections[0] : null) : null;
  // The last one used here wins (when this register may start either way)
  const [lastDirection] = useState(() => (m && m.firstDirections.length > 1 && !m.chooseEachTime ? readLastDirection(def.key) : null));
  // Car Book: nothing chosen when the form opens
  const startDirection: Direction | null = m?.chooseEachTime ? null : lastDirection ?? defaultDirection;
  // Car Book / Auto Book: drivers, cars and faculty behind the "Select" buttons (one request, kept for the session)
  const vehicleOpts = useVehicleOptions(
    def.key,
    def.fields.some((f) => !!f.combo && f.combo !== "sirosContractor" && f.combo !== "options" && f.combo !== "suggest")
  );
  // Boxes that suggest what was typed before (e.g. Work Area, officer): one request for all of them
  const suggestKeys = def.fields.filter((f) => (f.combo === "suggest" || f.combo === "sirosContractor") && !f.formHidden).map((f) => f.key);
  const suggestions = useGateData<{ values?: Record<string, string[]>; fills?: Record<string, Record<string, Record<string, string>>> }>(
    suggestKeys.length ? `suggest|${def.key}|${suggestKeys.join(",")}` : null,
    () =>
      callGate("getFieldSuggestions", [def.key, suggestKeys], 15_000) as Promise<{
        values?: Record<string, string[]>;
        fills?: Record<string, Record<string, Record<string, string>>>;
      }>,
    [`reg:${def.key}`]
  );
  // Siros Venture labour: registered coolies and contractors (picked by name or number)
  const sirosBook = !!def.groups?.some((g) => g.picker === "sirosCoolie");
  const sirosPeople = useSirosPeople(sirosBook);
  // Details pop-up for a registered contractor / coolie (by number)
  const [sirosView, setSirosView] = useState<number | null>(null);
  const contractorNo = (name: unknown) => {
    const n = String(name ?? "").trim().toLowerCase();
    return n ? sirosPeople?.people.find((p) => p.kind === "CONTRACTOR" && p.name.trim().toLowerCase() === n)?.no ?? null : null;
  };
  const comboFor = (f: FieldDef) => {
    if (!f.combo) return undefined;
    if (f.combo === "options") {
      // A fixed list (e.g. Work Type); anything else can be typed
      return { items: (f.options ?? []).map((o) => ({ fill: o, label: t(o) })), loading: false };
    }
    if (f.combo === "suggest") {
      const first = f.suggestFirst ?? [];
      const typed = (suggestions.data?.values?.[f.key] ?? []).filter((v) => !first.some((x) => x.toLowerCase() === v.toLowerCase()));
      // The fixed first choices in the guard's language (saved in English, like other choices)
      return {
        items: [...first.map((v) => ({ fill: v, label: t(v) })), ...typed.map((v) => ({ fill: v }))],
        loading: !suggestions.data && suggestions.loading,
        // A past name: also fill its designation / department from that earlier entry
        onPick: f.suggestFills?.length
          ? (item: ComboItem) => {
              const more = suggestions.data?.fills?.[f.key]?.[item.fill.trim().toLowerCase()];
              if (more) setValues((v) => ({ ...v, ...more }));
            }
          : undefined,
      };
    }
    if (f.combo === "sirosContractor") {
      return {
        items: contractorItems(sirosPeople, suggestions.data?.values?.[f.key] ?? []),
        loading: sirosPeople === null,
        // Picking a contractor fills their phone too (still editable)
        onPick: (item: ComboItem) => setValues((v) => ({ ...v, ...(item.extra ? { phone: item.extra } : {}) })),
      };
    }
    const o = vehicleOpts;
    const items: ComboItem[] =
      f.combo === "driver"
        ? (o?.drivers ?? []).map((d) => ({ fill: d.name, sub: d.phone ?? undefined }))
        : f.combo === "purpose"
        ? (o?.purposes ?? []).map((p) => ({ fill: p }))
        : f.combo === "carName"
        ? (o?.vehicles ?? [])
            .filter((v) => v.name)
            .map((v) => ({ fill: v.name, label: v.number ? `${v.name} · ${v.number}` : v.name, extra: v.number }))
        : f.combo === "vehicle"
        ? (o?.vehicles ?? []).map((v) => ({
            fill: v.number || v.name,
            label: v.name && v.number ? `${v.name} · ${v.number}` : v.number || v.name,
            extra: v.number ? v.name : "",
          }))
        : (o?.people ?? []).map((p) => ({ fill: p }));
    return {
      items,
      loading: o === null,
      // Picking a car / auto fills its name too; typing over it forgets the name
      onPick: f.comboFills ? (item: ComboItem) => setValues((s) => ({ ...s, ...(item.extra ? { [f.comboFills!]: item.extra } : {}) })) : undefined,
    };
  };
  // "Meeting (faculty / staff)" (registers with def.visitHost): that person gets a meeting code
  const [visitHost, setVisitHost] = useState(draft?.visitHost ?? "");
  const [direction, setDirection] = useState<Direction | null>(draft?.direction ?? startDirection);
  // "Out only" / "In only": nothing more will be recorded on this record
  const [oneWay, setOneWay] = useState(draft?.oneWay ?? false);
  // Bumped when a picked person fills other boxes, so dropdowns show the new value
  const [fillNo, setFillNo] = useState(0);
  // What each box got from the last picked person (so a new pick can replace it)
  const autoFilled = useRef<Record<string, string>>({});
  const fillTargets = new Set(def.fields.flatMap((f) => (f.fills ? Object.values(f.fills) : [])) as string[]);
  // Picked lists (Siros coolies) start empty; typed lists start with one blank row
  const emptyRows = () => Object.fromEntries((def.groups ?? []).map((g) => [g.key, g.picker ? [] : [emptyRow(g)]])) as Record<string, Values[]>;
  const [values, setValues] = useState<Values>(draft?.values ?? {});
  const [rows, setRows] = useState<Record<string, Values[]>>(() => draft?.rows ?? emptyRows());
  const [localError, setLocalError] = useState<string | null>(null);
  // Boxes not filled / not valid on the last Save (red, with a message); cleared when changed
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const errorFor = (key: string): string | null => {
    const msg = fieldErrors[key];
    if (!msg) return null;
    // "Not filled" messages go away once it is filled; others (e.g. a wrong phone number) when the box is changed
    if (msg !== t("Fill this in") && msg !== t("Fill at least one of these") && msg !== t("Choose In or Out")) return msg;
    if (key === "__direction") return direction ? null : msg;
    if (key.startsWith("__group.")) return (rows[key.slice(8)] ?? []).length > 0 ? null : msg;
    const parts = key.split(".");
    if (parts.length === 3) return String(rows[parts[0]]?.[Number(parts[1])]?.[parts[2]] ?? "").trim() ? null : msg;
    const anyOf = (def.requiredAny ?? []).find((g) => g.includes(key));
    if (anyOf) return anyOf.some((k) => filledIn(values[k])) ? null : msg;
    return filledIn(values[key]) || !isFieldRequired(def, key, values) ? null : msg;
  };
  const clearFieldError = (key: string) =>
    setFieldErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  // "Your unsaved details were kept." while showing a brought-back draft
  const [restored, setRestored] = useState(() => !!draft && hasTyped(draft.values, draft.rows, draft.visitHost));
  // Bumped by "Clear form" so pickers and photo boxes start empty too
  const [clearNo, setClearNo] = useState(0);
  const typedSomething = hasTyped(values, rows, visitHost);
  // "More details": closed until something inside it is filled (brought-back draft, voice)
  const [moreOpen, setMoreOpen] = useState(() =>
    !!draft && splitFields(def, draft.direction ?? startDirection).more.some((f) => filledIn(draft.values[f.key]))
  );

  // Keep the typed details for this tab (removed once nothing is typed)
  useEffect(() => {
    try {
      if (hasTyped(values, rows, visitHost)) {
        sessionStorage.setItem(DRAFT_PREFIX + def.key, JSON.stringify({ values, rows, direction, oneWay, visitHost, at: Date.now() }));
      } else {
        sessionStorage.removeItem(DRAFT_PREFIX + def.key);
      }
    } catch {}
  }, [def.key, values, rows, direction, oneWay, visitHost]);

  // ── Voice filling ──────────────────────────────────────────
  // What voice put in each box: a box is only (re)filled by voice while it is
  // empty or still holds voice's value — never over what the guard typed.
  const latestForm = useRef({ values, rows, direction });
  useEffect(() => {
    latestForm.current = { values, rows, direction };
  });
  const voiceSet = useRef<Record<string, string>>({});
  const voiceRows = useRef<Record<string, string>>({});
  const voiceDir = useRef<Direction | null>(null);
  const beforeVoice = useRef<{ values: Values; rows: Record<string, Values[]>; direction: Direction | null } | null>(null);
  const [voiceKeys, setVoiceKeys] = useState<string[]>([]);
  // Re-mounts boxes voice changed (pickers keep their own copy of the value)
  const [voiceVer, setVoiceVer] = useState<Record<string, number>>({});
  // Bill photo read (stock registers): "reading" while Gemini looks at it, then a short result line
  const [billRead, setBillRead] = useState<{ path: string; state: "reading" | "done" | "error"; message?: string } | null>(null);
  const billPath = def.readsBill ? String(values[def.readsBill] ?? "") : "";
  useEffect(() => {
    if (!billPath || billRead?.path === billPath) return;
    let alive = true;
    const start = window.setTimeout(() => {
      setBillRead({ path: billPath, state: "reading" });
      // Through the gate route (not a server action from an effect); Gemini may take up to ~36 s
      (callGate("readBillPhoto", [billPath], 45_000) as ReturnType<typeof readBillPhoto>)
        .then((res) => {
          if (!alive) return;
          if ("error" in res) return setBillRead({ path: billPath, state: "error", message: t(res.error) });
          const filled: string[] = [];
          setValues((v) => {
            const next = { ...v };
            for (const [k, val] of Object.entries(res.details)) {
              // Only boxes on this form that are still empty: never over what the guard typed
              if (!def.fields.some((f) => f.key === k) || filledIn(next[k])) continue;
              next[k] = String(val);
              filled.push(k);
            }
            return next;
          });
          // Marked "Check" like voice filling, and the boxes show the new value
          setVoiceKeys((ks) => [...new Set([...ks, ...filled])]);
          setVoiceVer((vv) => Object.fromEntries([...Object.entries(vv), ...filled.map((k) => [k, (vv[k] ?? 0) + 1])]));
          setBillRead({ path: billPath, state: "done", message: filled.length ? t("Filled from the bill — check each one.") : t("Nothing new found on the bill.") });
        })
        .catch(() => alive && setBillRead({ path: billPath, state: "error", message: t("Could not read the bill. Type the details.") }));
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(start);
    };
    // Read once per photo; values / def are read inside on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billPath]);
  const [voiceGroups, setVoiceGroups] = useState<string[]>([]);
  const [rowsVer, setRowsVer] = useState(0);

  const applyVoice = (fill: VoiceFill) => {
    const cur = latestForm.current;
    if (!beforeVoice.current) beforeVoice.current = { ...cur };
    const next = { ...cur.values };
    const changed: string[] = [];
    for (const [k, v] of Object.entries(fill.fields ?? {})) {
      const now = String(cur.values[k] ?? "");
      if ((now !== "" && now !== voiceSet.current[k]) || now === v) continue;
      next[k] = v;
      voiceSet.current[k] = v;
      changed.push(k);
    }
    if (changed.length) {
      latestForm.current = { ...latestForm.current, values: next };
      setValues(next);
      setVoiceKeys((ks) => [...new Set([...ks, ...changed])]);
      if (changed.some((k) => splitFields(def, latestForm.current.direction).more.some((f) => f.key === k))) setMoreOpen(true);
      setVoiceVer((vv) => Object.fromEntries([...Object.entries(vv), ...changed.map((k) => [k, (vv[k] ?? 0) + 1])]));
    }
    // Lists (e.g. coolies): filled while the guard has not edited them; afterwards only extra items are added
    const nextRows = { ...latestForm.current.rows };
    const changedGroups: string[] = [];
    for (const g of def.groups ?? []) {
      const spoken = fill.groups?.[g.key];
      if (!spoken?.length) continue;
      const have = nextRows[g.key] ?? [];
      const blank = have.every((r) => Object.values(r).every((v) => String(v ?? "").trim() === ""));
      const untouched = blank || JSON.stringify(have) === voiceRows.current[g.key];
      let list = untouched
        ? spoken.map((r) => ({ ...emptyRow(g), ...r }))
        : spoken.length > have.length
        ? [...have, ...spoken.slice(have.length).map((r) => ({ ...emptyRow(g), ...r }))]
        : null;
      if (!list) continue;
      if (g.max !== null) list = list.slice(0, g.max);
      if (JSON.stringify(list) === JSON.stringify(have)) continue;
      nextRows[g.key] = list;
      voiceRows.current[g.key] = JSON.stringify(list);
      changedGroups.push(g.key);
    }
    if (changedGroups.length) {
      latestForm.current = { ...latestForm.current, rows: nextRows };
      setRows(nextRows);
      setVoiceGroups((gs) => [...new Set([...gs, ...changedGroups])]);
      setRowsVer((n) => n + 1);
    }
    // In / Out, unless the guard already chose
    const dirNow = latestForm.current.direction;
    if (fill.direction && m && (dirNow === null || dirNow === voiceDir.current) && dirNow !== fill.direction) {
      voiceDir.current = fill.direction;
      latestForm.current = { ...latestForm.current, direction: fill.direction };
      setDirection(fill.direction);
      setLocalError(null);
    }
  };
  const voice = useVoiceFill({ form: def.key, onFill: applyVoice });
  const undoVoice = () => {
    const b = beforeVoice.current;
    if (b) {
      setValues(b.values);
      setRows(b.rows);
      setDirection(b.direction);
    }
    setVoiceVer((vv) => Object.fromEntries([...Object.entries(vv), ...voiceKeys.map((k) => [k, (vv[k] ?? 0) + 1])]));
    setRowsVer((n) => n + 1);
    voiceSet.current = {};
    voiceRows.current = {};
    voiceDir.current = null;
    beforeVoice.current = null;
    setVoiceKeys([]);
    setVoiceGroups([]);
    voice.reset();
  };
  const voiceDone = voice.status === "done";

  const clearAll = () => {
    setFieldErrors({});
    setValues({});
    setRows(emptyRows());
    setDirection(startDirection);
    setOneWay(false);
    setVisitHost("");
    setLocalError(null);
    autoFilled.current = {};
    voiceSet.current = {};
    voiceRows.current = {};
    voiceDir.current = null;
    beforeVoice.current = null;
    setVoiceKeys([]);
    setVoiceGroups([]);
    voice.reset();
    setClearNo((n) => n + 1);
    setRestored(false);
    clearRegisterDraft(def.key);
  };

  const side = m && direction ? (direction === "IN" ? m.in : m.out) : null;
  const { primary, more } = splitFields(def, direction, values);
  const showMore = moreOpen && more.length > 0;

  const renderField = (f: FieldDef) => (
    <FieldBlock
      key={f.key}
      f={f}
      id={`rf-${f.key}`}
      required={isFieldRequired(def, f.key, values) || (!!f.showWhen && !!f.requiredWhenShown)}
      voice={voiceKeys.includes(f.key)}
      highlight={!!def.highlightRequired}
      missing={voiceDone && isFieldRequired(def, f.key, values) && String(values[f.key] ?? "").trim() === ""}
      error={errorFor(f.key)}
    >
      <FieldInput
        key={`${f.key}-${clearNo}-${fillTargets.has(f.key) ? fillNo : 0}-${voiceVer[f.key] ?? 0}`}
        registerKey={def.key}
        dimmed={f.type === "photo" && !!def.requiredUnless && def.requiredUnless.fields.includes(f.key) && values[def.requiredUnless.flag] === "yes"}
        f={f}
        id={`rf-${f.key}`}
        value={values[f.key] ?? ""}
        combo={comboFor(f)}
        onChange={(v) => {
          setValues((s) => ({ ...s, [f.key]: v }));
          clearFieldError(f.key);
          // The guard checked / changed it: no longer marked as voice
          if (voiceKeys.includes(f.key)) setVoiceKeys((ks) => ks.filter((k) => k !== f.key));
        }}
        staff={staff}
        required={isFieldRequired(def, f.key, values)}
        onPickPerson={
          f.fills
            ? (p) => {
                // Fill their designation / department. A box keeps what the guard
                // typed; one filled by an earlier pick follows the new person.
                const filled: Values = {};
                const pairs: [string | undefined, string | null][] = [
                  [f.fills?.designation, p.designation],
                  [f.fills?.department, p.department],
                ];
                for (const [target, val] of pairs) {
                  if (!target) continue;
                  const cur = String(values[target] ?? "").trim();
                  if (cur && cur !== autoFilled.current[target]) continue;
                  filled[target] = val ?? "";
                  autoFilled.current[target] = val ?? "";
                }
                setValues((s) => ({ ...s, ...filled }));
                setFillNo((n) => n + 1);
              }
            : undefined
        }
      />
      {f.combo === "sirosContractor" && contractorNo(values[f.key]) !== null && (
        <button
          type="button"
          onClick={() => setSirosView(contractorNo(values[f.key]))}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-950"
        >
          <Info className="h-4 w-4" aria-hidden="true" /> {t("No.")} {contractorNo(values[f.key])} · {t("View details")}
        </button>
      )}
    </FieldBlock>
  );

  // Consecutive photo fields share one row of square tiles; the "No bill" toggle sits under the bill tile
  const renderGrid = (list: FieldDef[]) => {
    const flagKey = def.requiredUnless?.flag;
    const out: React.ReactNode[] = [];
    let i = 0;
    while (i < list.length) {
      const opens = def.fields.filter((x) => x.showWhen === list[i].key);
      if (opens.length > 0) {
        const toggle = list[i++];
        // The boxes it opened come right after it in the list: drawn inside the panel
        const inside: FieldDef[] = [];
        while (i < list.length && list[i].showWhen === toggle.key) inside.push(list[i++]);
        const on = values[toggle.key] === "yes";
        out.push(
          <div
            key={`group-${toggle.key}`}
            className={cn("col-span-full space-y-4", on && "rounded-2xl border-[1.5px] border-orange-500/35 bg-orange-500/5 p-3 sm:p-4")}
          >
            {renderField(toggle)}
            {inside.length > 0 && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{inside.map((x) => renderField(x))}</div>}
          </div>
        );
        continue;
      }
      if (list[i].type !== "photo") {
        out.push(renderField(list[i]));
        i++;
        continue;
      }
      const run: { p: FieldDef; extra: FieldDef | null }[] = [];
      while (i < list.length && list[i].type === "photo") {
        const p = list[i++];
        let extra: FieldDef | null = null;
        if (flagKey && list[i]?.key === flagKey) extra = list[i++];
        run.push({ p, extra });
      }
      // The "No bill" toggle: one full-width line under the photo tiles
      const flag = run.find((r) => r.extra)?.extra ?? null;
      const flagOn = flag ? values[flag.key] === "yes" : false;
      out.push(
        <div key={`photos-${run[0].p.key}`} className="col-span-full space-y-2">
          {/* One photo: a full-width tile; two or more: square tiles side by side */}
          <div
            className={
              run.length === 1
                ? "grid grid-cols-1 [&_.photo-tile]:aspect-auto [&_.photo-tile]:h-36 [&_.photo-tile]:max-w-none"
                : "grid grid-cols-2 items-start gap-3"
            }
          >
            {run.map(({ p }) => (
              <div key={p.key} className="min-w-0">
                {renderField(p)}
              </div>
            ))}
          </div>
          {flag && (
            <button
              type="button"
              aria-pressed={flagOn}
              onClick={() => setValues((s) => ({ ...s, [flag.key]: s[flag.key] === "yes" ? "" : "yes" }))}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 px-4 text-base font-semibold transition-colors ${
                flagOn
                  ? "border-orange-600 bg-orange-600 text-white"
                  : "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-orange-500/60"
              }`}
            >
              {flagOn ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              ) : (
                <FileX className="h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" />
              )}
              <span className="whitespace-nowrap">{t(flag.label)}</span>
            </button>
          )}
          {flag && flagOn && (
            <p className="text-center text-xs font-medium text-orange-600">{t("Bill photo and bill amount are not needed.")}</p>
          )}
        </div>
      );
    }
    return out;
  };

  return (
    <form
      autoComplete="off"
      ref={formRef}
      data-look="clear"
      // The form checks the boxes itself: a problem box turns red with a message, and the form scrolls to it
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (m && !direction) errs.__direction = t("Choose In or Out");
        const shown = visibleFields(def, direction, values);
        for (const f of shown) {
          const v = values[f.key];
          if (f.type === "yesno" && !f.buttons) continue;
          if ((isFieldRequired(def, f.key, values) || (f.showWhen && f.requiredWhenShown)) && !filledIn(v)) errs[f.key] = t("Fill this in");
          else if (f.type === "phone" && filledIn(v) && !/^\+?[0-9]{10,15}$/.test(String(v).replace(/[\s-]/g, ""))) {
            errs[f.key] = t("Enter a valid phone number (10–15 digits)");
          }
        }
        for (const keys of def.requiredAny ?? []) {
          if (keys.every((k) => !filledIn(values[k]))) for (const k of keys) errs[k] ??= t("Fill at least one of these");
        }
        // Typed worker rows: a started row needs its required boxes
        const rowKeys: string[] = [];
        for (const g of def.groups ?? []) {
          if (g.minRows && (rows[g.key] ?? []).length < g.minRows) {
            errs[`__group.${g.key}`] = t("Add at least one {item}", { item: t(g.itemLabel).toLowerCase() });
            rowKeys.push(`__group.${g.key}`);
          }
          if (g.picker === "sirosCoolie") continue;
          (rows[g.key] ?? []).forEach((row, i) => {
            const started = g.fields.some((f) => f.type !== "time" && String(row[f.key] ?? "").trim() !== "");
            for (const f of g.fields) {
              if (f.type === "time") continue;
              const k = `${g.key}.${i}.${f.key}`;
              rowKeys.push(k);
              if (started && g.required?.includes(f.key) && !String(row[f.key] ?? "").trim()) errs[k] = t("Fill this in");
            }
          });
        }
        const topRows = rowKeys.filter((k) => (def.groups ?? []).some((g) => g.picker === "typedRows" && (k === `__group.${g.key}` || k.startsWith(`${g.key}.`))));
        const order = ["__direction", ...topRows, ...primary.map((f) => f.key), ...more.map((f) => f.key), ...rowKeys.filter((k) => !topRows.includes(k))];
        const first = order.find((k) => errs[k]);
        if (first) {
          setFieldErrors(errs);
          setLocalError(t("Fill in the boxes marked in red"));
          // A problem under "More details": open it first
          if (more.some((f) => errs[f.key])) setMoreOpen(true);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const box = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
              box?.scrollIntoView({ block: "center", behavior: "smooth" });
              box?.querySelector<HTMLElement>('input:not([type="file"]):not([role="combobox"]), textarea')?.focus({ preventScroll: true });
            })
          );
          return;
        }
        setFieldErrors({});
        setLocalError(null);
        // The next fresh form here starts on this side too
        if (m && m.firstDirections.length > 1) rememberDirection(def.key, direction);
        onSubmit({
          fields: values,
          groups: rows,
          direction: direction ?? undefined,
          oneWay: !!m && !m.single && !m.noOneWay && oneWay,
          ...(def.visitHost && visitHost ? { visitHost } : {}),
        });
      }}
      className="space-y-5"
    >
      {/* One small line: date and time, and the mic (speak everything once; the form fills itself) */}
      <div className="flex min-h-10 flex-nowrap items-center justify-between gap-2">
        <div className="min-w-0 truncate">
          <CompactDateTime />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {typedSomething && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-red-500/50 bg-transparent px-3 text-xs font-semibold leading-normal text-red-600 transition-[background-color,transform] hover:bg-red-500/10 active:scale-[0.97]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Clear")}
            </button>
          )}
          {voice.status === "idle" && (
            <button
              type="button"
              onClick={() => void voice.start()}
              aria-label={t("Speak the details")}
              title={t("Speak the details")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_6px_14px_-8px_rgba(207,62,37,0.7)] transition-[background-color,transform] hover:bg-orange-700 active:scale-95"
            >
              <Mic className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>
      {voice.status !== "idle" && <VoicePanel voice={voice} onUndo={undoVoice} />}

      {restored && (
        <p className="-mt-3 flex min-w-0 items-center gap-1.5 text-xs font-medium text-emerald-600">
          <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t("Your unsaved details were kept.")}
        </p>
      )}

      {/* "* must fill" note */}
      {def.required.length > 0 && (
        <p className="text-sm text-zinc-500 md:text-base">
          <span className="font-bold text-orange-500">*</span> {t("Boxes with * must be filled; the rest are optional.")}
        </p>
      )}
      {m && !m.fixedStart && (
        <div data-field="__direction" className="scroll-mt-24 space-y-1.5">
          <DirectionPicker compact def={def} value={direction} onChange={(d) => { setDirection(d); setLocalError(null); clearFieldError("__direction"); }} />
          {errorFor("__direction") && (
            <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {errorFor("__direction")}
            </p>
          )}
        </div>
      )}

      {m && !m.single && !m.fixedStart && !m.noOneWay && side && (
        <fieldset>
          <legend className="sr-only">{t("Record type")}</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-0.5">
            {[
              { value: false, label: t("{side} now, {other} later", { side: side.label, other: (direction === "IN" ? m.out : m.in).label }) },
              { value: true, label: t("{side} only", { side: side.label }) },
            ].map((o) => (
              <button
                key={String(o.value)}
                type="button"
                aria-pressed={oneWay === o.value}
                onClick={() => setOneWay(o.value)}
                className={`min-h-9 rounded-lg px-2 py-1.5 text-xs font-medium leading-tight transition-colors ${
                  oneWay === o.value ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* Notes: one full-width line */}
      {def.fixed?.filter((x) => x.note).map((x) => (
        <p key={x.label} className="flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{x.label}:</span> {x.value}
          </span>
        </p>
      ))}
      {def.fixed?.some((x) => !x.note) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          {def.fixed.filter((x) => !x.note).map((x) => (
            <div key={x.label}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{x.label}</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-200">{x.value}</p>
            </div>
          ))}
        </div>
      )}

      {def.visitHost && direction !== "OUT" && (
        <div className="space-y-1.5">
          <label htmlFor="rf-visit-host" className="field-label flex items-center gap-1.5 text-sm font-medium text-zinc-200">
            <KeyRound className="h-4 w-4 text-orange-500" aria-hidden="true" /> {t("Meeting (faculty / staff)")}
          </label>
          <HostPicker id="rf-visit-host" value={visitHost} onChange={setVisitHost} />
          <p className="text-xs text-zinc-500">
            {visitHost
              ? t("They get a meeting code; the visitor needs it from them to go out.")
              : t("Optional. Leave it empty if they came to meet a student or for other work — then no code is needed.")}
          </p>
        </div>
      )}

      {sirosBook && <SirosPersonDialog no={sirosView} onClose={() => setSirosView(null)} />}
      {/* Siros: register a first-timer (top of the form) */}
      {sirosBook && (
        <SirosNewPeople
          renderPhoto={(v, onPhoto) => <PhotoInput id="rf-siros-new-photo" value={v} onChange={onPhoto} registerKey={def.key} label={t("Photo")} required />}
          onRegistered={(p) =>
            p.kind === "CONTRACTOR"
              ? setValues((v) => ({ ...v, contractorName: p.name, ...(p.phone ? { phone: p.phone } : {}) }))
              : setRows((st) => ({
                  ...st,
                  workers: [...(st.workers ?? []).filter((x) => String(x.name ?? "").trim() !== ""), { no: String(p.no), name: p.name, gender: p.gender ?? "" }],
                }))
          }
        />
      )}

      {billRead && def.readsBill && billRead.path === billPath && (
        <p
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold",
            billRead.state === "reading" ? "bg-zinc-950 text-zinc-300" : billRead.state === "done" ? "bg-amber-500/10 text-amber-700" : "bg-red-500/10 text-red-600"
          )}
        >
          {billRead.state === "reading" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {billRead.state === "reading" ? t("Reading the bill…") : billRead.message}
        </p>
      )}
      {/* College Daily Labour: the workers first */}
      {(def.groups ?? [])
        .filter((g) => g.picker === "typedRows")
        .map((g) => (
          <TypedRows
            key={g.key}
            group={g}
            rows={rows[g.key] ?? []}
            onChange={(list) => setRows((st) => ({ ...st, [g.key]: list }))}
            errorFor={errorFor}
          />
        ))}
      {primary.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{renderGrid(primary)}</div>}

      {more.length > 0 && (
        <div className="space-y-4">
          {/* A full-width button with the number of extra fields */}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={showMore}
            className="flex h-14 w-full items-center gap-3 rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-900 px-4 text-base font-semibold text-zinc-100 transition-colors hover:bg-zinc-950"
          >
            <PlusCircle className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${showMore ? "rotate-45" : ""}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-left">
              {showMore ? t("Fewer details") : t("More details")} <span className="font-normal text-zinc-500 tabular-nums">({more.length})</span>
            </span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${showMore ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {showMore && (
            // White panel with a border: the grey boxes stand out, and it reads as part of "More details"
            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-3 sm:grid-cols-2 sm:p-4">{renderGrid(more)}</div>
          )}
        </div>
      )}

      {(def.groups ?? []).map((g) => {
        if (g.picker === "sirosCoolie") {
          return <CooliePicker key={g.key} rows={rows[g.key] ?? []} onChange={(list) => setRows((st) => ({ ...st, [g.key]: list }))} people={sirosPeople} />;
        }
        // Drawn at the top of the form instead
        if (g.picker === "typedRows") return null;
        if (g.picker === "itemsPopup") {
          return (
            <ItemsPopup
              key={g.key}
              group={g}
              rows={rows[g.key] ?? []}
              onChange={(list) => setRows((st) => ({ ...st, [g.key]: list }))}
              error={errorFor(`__group.${g.key}`)}
            />
          );
        }
        const list = rows[g.key] ?? [];
        const atMax = g.max !== null && list.length >= g.max;
        const typed = g.fields.filter((f) => f.type !== "time");
        // A row's required details apply once anything in that row is filled
        const rowStarted = (row: Values) => typed.some((f) => String(row[f.key] ?? "").trim() !== "");
        return (
          <fieldset
            key={g.key}
            className={`space-y-3 rounded-2xl border p-3 sm:p-4 ${voiceGroups.includes(g.key) ? "border-amber-400/60 ring-2 ring-amber-400/30" : "border-zinc-800"}`}
          >
            <legend className="px-1.5 text-sm font-medium text-zinc-100">
              {g.label} <span className="text-xs font-normal text-zinc-500 tabular-nums">({list.length}{g.max !== null ? ` / ${g.max}` : ""})</span>
            </legend>
            {voiceGroups.includes(g.key) && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <Mic className="h-3.5 w-3.5" aria-hidden="true" /> {t("Filled from your voice — check each one.")}
              </p>
            )}
            {g.fields.some((f) => f.type === "time") && (
              <p className="text-xs text-zinc-500">{t("In-time is recorded now; out-times are marked later from the record.")}</p>
            )}
            {list.map((row, i) => (
              <div key={`${rowsVer}-${clearNo}-${i}`} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 space-y-3">
                <div className="flex min-h-10 items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-300">{g.itemLabel} {i + 1}</p>
                  {list.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((s) => ({ ...s, [g.key]: s[g.key].filter((_, idx) => idx !== i) }))}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      aria-label={t("Remove {item}", { item: `${g.itemLabel} ${i + 1}` })}
                    >
                      <Trash2 className="h-[18px] w-[18px]" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {typed.map((f) => (
                    <FieldBlock
                      key={f.key}
                      f={f}
                      id={`rf-${g.key}-${i}-${f.key}`}
                      required={!!g.required?.includes(f.key)}
                      fieldKey={`${g.key}.${i}.${f.key}`}
                      error={errorFor(`${g.key}.${i}.${f.key}`)}
                    >
                      <FieldInput
                        registerKey={def.key}
                        required={!!g.required?.includes(f.key) && rowStarted(row)}
                        f={f}
                        id={`rf-${g.key}-${i}-${f.key}`}
                        value={row[f.key] ?? ""}
                        onChange={(v) => setRows((s) => ({ ...s, [g.key]: s[g.key].map((r, idx) => (idx === i ? { ...r, [f.key]: v } : r)) }))}
                        staff={staff}
                      />
                    </FieldBlock>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={atMax}
              onClick={() => setRows((s) => ({ ...s, [g.key]: [...(s[g.key] ?? []), emptyRow(g)] }))}
              className="inline-flex w-full sm:w-auto h-12 sm:h-10 items-center justify-center gap-2 rounded-full border border-dashed border-zinc-700 px-5 text-sm font-medium text-zinc-200 transition-colors hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-400 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Plus className="h-4 w-4" /> {t("Add {item}", { item: g.itemLabel.toLowerCase() })}
            </button>
          </fieldset>
        );
      })}

      <div className={stickyFooterCls}>
        {localError && (
          <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400">
            {localError}
          </p>
        )}
        <button type="submit" data-big-btn="" disabled={busy} className={`${saveBtnCls} bg-orange-600 hover:bg-orange-700 shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)]`}>
          {!busy && <Save className="h-5 w-5 sm:h-4 sm:w-4" />}
          {busy ? t("Saving…") : side ? t("Save — {side} now", { side: side.label }) : t("Save record")}
        </button>
        <p className="text-[11px] text-zinc-500 text-center">{t("Saved records are permanent and cannot be edited.")}</p>
      </div>
    </form>
  );
}

/**
 * Records what is still open on a saved record: the other side of In / Out
 * (time = now, plus its reading) and/or workers leaving now.
 */
export function MovementForm({
  def,
  current,
  visit = null,
  canOverrideVisit = false,
  busy,
  onSubmit,
}: {
  def: EntryRegister;
  current: Record<string, any>;
  /** Came to meet a faculty / staff member: going out needs the meeting code */
  visit?: { hostName: string; open: boolean; locked: boolean } | null;
  canOverrideVisit?: boolean;
  busy: boolean;
  onSubmit: (payload: { markMovement: boolean; reading?: string; groupMarks: Record<string, number[]>; exitCounts?: Record<string, number> } & VisitExitInput) => void;
}) {
  const t = useT();
  const pending = pendingActions(def, current);
  const [mark, setMark] = useState<boolean>(!!pending.next);
  const [reading, setReading] = useState("");
  const [marks, setMarks] = useState<Record<string, number[]>>({});
  // Out with counts by type (College Daily Labour): each starts at the number that came in
  const countsGroup = def.movement?.exitCounts;
  const countsIn = (() => {
    const m: Record<string, number> = {};
    const list = countsGroup && Array.isArray(current[countsGroup]) ? (current[countsGroup] as Record<string, unknown>[]) : [];
    for (const r of list) {
      const type = String(r.workerType ?? "");
      if (type) m[type] = (m[type] ?? 0) + (Number(r.count) || 0);
    }
    return m;
  })();
  const [exitCounts, setExitCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(countsIn).map(([k, v]) => [k, String(v)]))
  );
  const [visitInput, setVisitInput] = useState<VisitExitInput>({ visitCode: "" });

  if (!pending.any)
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {t("Everything for this record has already been recorded.")}
      </p>
    );
  const next = pending.next;
  const needsCode = !!visit?.open && mark && next?.direction === "OUT";

  return (
    <form
      autoComplete="off"
      data-look="clear"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          markMovement: mark && !!next,
          reading,
          groupMarks: marks,
          ...(needsCode ? visitInput : {}),
          ...(countsGroup && next?.direction === "OUT" ? { exitCounts: Object.fromEntries(Object.entries(exitCounts).map(([k, v]) => [k, Number(v) || 0])) } : {}),
        });
      }}
      className="space-y-4"
    >
      <LiveDateTime />
      {next && (
        <div className="space-y-3">
          <label
            className={`flex min-h-[64px] cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 text-base font-semibold transition-colors ${
              mark
                ? next.direction === "OUT"
                  ? "border-sky-500 bg-sky-500/10 text-sky-400"
                  : "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                : "border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-950"
            }`}
          >
            <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} className="accent-emerald-500 h-5 w-5 shrink-0" />
            {next.direction === "OUT" ? <LogOut className="h-5 w-5 shrink-0" /> : <LogIn className="h-5 w-5 shrink-0" />}
            <span className="min-w-0">{t("Record {side} now", { side: next.label })}</span>
          </label>
          {next.readingKey && mark && (
            <div className="space-y-1.5">
              <label htmlFor="mv-reading" className="field-label block text-sm font-medium text-zinc-200">
                {def.fields.find((f) => f.key === next.readingKey)?.label ?? t("Reading")}
              </label>
              <input id="mv-reading" type="text" autoComplete="off" maxLength={100} value={reading} onChange={(e) => setReading(e.target.value)} className={inputCls} />
            </div>
          )}
          {countsGroup && next.direction === "OUT" && mark && Object.keys(countsIn).length > 0 && (
            // How many of each are leaving (everyone at once)
            <div className="space-y-2 rounded-2xl border-[1.5px] border-zinc-700 p-3 sm:p-4">
              <p className="field-label text-sm font-medium text-zinc-200">{t("How many are leaving?")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {Object.entries(countsIn).map(([type, came]) => (
                  <label key={type} className="block space-y-1.5">
                    <span className="flex items-baseline justify-between gap-2 text-sm font-semibold text-zinc-200">
                      {t(type)} <span className="text-xs font-normal text-zinc-500 tabular-nums">{t("came in: {n}", { n: came })}</span>
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={exitCounts[type] ?? ""}
                      onChange={(e) => setExitCounts((s) => ({ ...s, [type]: e.target.value.replace(/[^0-9]/g, "") }))}
                      className={inputCls}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          {needsCode && visit && (
            <VisitCodeFields hostName={visit.hostName} canOverride={canOverrideVisit} locked={visit.locked} value={visitInput} onChange={setVisitInput} />
          )}
        </div>
      )}
      {pending.groups.map(({ group, open }) => {
        const rowsData = (current[group.key] as Record<string, any>[]) ?? [];
        const selected = marks[group.key] ?? [];
        const toggle = (i: number) =>
          setMarks((s) => ({ ...s, [group.key]: selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i] }));
        return (
          <div key={group.key} className="space-y-3 rounded-2xl border border-zinc-800 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-100">{t("Mark {group} out now", { group: group.label })}</p>
              <button
                type="button"
                onClick={() => setMarks((s) => ({ ...s, [group.key]: selected.length === open.length ? [] : open }))}
                className="inline-flex h-10 shrink-0 items-center rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-950"
              >
                {selected.length === open.length ? t("Clear") : t("Select all")}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {open.map((i) => (
                <label
                  key={i}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-sm transition-colors ${
                    selected.includes(i)
                      ? "border-emerald-500/40 bg-emerald-500/10 text-zinc-100"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                  }`}
                >
                  <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} className="accent-emerald-500 h-5 w-5 shrink-0" />
                  <span className="min-w-0 break-words">
                    {group.itemLabel} {i + 1}: {displayValue(group.fields[0], rowsData[i]?.[group.fields[0].key], t)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <div className={stickyFooterCls}>
        <button type="submit" data-big-btn="" disabled={busy || (needsCode && !visitInputReady(visitInput))} className={`${saveBtnCls} bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50`}>
          {!busy && <Save className="h-5 w-5 sm:h-4 sm:w-4" />}
          {busy ? t("Saving…") : t("Save")}
        </button>
      </div>
    </form>
  );
}

/** Close an In / Out record when the other side will never happen (e.g. "Out only"). */
export function CloseRecordForm({
  def,
  current,
  busy,
  onSubmit,
}: {
  def: EntryRegister;
  current: Values;
  busy: boolean;
  onSubmit: (payload: { close: true; note: string }) => void;
}) {
  const t = useT();
  const [note, setNote] = useState("");
  const next = pendingActions(def, current).next;
  if (!next) return <p className="text-sm text-zinc-500">{t("This record is already complete.")}</p>;
  return (
    <form
      autoComplete="off"
      data-look="clear"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ close: true, note });
      }}
      className="space-y-4"
    >
      <p className="text-sm leading-relaxed text-zinc-300">
        {t("No {side} will be recorded. The record is kept as it is and marked closed.", { side: next.label })}
      </p>
      <div className="space-y-1.5">
        <label htmlFor="close-note" className="field-label block text-sm font-medium text-zinc-200">
          {t("Note (optional)")}
        </label>
        <textarea
          id="close-note"
          value={note}
          maxLength={200}
          rows={2}
          placeholder={t("e.g. Left by another gate")}
          onChange={(e) => setNote(e.target.value)}
          className="flex min-h-[80px] w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
        />
      </div>
      <div className={stickyFooterCls}>
        <button type="submit" data-big-btn="" disabled={busy} className={`${saveBtnCls} bg-orange-600 hover:bg-orange-700`}>
          {!busy && <CheckCircle2 className="h-5 w-5 sm:h-4 sm:w-4" />}
          {busy ? t("Saving…") : t("Close record")}
        </button>
      </div>
    </form>
  );
}

/** Main Admin: correct every value of a saved record, including date and times. */
export function AdminEditForm({
  def,
  current,
  staff,
  busy,
  onSubmit,
  keepsHistory = false,
}: {
  def: EntryRegister;
  current: Record<string, any>;
  staff: StaffOption[];
  busy: boolean;
  onSubmit: (payload: { fields: Values; groups: Record<string, Values[]>; direction?: Direction }) => void;
  /** Security edit: saved as a correction (the earlier values stay in the history) */
  keepsHistory?: boolean;
}) {
  const t = useT();
  const m = def.movement;
  const toText = (f: FieldDef, v: any) =>
    v === null || v === undefined ? "" : f.type === "staff" ? v.id ?? "" : f.type === "yesno" ? (v ? "yes" : "no") : String(v);
  const [direction, setDirection] = useState<Direction | null>(current.direction === "IN" || current.direction === "OUT" ? current.direction : null);
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(def.fields.map((f) => [f.key, toText(f, current[f.key])]))
  );
  const [rows, setRows] = useState<Record<string, Values[]>>(() =>
    Object.fromEntries(
      (def.groups ?? []).map((g) => {
        const list = Array.isArray(current[g.key]) ? (current[g.key] as Values[]) : [];
        return [g.key, list.map((r) => Object.fromEntries(g.fields.map((f) => [f.key, toText(f, r[f.key])])))];
      })
    )
  );

  const input = (f: FieldDef, id: string, value: any, onChange: (v: any) => void, required: boolean) =>
    f.type === "date" ? (
      <DateField id={id} value={value} onChange={(e) => onChange(e.target.value)} required={required} className={inputCls} />
    ) : f.type === "time" ? (
      <input id={id} type="time" step={60} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    ) : (
      <FieldInput f={f} id={id} value={value} onChange={onChange} staff={staff} required={required} registerKey={def.key} />
    );

  return (
    <form
      autoComplete="off"
      data-look="clear"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ fields: values, groups: rows, direction: direction ?? undefined });
      }}
      className="space-y-5"
    >
      <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        {keepsHistory
          ? t("Your changes are saved with your name. The earlier values stay in the record history.")
          : "Saving overwrites this record. The previous values are not kept."}
      </p>
      {m && !m.single && <DirectionPicker def={{ ...def, movement: { ...m, firstDirections: ["IN", "OUT"] } }} value={direction} onChange={setDirection} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {def.fields
          .filter((f) => f.key !== m?.directionField)
          .map((f) => (
            <FieldBlock key={f.key} f={f} id={`ae-${f.key}`} required={def.required.includes(f.key)}>
              {input(f, `ae-${f.key}`, values[f.key] ?? "", (v) => setValues((s) => ({ ...s, [f.key]: v })), def.required.includes(f.key))}
            </FieldBlock>
          ))}
      </div>
      {(def.groups ?? []).map((g) => {
        const list = rows[g.key] ?? [];
        const atMax = g.max !== null && list.length >= g.max;
        return (
          <fieldset key={g.key} className="space-y-3 rounded-2xl border border-zinc-800 p-3 sm:p-4">
            <legend className="px-1.5 text-sm font-medium text-zinc-100">
              {g.label} <span className="text-xs font-normal text-zinc-500 tabular-nums">({list.length})</span>
            </legend>
            {list.map((row, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 space-y-3">
                <div className="flex min-h-10 items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-300">{g.itemLabel} {i + 1}</p>
                  <button
                    type="button"
                    onClick={() => setRows((s) => ({ ...s, [g.key]: s[g.key].filter((_, idx) => idx !== i) }))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    aria-label={`Remove ${g.itemLabel.toLowerCase()} ${i + 1}`}
                  >
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {g.fields.map((f) => (
                    <FieldBlock key={f.key} f={f} id={`ae-${g.key}-${i}-${f.key}`} required={!!g.required?.includes(f.key)}>
                      {input(
                        f,
                        `ae-${g.key}-${i}-${f.key}`,
                        row[f.key] ?? "",
                        (v) => setRows((s) => ({ ...s, [g.key]: s[g.key].map((r, idx) => (idx === i ? { ...r, [f.key]: v } : r)) })),
                        !!g.required?.includes(f.key)
                      )}
                    </FieldBlock>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={atMax}
              onClick={() =>
                setRows((s) => ({ ...s, [g.key]: [...(s[g.key] ?? []), Object.fromEntries(g.fields.map((f) => [f.key, ""]))] }))
              }
              className="inline-flex w-full sm:w-auto h-12 sm:h-10 items-center justify-center gap-2 rounded-full border border-dashed border-zinc-700 px-5 text-sm font-medium text-zinc-200 transition-colors hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-400 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Plus className="h-4 w-4" /> Add {g.itemLabel.toLowerCase()}
            </button>
          </fieldset>
        );
      })}
      <div className={stickyFooterCls}>
        <button type="submit" data-big-btn="" disabled={busy} className={`${saveBtnCls} bg-orange-600 hover:bg-orange-700 shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)]`}>
          {!busy && <Save className="h-5 w-5 sm:h-4 sm:w-4" />}
          {busy ? t("Saving…") : t("Save changes")}
        </button>
      </div>
    </form>
  );
}

/**
 * Workers by type (College Daily Labour) as counters: every type (Peddamestri,
 * Chinnamestri, Cooli) is always listed with − / + and its count (the number can
 * also be typed). A name box shows under a type once its count is above 0.
 * Stored as one row per type that has workers; the total is counted automatically.
 */
function TypedRows({
  group,
  rows,
  onChange,
  errorFor,
}: {
  group: GroupDef;
  rows: Values[];
  onChange: (rows: Values[]) => void;
  errorFor: (key: string) => string | null;
}) {
  const t = useT();
  const types = group.fields.find((f) => f.type === "select")?.options ?? [];
  const total = rows.reduce((n, r) => n + (Number(r.count) > 0 ? Number(r.count) : 0), 0);
  const listError = errorFor(`__group.${group.key}`);
  const rowOf = (type: string) => rows.findIndex((r) => r.workerType === type);
  // Set a type's count: 0 removes its row; a new count adds one (rows kept in the types' order)
  const setCount = (type: string, count: string) => {
    const n = count === "" ? "" : String(Math.min(999, Math.max(0, Number(count) || 0)));
    const i = rowOf(type);
    if (n === "0") return onChange(rows.filter((r) => r.workerType !== type));
    if (i >= 0) return onChange(rows.map((r, idx) => (idx === i ? { ...r, count: n } : r)));
    const next = [...rows, { workerType: type, name: "", count: n }];
    onChange(types.flatMap((ty) => next.filter((r) => r.workerType === ty)));
  };
  const setName = (type: string, name: string) => onChange(rows.map((r) => (r.workerType === type ? { ...r, name } : r)));
  const stepBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] text-xl font-bold leading-none transition-[background-color,transform] active:scale-95 disabled:opacity-35";
  return (
    <fieldset data-field={`__group.${group.key}`} data-compact="" className="scroll-mt-24 space-y-2">
      <legend className="flex w-full items-center justify-between gap-3 pb-2">
        <span className="field-label text-sm font-medium text-zinc-200">
          {t(group.label)} <span className="text-orange-500">*</span>
        </span>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm font-bold tabular-nums text-zinc-100">
          {t("Total")}: {total}
        </span>
      </legend>
      <div className="divide-y divide-zinc-800 rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900">
        {types.map((type) => {
          const i = rowOf(type);
          const row = i >= 0 ? rows[i] : null;
          const count = row ? row.count ?? "" : "0";
          const n = Number(count) || 0;
          const countErr = i >= 0 ? errorFor(`${group.key}.${i}.count`) : null;
          return (
            <div
              key={type}
              data-field={i >= 0 ? `${group.key}.${i}.count` : undefined}
              className={`scroll-mt-24 space-y-2 px-3 py-2.5 first:rounded-t-2xl last:rounded-b-2xl sm:px-4 ${n > 0 ? "bg-emerald-500/10" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className={`min-w-0 flex-1 text-base font-semibold ${n > 0 ? "text-zinc-100" : "text-zinc-500"}`}>{t(type)}</span>
                <button
                  type="button"
                  aria-label={`${t(type)} −1`}
                  disabled={n <= 0}
                  onClick={() => setCount(type, String(n - 1))}
                  className={`${stepBtn} border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/15`}
                >
                  −
                </button>
                <input
                  aria-label={`${t(type)} — ${t("Count")}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  value={count}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setCount(type, e.target.value.replace(/[^0-9]/g, ""))}
                  className={`${inputCls} !w-16 shrink-0 px-1 text-center text-lg font-bold tabular-nums ${countErr ? "!border-red-500" : ""}`}
                />
                <button
                  type="button"
                  aria-label={`${t(type)} +1`}
                  onClick={() => setCount(type, String(n + 1))}
                  className={`${stepBtn} border-emerald-500/50 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25`}
                >
                  +
                </button>
              </div>
              {row && (
                <input
                  aria-label={`${t(type)} — ${t("Name")}`}
                  type="text"
                  maxLength={100}
                  value={row.name ?? ""}
                  placeholder={t("Name")}
                  onChange={(e) => setName(type, e.target.value)}
                  className={inputCls}
                />
              )}
              {countErr && (
                <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {countErr}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {listError && (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {listError}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Items added through a pop-up (Returnable book): the added items as a list (✕ to remove);
 * "+ Add item" opens Item details / Quantity / Remarks with "Add & next" (stays open, cleared)
 * and "Add & close".
 */
function ItemsPopup({
  group,
  rows,
  onChange,
  error,
}: {
  group: GroupDef;
  rows: Values[];
  onChange: (rows: Values[]) => void;
  error: string | null;
}) {
  const t = useT();
  const items = rows.filter((r) => String(r.description ?? "").trim() !== "");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Values>({ description: "", quantity: "", remarks: "" });
  const [missing, setMissing] = useState(false);
  const [addedNo, setAddedNo] = useState(0);
  const full = group.max !== null && items.length >= group.max;
  const add = (close: boolean) => {
    if (!String(draft.description ?? "").trim()) return setMissing(true);
    onChange([...items, { description: draft.description.trim(), quantity: draft.quantity ?? "", remarks: (draft.remarks ?? "").trim() }]);
    setDraft({ description: "", quantity: "", remarks: "" });
    setMissing(false);
    setAddedNo((n) => n + 1);
    if (close || (group.max !== null && items.length + 1 >= group.max)) setOpen(false);
  };
  const box = "flex h-12 w-full rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-950 px-4 text-base text-zinc-100 outline-none focus:border-orange-500 focus:bg-zinc-900";
  return (
    <fieldset data-field={`__group.${group.key}`} className="scroll-mt-24 space-y-2">
      <legend className="flex w-full items-center justify-between gap-3 pb-2">
        <span className="field-label text-sm font-medium text-zinc-200">
          {t(group.label)} <span className="text-orange-500">*</span>
        </span>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm font-bold tabular-nums text-zinc-100">{items.length}</span>
      </legend>
      {items.length > 0 && (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold tabular-nums text-zinc-300">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-base font-semibold text-zinc-100">{it.description}</span>
                {(it.quantity || it.remarks) && (
                  <span className="block text-sm text-zinc-500">
                    {[it.quantity ? `${t("Quantity")} ${it.quantity}` : "", it.remarks].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                aria-label={t("Remove")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-500"
              >
                <X className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      <button
        type="button"
        disabled={full}
        onClick={() => {
          setMissing(false);
          setOpen(true);
        }}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-orange-500/40 bg-orange-500/10 text-base font-semibold text-orange-600 hover:bg-orange-500/15 disabled:opacity-40"
      >
        <Plus className="h-5 w-5" /> {t("Add item")}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("Add item")} className="max-w-lg">
        <div className="space-y-4">
          {addedNo > 0 && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("{n} items added", { n: items.length })}
            </p>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-zinc-200">
              {t("Item Details")} <span className="text-orange-500">*</span>
            </span>
            <input
              key={addedNo}
              autoFocus
              value={draft.description ?? ""}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => {
                setDraft((d) => ({ ...d, description: e.target.value }));
                setMissing(false);
              }}
              className={`${box} ${missing ? "!border-red-500" : ""}`}
            />
            {missing && <span className="block text-sm font-medium text-red-600">{t("Fill this in")}</span>}
          </label>
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-zinc-200">{t("Quantity")}</span>
              <input
                value={draft.quantity ?? ""}
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
                onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value.replace(/[^0-9.]/g, "") }))}
                className={`${box} text-center`}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-zinc-200">{t("Remarks")}</span>
              <input
                value={draft.remarks ?? ""}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))}
                className={box}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => add(false)}
              className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-emerald-600 bg-emerald-500/10 text-base font-semibold text-emerald-700 hover:bg-emerald-500/15"
            >
              <Plus className="h-5 w-5" /> {t("Add & next")}
            </button>
            <button
              type="button"
              onClick={() => add(true)}
              className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-orange-600 text-base font-semibold text-white hover:bg-orange-700"
            >
              <CheckCircle2 className="h-5 w-5" /> {t("Add & close")}
            </button>
          </div>
          {addedNo > 0 && (
            <button type="button" onClick={() => setOpen(false)} className="h-11 w-full rounded-2xl text-sm font-semibold text-zinc-400 hover:bg-zinc-950">
              {t("Close")}
            </button>
          )}
        </div>
      </Modal>
    </fieldset>
  );
}

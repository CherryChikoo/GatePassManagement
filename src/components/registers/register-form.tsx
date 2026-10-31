"use client";
import { ThemedSelect } from "@/components/ui/themed-select";
import { DateField } from "@/components/ui/date-field";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useRef, useState } from "react";
import { VoicePanel, useVoiceFill } from "@/components/voice/voice-fill";
import { HostPicker } from "@/components/visits/host-picker";
import { VisitCodeFields, visitInputReady, type VisitExitInput } from "@/components/visits/visit-code";
import type { VoiceFill } from "@/lib/voice/spec";
import { CalendarDays, Camera, CheckCircle2, ChevronDown, Clock, Eraser, History, Info, KeyRound, Loader2, LogIn, LogOut, Mic, Plus, Save, Trash2, X } from "lucide-react";
import { callGate } from "@/lib/gate-call";
import { DepartmentSelect } from "@/components/ui/department-select";
import { compressPhoto } from "@/lib/images/compress-photo";
import type { Direction, EntryRegister, FieldDef, GroupDef } from "@/lib/registers/definitions";
import { pendingActions, yesNoWords } from "@/lib/registers/definitions";
import { formatDate } from "@/lib/utils";
import { displayValue } from "./localize";

export type StaffOption = { id: string; name: string; employeeId: string | null };
type Values = Record<string, any>;

/**
 * What was typed in a new record, kept for this browser tab until it is saved:
 * a mistaken Back (or closing the form) loses nothing, and reopening the form
 * brings it all back. Cleared on save (clearRegisterDraft) or with "Clear all".
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

/** The record was saved: its kept copy is no longer needed */
export function clearRegisterDraft(registerKey: string) {
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + registerKey);
  } catch {}
}

const filledIn = (v: unknown) => String(v ?? "").trim() !== "";
/** Anything typed or picked (a direction alone does not count) */
function hasTyped(values: Values, rows: Record<string, Values[]>, visitHost: string) {
  return (
    !!visitHost ||
    Object.values(values).some(filledIn) ||
    Object.values(rows).some((list) => list.some((row) => Object.values(row).some(filledIn)))
  );
}

// text-base on phones keeps iOS from zooming into the field
const inputCls =
  "flex h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 [color-scheme:light] outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 disabled:opacity-60";

export type PersonOption = { name: string; employeeId: string | null; designation: string | null; department: string | null };

// Faculty / staff list: fetched once and shared by every picker for 5 minutes
let peopleCache: { at: number; list: Promise<PersonOption[]> } | null = null;
function loadPeople(): Promise<PersonOption[]> {
  if (!peopleCache || Date.now() - peopleCache.at > 5 * 60_000) {
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
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-1 shadow-card">
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
  "inline-flex w-full h-14 sm:h-12 items-center justify-center gap-2 rounded-full text-base sm:text-sm font-semibold text-white transition-[background-color,transform] active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100";

/** Today's date and a live clock. The server records its own time when saving. */
export function LiveDateTime() {
  const tr = useT();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now
    ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" })
    : "—";
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
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

function emptyRow(g: GroupDef): Values {
  return Object.fromEntries(g.fields.filter((f) => f.type !== "time").map((f) => [f.key, ""]));
}

/** Camera photo for a register entry: compressed in the browser, uploaded at once, the stored path is the value. */
function PhotoInput({
  id,
  value,
  onChange,
  registerKey,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  registerKey: string;
}) {
  const t = useT();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          {preview ? (

            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : value ? (
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          ) : (
            <Camera className="h-7 w-7 text-zinc-600" />
          )}
        </div>
        <label
          htmlFor={id}
          className={`inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors ${
            value ? "border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-950" : "bg-orange-600 text-white hover:bg-orange-700"
          } ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {busy ? t("Uploading…") : value ? t("Retake Photo") : t("Take Photo")}
        </label>
        <input id={id} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
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
  onPickPerson,
}: {
  f: FieldDef;
  id: string;
  value: any;
  onChange: (v: any) => void;
  staff: StaffOption[];
  required?: boolean;
  registerKey?: string;
  /** "person" fields: the picked faculty / staff member (to fill designation etc.) */
  onPickPerson?: (p: PersonOption) => void;
}) {
  const t = useT();
  switch (f.type) {
    case "person":
      return <PersonInput id={id} value={value ?? ""} onChange={onChange} onPick={onPickPerson} required={required} />;
    case "department":
      return <DepartmentSelect id={id} value={value ?? ""} onChange={onChange} required={required} allowOther />;
    case "photo":
      return <PhotoInput id={id} value={value ?? ""} onChange={onChange} registerKey={registerKey} />;
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
    case "number":
      return <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value} required={required} onChange={(e) => onChange(numericOnly(e.target.value))} className={inputCls} />;
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
  children,
}: {
  f: FieldDef;
  id: string;
  required?: boolean;
  /** Filled from the guard's voice: highlighted until they check / edit it */
  voice?: boolean;
  /** Required, but not heard in what the guard said */
  missing?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className={`space-y-1.5 min-w-0 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className="field-label flex flex-wrap items-baseline gap-1 text-sm font-medium text-zinc-200">
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
      <div className={voice ? "rounded-2xl ring-2 ring-amber-400/60" : missing ? "rounded-2xl ring-2 ring-red-400/60" : undefined}>{children}</div>
      {f.hint && <p className="text-xs text-zinc-500">{f.hint}</p>}
    </div>
  );
}

function DirectionPicker({
  def,
  value,
  onChange,
}: {
  def: EntryRegister;
  value: Direction | null;
  onChange: (d: Direction) => void;
}) {
  const t = useT();
  const m = def.movement!;
  const choices = (["IN", "OUT"] as Direction[]).filter((d) => m.firstDirections.includes(d));
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
  const startDirection: Direction | null = m && m.firstDirections.length === 1 ? m.firstDirections[0] : null;
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
  const emptyRows = () => Object.fromEntries((def.groups ?? []).map((g) => [g.key, [emptyRow(g)]])) as Record<string, Values[]>;
  const [values, setValues] = useState<Values>(draft?.values ?? {});
  const [rows, setRows] = useState<Record<string, Values[]>>(() => draft?.rows ?? emptyRows());
  const [localError, setLocalError] = useState<string | null>(null);
  // "Your unsaved details were kept." while showing a brought-back draft
  const [restored, setRestored] = useState(() => !!draft && hasTyped(draft.values, draft.rows, draft.visitHost));
  // "Clear all": a second tap within a few seconds really clears (one stray tap never wipes the form)
  const [confirmClear, setConfirmClear] = useState(false);
  // Bumped by "Clear all" so pickers and photo boxes start empty too
  const [clearNo, setClearNo] = useState(0);
  const typedSomething = hasTyped(values, rows, visitHost);

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

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

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
  const [voiceGroups, setVoiceGroups] = useState<string[]>([]);
  // Re-mounts boxes voice changed (pickers keep their own copy of the value)
  const [voiceVer, setVoiceVer] = useState<Record<string, number>>({});
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
    setConfirmClear(false);
    clearRegisterDraft(def.key);
  };

  const side = m && direction ? (direction === "IN" ? m.in : m.out) : null;
  const readingKeys = new Set([m?.in.readingKey, m?.out.readingKey].filter(Boolean) as string[]);
  const visible = def.fields.filter(
    (f) =>
      f.type !== "date" &&
      f.type !== "time" &&
      f.key !== m?.directionField &&
      (!readingKeys.has(f.key) || f.key === side?.readingKey)
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (m && !direction) {
          setLocalError(t("Choose In or Out"));
          return;
        }
        setLocalError(null);
        onSubmit({
          fields: values,
          groups: rows,
          direction: direction ?? undefined,
          oneWay: !!m && !m.single && oneWay,
          ...(def.visitHost && visitHost ? { visitHost } : {}),
        });
      }}
      className="space-y-5"
    >
      {/* Brought-back details, and one place to start again */}
      {(restored || typedSomething) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {restored ? (
            <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-emerald-600">
              <History className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("Your unsaved details were kept.")}
            </p>
          ) : (
            <span />
          )}
          {typedSomething && (
            <button
              type="button"
              onClick={() => (confirmClear ? clearAll() : setConfirmClear(true))}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
                confirmClear
                  ? "border-red-500/40 bg-red-500/10 text-red-500"
                  : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-red-500/30 hover:text-red-500"
              }`}
            >
              <Eraser className="h-4 w-4" aria-hidden="true" />
              {confirmClear ? t("Tap again to clear everything") : t("Clear all")}
            </button>
          )}
        </div>
      )}

      <LiveDateTime />

      {/* Speak everything once: the form fills itself (checked before saving) */}
      <VoicePanel voice={voice} onUndo={undoVoice} />

      {m && !m.fixedStart && <DirectionPicker def={def} value={direction} onChange={(d) => { setDirection(d); setLocalError(null); }} />}

      {m && !m.single && !m.fixedStart && side && (
        <fieldset>
          <legend className="sr-only">{t("Record type")}</legend>
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
            {[
              { value: false, label: t("{side} now, {other} later", { side: side.label, other: (direction === "IN" ? m.out : m.in).label }) },
              { value: true, label: t("{side} only", { side: side.label }) },
            ].map((o) => (
              <button
                key={String(o.value)}
                type="button"
                aria-pressed={oneWay === o.value}
                onClick={() => setOneWay(o.value)}
                className={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
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

      {(def.required.length > 0 || (def.groups ?? []).some((g) => !!g.required?.length)) && (
        <p className="flex items-center gap-1 text-xs text-zinc-500">
          <span className="text-base leading-none font-semibold text-orange-500" aria-hidden="true">*</span> {t("Required")}
        </p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visible.map((f) => (
          <FieldBlock
            key={f.key}
            f={f}
            id={`rf-${f.key}`}
            required={def.required.includes(f.key)}
            voice={voiceKeys.includes(f.key)}
            missing={voiceDone && def.required.includes(f.key) && String(values[f.key] ?? "").trim() === ""}
          >
            <FieldInput
              key={`${f.key}-${clearNo}-${fillTargets.has(f.key) ? fillNo : 0}-${voiceVer[f.key] ?? 0}`}
              registerKey={def.key}
              f={f}
              id={`rf-${f.key}`}
              value={values[f.key] ?? ""}
              onChange={(v) => {
                setValues((s) => ({ ...s, [f.key]: v }));
                // The guard checked / changed it: no longer marked as voice
                if (voiceKeys.includes(f.key)) setVoiceKeys((ks) => ks.filter((k) => k !== f.key));
              }}
              staff={staff}
              required={def.required.includes(f.key)}
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
          </FieldBlock>
        ))}
      </div>

      {(def.groups ?? []).map((g) => {
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
                    <FieldBlock key={f.key} f={f} id={`rf-${g.key}-${i}-${f.key}`} required={!!g.required?.includes(f.key)}>
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
        <button type="submit" disabled={busy} className={`${saveBtnCls} bg-orange-600 hover:bg-orange-700 shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)]`}>
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
  onSubmit: (payload: { markMovement: boolean; reading?: string; groupMarks: Record<string, number[]> } & VisitExitInput) => void;
}) {
  const t = useT();
  const pending = pendingActions(def, current);
  const [mark, setMark] = useState<boolean>(!!pending.next);
  const [reading, setReading] = useState("");
  const [marks, setMarks] = useState<Record<string, number[]>>({});
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
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ markMovement: mark && !!next, reading, groupMarks: marks, ...(needsCode ? visitInput : {}) });
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
        <button type="submit" disabled={busy || (needsCode && !visitInputReady(visitInput))} className={`${saveBtnCls} bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50`}>
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
        <button type="submit" disabled={busy} className={`${saveBtnCls} bg-orange-600 hover:bg-orange-700`}>
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
        <button type="submit" disabled={busy} className={`${saveBtnCls} bg-orange-600 hover:bg-orange-700 shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)]`}>
          {!busy && <Save className="h-5 w-5 sm:h-4 sm:w-4" />}
          {busy ? t("Saving…") : t("Save changes")}
        </button>
      </div>
    </form>
  );
}

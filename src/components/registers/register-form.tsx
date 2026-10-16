"use client";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, LogIn, LogOut, Plus, Save, Trash2 } from "lucide-react";
import type { Direction, EntryRegister, FieldDef, GroupDef } from "@/lib/registers/definitions";
import { pendingActions } from "@/lib/registers/definitions";
import { formatDate } from "@/lib/utils";
import { displayValue } from "./localize";

export type StaffOption = { id: string; name: string; employeeId: string | null };
type Values = Record<string, any>;

// text-base on phones keeps iOS from zooming into the field
const inputCls =
  "flex h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 [color-scheme:light] outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 disabled:opacity-60";

/** Large save button pinned to the bottom of the popup while the form scrolls. */
const stickyFooterCls =
  "sticky bottom-0 z-10 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6 space-y-2 border-t border-zinc-800 bg-zinc-900 px-4 pt-3 pb-4 sm:px-6 sm:pb-6";
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

function FieldInput({
  f,
  id,
  value,
  onChange,
  staff,
  required = false,
}: {
  f: FieldDef;
  id: string;
  value: any;
  onChange: (v: any) => void;
  staff: StaffOption[];
  required?: boolean;
}) {
  const t = useT();
  switch (f.type) {
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
      const options =
        f.type === "yesno"
          ? [{ v: "yes", l: t("Yes") }, { v: "no", l: t("No") }]
          : f.type === "staff"
          ? staff.map((s) => ({ v: s.id, l: `${s.name}${s.employeeId ? ` (${s.employeeId})` : ""}` }))
          : (f.options ?? []).map((o) => ({ v: o, l: t(o) }));
      return (
        <select id={id} value={value} required={required} onChange={(e) => onChange(e.target.value)} className={`${inputCls} [&>option]:bg-zinc-900`}>
          <option value="">{t("— Select —")}</option>
          {options.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      );
    }
    case "number":
      return <input id={id} type="number" inputMode="decimal" min={0} step="any" value={value} required={required} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    case "phone":
      return <input id={id} type="tel" maxLength={15} value={value} placeholder={f.placeholder} required={required} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    default:
      return <input id={id} type="text" maxLength={200} value={value} placeholder={f.placeholder} required={required} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
  }
}

function FieldBlock({ f, id, required = false, children }: { f: FieldDef; id: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 min-w-0 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className="flex items-baseline gap-1 text-sm font-medium text-zinc-200">
        <span className="min-w-0">{f.label}</span>
        {required && (
          <span className="text-base leading-none font-semibold text-orange-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
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
  onSubmit: (payload: { fields: Values; groups: Record<string, Values[]>; direction?: Direction }) => void;
}) {
  const t = useT();
  const m = def.movement;
  const [direction, setDirection] = useState<Direction | null>(m && m.firstDirections.length === 1 ? m.firstDirections[0] : null);
  const [values, setValues] = useState<Values>({});
  const [rows, setRows] = useState<Record<string, Values[]>>(() =>
    Object.fromEntries((def.groups ?? []).map((g) => [g.key, [emptyRow(g)]]))
  );
  const [localError, setLocalError] = useState<string | null>(null);

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
        onSubmit({ fields: values, groups: rows, direction: direction ?? undefined });
      }}
      className="space-y-5"
    >
      <LiveDateTime />

      {m && <DirectionPicker def={def} value={direction} onChange={(d) => { setDirection(d); setLocalError(null); }} />}

      {def.fixed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          {def.fixed.map((x) => (
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visible.map((f) => (
          <FieldBlock key={f.key} f={f} id={`rf-${f.key}`} required={def.required.includes(f.key)}>
            <FieldInput
              f={f}
              id={`rf-${f.key}`}
              value={values[f.key] ?? ""}
              onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              staff={staff}
              required={def.required.includes(f.key)}
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
          <fieldset key={g.key} className="space-y-3 rounded-2xl border border-zinc-800 p-3 sm:p-4">
            <legend className="px-1.5 text-sm font-medium text-zinc-100">
              {g.label} <span className="text-xs font-normal text-zinc-500 tabular-nums">({list.length}{g.max !== null ? ` / ${g.max}` : ""})</span>
            </legend>
            {g.fields.some((f) => f.type === "time") && (
              <p className="text-xs text-zinc-500">{t("In-time is recorded now; out-times are marked later from the record.")}</p>
            )}
            {list.map((row, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 space-y-3">
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
  busy,
  onSubmit,
}: {
  def: EntryRegister;
  current: Record<string, any>;
  busy: boolean;
  onSubmit: (payload: { markMovement: boolean; reading?: string; groupMarks: Record<string, number[]> }) => void;
}) {
  const t = useT();
  const pending = pendingActions(def, current);
  const [mark, setMark] = useState<boolean>(!!pending.next);
  const [reading, setReading] = useState("");
  const [marks, setMarks] = useState<Record<string, number[]>>({});

  if (!pending.any)
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {t("Everything for this record has already been recorded.")}
      </p>
    );
  const next = pending.next;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ markMovement: mark && !!next, reading, groupMarks: marks });
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
              <label htmlFor="mv-reading" className="block text-sm font-medium text-zinc-200">
                {def.fields.find((f) => f.key === next.readingKey)?.label ?? t("Reading")}
              </label>
              <input id="mv-reading" type="number" inputMode="decimal" min={0} step="any" value={reading} onChange={(e) => setReading(e.target.value)} className={inputCls} />
            </div>
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
        <button type="submit" disabled={busy} className={`${saveBtnCls} bg-emerald-600 hover:bg-emerald-700`}>
          {!busy && <Save className="h-5 w-5 sm:h-4 sm:w-4" />}
          {busy ? t("Saving…") : t("Save")}
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
}: {
  def: EntryRegister;
  current: Record<string, any>;
  staff: StaffOption[];
  busy: boolean;
  onSubmit: (payload: { fields: Values; groups: Record<string, Values[]>; direction?: Direction }) => void;
}) {
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
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} required={required} className={inputCls} />
    ) : f.type === "time" ? (
      <input id={id} type="time" step={60} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    ) : (
      <FieldInput f={f} id={id} value={value} onChange={onChange} staff={staff} required={required} />
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
        Saving overwrites this record. The previous values are not kept.
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
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock, LogIn, LogOut, Plus, Trash2 } from "lucide-react";
import type { Direction, EntryRegister, FieldDef, GroupDef } from "@/lib/registers/definitions";
import { pendingActions } from "@/lib/registers/definitions";
import { formatDate } from "@/lib/utils";
import { formatFieldValue } from "./format";

export type StaffOption = { id: string; name: string; employeeId: string | null };
type Values = Record<string, any>;

const inputCls =
  "flex h-11 w-full rounded-xl border border-zinc-700/50 bg-zinc-900/50 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50 disabled:opacity-60";

/** Today's date and a live clock. The server records its own time when saving. */
export function LiveDateTime() {
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3.5 py-2.5 text-sm">
      <span className="flex items-center gap-2 text-zinc-300">
        <CalendarDays className="h-4 w-4 text-zinc-500" /> {now ? formatDate(now) : "—"}
      </span>
      <span className="flex items-center gap-2 text-zinc-300 tabular-nums">
        <Clock className="h-4 w-4 text-zinc-500" /> {time}
      </span>
      <span className="text-[11px] text-zinc-500">Date and time are recorded automatically when you save.</span>
    </div>
  );
}

function emptyRow(g: GroupDef): Values {
  return Object.fromEntries(g.fields.filter((f) => f.type !== "time").map((f) => [f.key, ""]));
}

function FieldInput({ f, id, value, onChange, staff }: { f: FieldDef; id: string; value: any; onChange: (v: any) => void; staff: StaffOption[] }) {
  switch (f.type) {
    case "textarea":
      return (
        <textarea
          id={id}
          value={value}
          maxLength={1000}
          rows={2}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} h-auto min-h-[70px] py-2.5 resize-none`}
        />
      );
    case "select":
    case "yesno":
    case "staff": {
      const options =
        f.type === "yesno"
          ? [{ v: "yes", l: "Yes" }, { v: "no", l: "No" }]
          : f.type === "staff"
          ? staff.map((s) => ({ v: s.id, l: `${s.name}${s.employeeId ? ` (${s.employeeId})` : ""}` }))
          : (f.options ?? []).map((o) => ({ v: o, l: o }));
      return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} [&>option]:bg-zinc-900`}>
          <option value="">— Select —</option>
          {options.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      );
    }
    case "number":
      return <input id={id} type="number" inputMode="decimal" min={0} step="any" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    case "phone":
      return <input id={id} type="tel" maxLength={15} value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    default:
      return <input id={id} type="text" maxLength={200} value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
  }
}

function FieldBlock({ f, id, children }: { f: FieldDef; id: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 min-w-0 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className="block text-xs sm:text-sm font-medium text-zinc-300">{f.label}</label>
      {children}
      {f.hint && <p className="text-[11px] text-zinc-500">{f.hint}</p>}
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
  const m = def.movement!;
  const choices = (["IN", "OUT"] as Direction[]).filter((d) => m.firstDirections.includes(d));
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-zinc-300 mb-2">In or Out</legend>
      <div className="grid grid-cols-2 gap-2">
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
              className={`flex items-center justify-center gap-2 h-12 rounded-xl border-2 text-sm font-semibold transition-colors ${
                active
                  ? d === "IN"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-orange-500 bg-orange-500/10 text-orange-300"
                  : "border-zinc-800 text-zinc-400 hover:bg-zinc-800/40"
              }`}
            >
              <Icon className="h-4 w-4" /> {side.label}
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
          setLocalError("Choose In or Out");
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          {def.fixed.map((x) => (
            <div key={x.label}>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">{x.label}</p>
              <p className="text-sm font-medium text-zinc-200">{x.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visible.map((f) => (
          <FieldBlock key={f.key} f={f} id={`rf-${f.key}`}>
            <FieldInput f={f} id={`rf-${f.key}`} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} staff={staff} />
          </FieldBlock>
        ))}
      </div>

      {(def.groups ?? []).map((g) => {
        const list = rows[g.key] ?? [];
        const atMax = g.max !== null && list.length >= g.max;
        const typed = g.fields.filter((f) => f.type !== "time");
        return (
          <fieldset key={g.key} className="space-y-3 rounded-xl border border-zinc-800 p-3 sm:p-4">
            <legend className="px-1 text-sm font-semibold text-zinc-200">
              {g.label} <span className="text-xs font-normal text-zinc-500">({list.length}{g.max !== null ? ` of max ${g.max}` : ""})</span>
            </legend>
            {g.fields.some((f) => f.type === "time") && (
              <p className="text-[11px] text-zinc-500">In-time is recorded now; out-times are marked later from the record.</p>
            )}
            {list.map((row, i) => (
              <div key={i} className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-zinc-400">{g.itemLabel} {i + 1}</p>
                  {list.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((s) => ({ ...s, [g.key]: s[g.key].filter((_, idx) => idx !== i) }))}
                      className="text-zinc-500 hover:text-red-400 p-1"
                      aria-label={`Remove ${g.itemLabel.toLowerCase()} ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {typed.map((f) => (
                    <FieldBlock key={f.key} f={f} id={`rf-${g.key}-${i}-${f.key}`}>
                      <FieldInput
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Add {g.itemLabel.toLowerCase()}
            </button>
          </fieldset>
        );
      })}

      {localError && <p role="alert" className="text-sm text-red-300">{localError}</p>}

      <button type="submit" disabled={busy} className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold disabled:opacity-60">
        {busy ? "Saving…" : side ? `Save — ${side.label} now` : "Save record"}
      </button>
      <p className="text-[11px] text-zinc-500 text-center">Saved records are permanent and cannot be edited.</p>
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
  const pending = pendingActions(def, current);
  const [mark, setMark] = useState<boolean>(!!pending.next);
  const [reading, setReading] = useState("");
  const [marks, setMarks] = useState<Record<string, number[]>>({});

  if (!pending.any) return <p className="text-sm text-zinc-400">Everything for this record has already been recorded.</p>;
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
        <div className="space-y-3 rounded-xl border border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} className="accent-emerald-500 h-4 w-4" />
            Record <span className="font-semibold">{next.label}</span> now
          </label>
          {next.readingKey && mark && (
            <div className="space-y-1.5">
              <label htmlFor="mv-reading" className="block text-xs sm:text-sm font-medium text-zinc-300">
                {def.fields.find((f) => f.key === next.readingKey)?.label ?? "Reading"}
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
          <div key={group.key} className="space-y-2 rounded-xl border border-zinc-800 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-200">Mark {group.label.toLowerCase()} out now</p>
              <button
                type="button"
                onClick={() => setMarks((s) => ({ ...s, [group.key]: selected.length === open.length ? [] : open }))}
                className="text-xs text-zinc-400 underline"
              >
                {selected.length === open.length ? "Clear" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
              {open.map((i) => (
                <label key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/40">
                  <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} className="accent-emerald-500 h-4 w-4" />
                  {group.itemLabel} {i + 1}: {formatFieldValue(group.fields[0], rowsData[i]?.[group.fields[0].key])}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <button type="submit" disabled={busy} className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60">
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

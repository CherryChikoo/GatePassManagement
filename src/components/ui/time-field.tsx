"use client";

import { useEffect, useState } from "react";
import { nextIstTime } from "@/lib/time/parse-time";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** "HH:mm" (24-hour) → its 12-hour parts; blank → blanks */
function toParts(v: string): { h: string; m: string; ap: "AM" | "PM" | "" } {
  const match = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!match) return { h: "", m: "", ap: "" };
  const hh = Number(match[1]);
  return { h: String(hh % 12 || 12), m: match[2], ap: hh < 12 ? "AM" : "PM" };
}

/** 12-hour parts → "HH:mm" (24-hour); "" until all three are chosen */
function fromParts(h: string, m: string, ap: string): string {
  if (!h || !m || !ap) return "";
  const hh = (Number(h) % 12) + (ap === "PM" ? 12 : 0);
  return `${String(hh).padStart(2, "0")}:${m}`;
}

const BOX =
  "field-box h-11 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 text-sm font-semibold text-zinc-100 tabular-nums [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500";

/**
 * Time in 12-hour form (hour, minute, AM / PM) — the phone's own time picker
 * shows 24-hour on many devices. The value stays 24-hour "HH:mm" for saving.
 */
export function Time12Input({
  id,
  value,
  onChange,
  required,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
}) {
  // Parts kept while only some are chosen (the value is "" until all three are)
  const [parts, setParts] = useState(() => toParts(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== fromParts(parts.h, parts.m, parts.ap)) setParts(toParts(value));
  }
  const set = (p: Partial<typeof parts>) => {
    const next = { ...parts, ...p };
    // Picking an hour first: the rest gets a sensible start
    if (p.h && !next.m) next.m = "00";
    if (p.h && !next.ap) next.ap = "AM";
    setParts(next);
    const v = fromParts(next.h, next.m, next.ap);
    setSeen(v);
    onChange(v);
  };
  // A saved minute not on the 5-minute list (e.g. 10:57) stays choosable
  const minutes = parts.m && !MINUTES.includes(parts.m) ? [...MINUTES, parts.m].sort() : MINUTES;
  const cls = `${BOX} ${className}`;
  return (
    <div className="flex items-center gap-2">
      <select id={id} aria-label="Hour" required={required} value={parts.h} onChange={(e) => set({ h: e.target.value })} className={cls}>
        {!required || !parts.h ? <option value="">--</option> : null}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-lg font-bold text-zinc-500" aria-hidden="true">
        :
      </span>
      <select aria-label="Minute" required={required} value={parts.m} onChange={(e) => set({ m: e.target.value })} className={cls}>
        {!required || !parts.m ? <option value="">--</option> : null}
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select aria-label="AM or PM" required={required} value={parts.ap} onChange={(e) => set({ ap: e.target.value as "AM" | "PM" })} className={cls}>
        {!required || !parts.ap ? <option value="">--</option> : null}
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

/**
 * Time box for forms: 12-hour (hour, minute, AM / PM) on screen, and a hidden
 * 24-hour "HH:mm" value under `name` for the form, so nothing is typed in a
 * particular format.
 */
export function TimeField({
  name,
  id,
  required,
  defaultToNow = false,
  className = "",
}: {
  name: string;
  id?: string;
  required?: boolean;
  /** Pre-fill with the next quarter hour (IST). Set after mount to avoid hydration mismatch. */
  defaultToNow?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (defaultToNow) setValue(nextIstTime(15));
  }, [defaultToNow]);

  return (
    <>
      <Time12Input id={id ?? name} value={value} onChange={setValue} required={required} className={className} />
      <input type="hidden" name={name} value={value} />
    </>
  );
}

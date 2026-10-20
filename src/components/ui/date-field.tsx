"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useLang } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

/**
 * Date picker used in every login: day view, then tap the title for months and
 * again for years — quick to reach any date over many years. Values are
 * "YYYY-MM-DD" like <input type="date">, and `onChange` receives
 * `{ target: { value } }`, so existing handlers keep working unchanged.
 *
 * Phones: a bottom sheet. Larger screens: a dropdown under the box.
 */

type View = "days" | "months" | "years";
type ChangeEvent = { target: { value: string } };

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parse(v?: string | null): { y: number; m: number; d: number } | null {
  const r = DATE_RE.exec(v ?? "");
  return r ? { y: +r[1], m: +r[2] - 1, d: +r[3] } : null;
}
/** Today in India (the portal's clock) */
function todayKey(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
const noopSubscribe = () => () => {};

export function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  readOnly,
  required,
  name,
  id,
  className,
  placeholder,
  showIcon = true,
  "aria-label": ariaLabel,
}: {
  value: string;
  /** Method form: also accepts handlers written for input change events */
  onChange?(e: ChangeEvent): void;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Shows the date but can't be changed */
  readOnly?: boolean;
  /** Hide the calendar icon (when the page draws its own) */
  showIcon?: boolean;
  required?: boolean;
  /** For plain <form>s read with FormData */
  name?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const { lang } = useLang();
  const locale = lang === "te" ? "te-IN" : "en-IN";
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = parse(value);
  const label = selected
    ? new Date(Date.UTC(selected.y, selected.m, selected.d)).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : placeholder ?? (lang === "te" ? "తేదీ ఎంచుకోండి" : "Select date");

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-disabled={readOnly || undefined}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !readOnly && setOpen((o) => !o)}
        className={cn(
          "inline-flex h-12 sm:h-10 min-w-0 items-center justify-between gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-left text-base sm:text-sm text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus-visible:border-orange-500/50 focus-visible:ring-4 focus-visible:ring-orange-500/10 disabled:opacity-40",
          className,
          // Always date + icon on one line, even if the page passes "block" (from old date inputs)
          /\bw-full\b/.test(className ?? "") ? "flex" : "inline-flex",
          "items-center justify-between",
          readOnly && "cursor-not-allowed"
        )}
      >
        <span className={cn("truncate tabular-nums", !selected && "text-zinc-500")}>{label}</span>
        {showIcon && <CalendarDays className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />}
      </button>
      {/* Keeps plain forms (FormData / required) working */}
      {name && <input type="hidden" name={name} value={value} />}
      {required && !value && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value=""
          onChange={() => {}}
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}
      {open && mounted &&
        createPortal(
          <Panel
            anchorRef={triggerRef}
            value={value}
            min={min}
            max={max}
            locale={locale}
            lang={lang}
            required={required}
            onPick={(v) => {
              onChange?.({ target: { value: v } });
              setOpen(false);
              triggerRef.current?.focus();
            }}
            onClose={() => setOpen(false)}
          />,
          document.body
        )}
    </>
  );
}

function Panel({
  anchorRef,
  value,
  min,
  max,
  locale,
  lang,
  required,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  value: string;
  min?: string;
  max?: string;
  locale: string;
  lang: string;
  required?: boolean;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  const today = todayKey();
  const start = parse(value) ?? parse(max && today > max ? max : min && today < min ? min : today)!;
  const [view, setView] = useState<View>("days");
  const [year, setYear] = useState(start.y);
  const [month, setMonth] = useState(start.m);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [isPhone, setIsPhone] = useState(false);

  // Place under (or above) the box on larger screens; bottom sheet on phones
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const place = () => {
      const phone = window.innerWidth < 640;
      setIsPhone(phone);
      if (phone || !anchor) return setPos(null);
      const r = anchor.getBoundingClientRect();
      const h = panelRef.current?.offsetHeight ?? 380;
      const w = 320;
      const below = r.bottom + 8 + h <= window.innerHeight;
      setPos({
        top: below ? r.bottom + 8 : Math.max(8, r.top - h - 8),
        left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, view]);

  // Close on outside tap / Escape
  useEffect(() => {
    const anchor = anchorRef.current;
    const down = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [anchorRef, onClose]);

  const minP = parse(min);
  const maxP = parse(max);
  const outOfRange = (key: string) => (!!min && key < min) || (!!max && key > max);
  const monthOut = (y: number, m: number) =>
    (!!minP && (y < minP.y || (y === minP.y && m < minP.m))) || (!!maxP && (y > maxP.y || (y === maxP.y && m > maxP.m)));
  const yearOut = (y: number) => (!!minP && y < minP.y) || (!!maxP && y > maxP.y);

  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2024, i, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" })),
    [locale]
  );
  const weekdays = useMemo(
    // 2024-01-07 is a Sunday
    () => Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(locale, { weekday: "narrow", timeZone: "UTC" })),
    [locale]
  );

  const step = (by: number) => {
    if (view === "days") {
      const d = new Date(Date.UTC(year, month + by, 1));
      setYear(d.getUTCFullYear());
      setMonth(d.getUTCMonth());
    } else if (view === "months") setYear((y) => y + by);
    else setYear((y) => y + by * 12);
  };

  const yearsStart = year - ((year - 1900) % 12);
  const title =
    view === "days"
      ? new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })
      : view === "months"
      ? String(year)
      : `${yearsStart} – ${yearsStart + 11}`;

  const cellBase = "flex items-center justify-center rounded-full text-sm font-medium tabular-nums transition-colors disabled:opacity-25 disabled:pointer-events-none";

  let body: React.ReactNode;
  if (view === "days") {
    const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
    body = (
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {weekdays.map((w, i) => (
          <span key={i} className="pb-1 text-[11px] font-semibold uppercase text-zinc-500">{w}</span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const key = toKey(year, month, d);
          const isSel = key === value;
          const isToday = key === today;
          return (
            <button
              key={i}
              type="button"
              disabled={outOfRange(key)}
              onClick={() => onPick(key)}
              className={cn(
                cellBase,
                "mx-auto h-10 w-10",
                isSel ? "bg-orange-600 text-white" : isToday ? "text-orange-500 ring-1 ring-orange-500/40" : "text-zinc-100 hover:bg-zinc-950"
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    );
  } else if (view === "months") {
    body = (
      <div className="grid grid-cols-3 gap-2">
        {monthNames.map((n, m) => (
          <button
            key={m}
            type="button"
            disabled={monthOut(year, m)}
            onClick={() => {
              setMonth(m);
              setView("days");
            }}
            className={cn(cellBase, "h-12", parse(value)?.y === year && parse(value)?.m === m ? "bg-orange-600 text-white" : "text-zinc-100 hover:bg-zinc-950")}
          >
            {n}
          </button>
        ))}
      </div>
    );
  } else {
    body = (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 12 }, (_, i) => yearsStart + i).map((y) => (
          <button
            key={y}
            type="button"
            disabled={yearOut(y)}
            onClick={() => {
              setYear(y);
              setView("months");
            }}
            className={cn(cellBase, "h-12", parse(value)?.y === y ? "bg-orange-600 text-white" : y === +today.slice(0, 4) ? "text-orange-500" : "text-zinc-100 hover:bg-zinc-950")}
          >
            {y}
          </button>
        ))}
      </div>
    );
  }

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      className={cn(
        "z-[70] border border-zinc-800/80 bg-zinc-900 p-4 shadow-[0_24px_60px_-20px_rgba(16,24,40,0.35)] animate-in fade-in-0 duration-150",
        isPhone ? "fixed inset-x-0 bottom-0 rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]" : "fixed w-[320px] rounded-3xl"
      )}
      style={!isPhone && pos ? { top: pos.top, left: pos.left } : !isPhone ? { visibility: "hidden" } : undefined}
    >
      {isPhone && <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-800" aria-hidden="true" />}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => step(-1)} aria-label="Previous" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-950 hover:text-zinc-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setView(view === "days" ? "months" : view === "months" ? "years" : "days")}
          className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-zinc-100 hover:bg-zinc-950"
        >
          {title}
          <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", view !== "days" && "rotate-180")} />
        </button>
        <button type="button" onClick={() => step(1)} aria-label="Next" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-950 hover:text-zinc-100">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      {body}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3">
        {!required && value ? (
          <button type="button" onClick={() => onPick("")} className="h-10 rounded-full px-4 text-sm font-medium text-zinc-400 hover:bg-zinc-950 hover:text-zinc-100">
            {lang === "te" ? "తీసివేయండి" : "Clear"}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={outOfRange(today)}
          onClick={() => onPick(today)}
          className="h-10 rounded-full px-4 text-sm font-semibold text-orange-500 hover:bg-orange-500/10 disabled:opacity-30"
        >
          {lang === "te" ? "ఈరోజు" : "Today"}
        </button>
      </div>
    </div>
  );

  return isPhone ? (
    <>
      <div className="fixed inset-0 z-[69] bg-black/30" aria-hidden="true" />
      {panel}
    </>
  ) : (
    panel
  );
}

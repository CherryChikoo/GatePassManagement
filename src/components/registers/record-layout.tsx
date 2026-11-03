"use client";

/**
 * Shared layout for record details (register entries, faculty / outing passes,
 * visitors), so every popup reads the same way, top to bottom:
 *   1. who / what the record is: a tinted summary card (name, short line, status)
 *   2. the In / Out times: one coloured row per side (time, gate, guard)
 *   3. the remaining facts in one card — label left, value right; only the filled
 *      ones, the empty ones behind a "Not filled" button
 */
import { useState } from "react";
import { ChevronDown, LogIn, LogOut } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

/** Name of the person / item, a short line under it, and a status chip on the right */
export function RecordHeader({ title, subtitle, status }: { title: string; subtitle?: string | null; status?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border-[1.5px] border-orange-500/30 bg-orange-50 px-4 py-3.5 shadow-card">
      <div className="min-w-0">
        <p className="break-words text-2xl font-bold leading-snug text-zinc-100">{title}</p>
        {subtitle && <p className="mt-0.5 break-words text-base font-medium text-zinc-400">{subtitle}</p>}
      </div>
      {status && <div className="shrink-0 pt-1">{status}</div>}
    </div>
  );
}

export type MoveSide = {
  /** "Out", "In", "Duty start"… */
  label: string;
  /** The time (already formatted), or null when not recorded */
  time: string | null;
  /** Gate • guard, a reading… */
  detail?: string | null;
  /** Shown instead of the time while it is not recorded yet ("Not back yet") */
  pending?: string;
  direction: "IN" | "OUT";
};

/** The sides of a movement in the order they happen: one coloured row each (two side by side on wider screens) */
export function InOutCard({ sides, footer }: { sides: MoveSide[]; footer?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className={cn("grid grid-cols-1 gap-2", sides.length > 1 && "sm:grid-cols-2")}>
        {sides.map((s, i) => {
          const out = s.direction === "OUT";
          const Icon = out ? LogOut : LogIn;
          return (
            <div
              key={s.label + i}
              className={cn(
                "min-w-0 rounded-2xl border-[1.5px] px-4 py-3 shadow-card",
                !s.time
                  ? "border-zinc-700 bg-zinc-900"
                  : out
                  ? "border-sky-500/40 bg-sky-500/10"
                  : "border-emerald-500/40 bg-emerald-500/10"
              )}
            >
              <p className={cn("flex items-center gap-1.5 text-base font-bold", out ? "text-sky-700" : "text-emerald-700")}>
                <Icon className="h-5 w-5" /> {s.label}
              </p>
              {s.time ? (
                <p className="mt-1 text-xl font-bold leading-snug text-zinc-100 tabular-nums">{s.time}</p>
              ) : (
                <p className="mt-1 text-base font-semibold text-zinc-500">{s.pending ?? "—"}</p>
              )}
              {s.detail && <p className="mt-1 break-words text-sm font-medium text-zinc-400">{s.detail}</p>}
            </div>
          );
        })}
      </div>
      {footer && <div className="px-1">{footer}</div>}
    </div>
  );
}

export type Fact = {
  label: string;
  value: React.ReactNode;
  /** Takes the full width (long text, photos) */
  wide?: boolean;
};

const isEmptyValue = (v: React.ReactNode) =>
  v === null || v === undefined || v === false || (typeof v === "string" && (v.trim() === "" || v.trim() === "—"));

/**
 * The facts in one card: label on the left, value on the right (long text and
 * photos under their label). Only the filled ones; the empty ones are listed
 * behind a "Not filled (n)" button, so nothing looks missing.
 */
export function FactList({ facts, title }: { facts: Fact[]; title?: string }) {
  const t = useT();
  const [showEmpty, setShowEmpty] = useState(false);
  if (!facts.length) return null;
  const filled = facts.filter((f) => !isEmptyValue(f.value));
  const empty = facts.filter((f) => isEmptyValue(f.value));
  return (
    <div className="space-y-3">
      {title && <p className="border-t-2 border-zinc-700 pt-4 text-lg font-bold text-zinc-100">{title}</p>}
      {filled.length > 0 && (
        <dl className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 shadow-card">
          {filled.map((f) => (
            <div
              key={f.label}
              className={
                f.wide
                  ? "space-y-1 px-4 py-3"
                  : "grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-baseline gap-3 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
              }
            >
              <dt className="text-base font-semibold text-zinc-300">{f.label}</dt>
              <dd className="min-w-0 break-words text-lg font-bold text-zinc-100">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {empty.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowEmpty((v) => !v)}
            aria-expanded={showEmpty}
            className="flex h-12 w-full items-center gap-3 rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-900 px-4 text-base font-semibold text-zinc-100 shadow-card transition-colors hover:bg-zinc-950"
          >
            <span className="min-w-0 flex-1 text-left">
              {t("Not filled")} <span className="font-normal text-zinc-500 tabular-nums">({empty.length})</span>
            </span>
            <ChevronDown className={cn("h-5 w-5 shrink-0 text-zinc-400 transition-transform", showEmpty && "rotate-180")} aria-hidden="true" />
          </button>
          {showEmpty && (
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950">
              {empty.map((f) => (
                <li key={f.label} className="px-4 py-2.5 text-sm text-zinc-500">
                  {f.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

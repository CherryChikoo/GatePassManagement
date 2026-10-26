"use client";

/**
 * Shared layout for record details (register entries, faculty / outing passes),
 * so every popup reads the same way, top to bottom:
 *   1. who / what the record is (name + short line + status)
 *   2. the In / Out times in one card (gate, guard, readings)
 *   3. the remaining facts — only the filled ones; empty ones behind a toggle
 */
import { ArrowRight, LogIn, LogOut } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

/** Name of the person / item, a short line under it, and a status chip on the right */
export function RecordHeader({ title, subtitle, status }: { title: string; subtitle?: string | null; status?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-snug text-zinc-100 break-words">{title}</p>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500 break-words">{subtitle}</p>}
      </div>
      {status && <div className="shrink-0 pt-0.5">{status}</div>}
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

/** The two sides of a movement, in the order they happen, with an arrow between */
export function InOutCard({ sides, footer }: { sides: MoveSide[]; footer?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <div className={cn("grid items-stretch gap-2", sides.length > 1 ? "grid-cols-[1fr_auto_1fr]" : "grid-cols-1")}>
        {sides.map((s, i) => {
          const Icon = s.direction === "OUT" ? LogOut : LogIn;
          return [
            i > 0 && (
              <span key={`arrow-${i}`} className="flex items-center text-zinc-600" aria-hidden="true">
                <ArrowRight className="h-4 w-4" />
              </span>
            ),
            <div key={s.label + i} className="min-w-0 rounded-xl bg-zinc-900 px-3 py-2.5">
              <p className={cn("flex items-center gap-1.5 text-xs font-semibold", s.direction === "OUT" ? "text-sky-500" : "text-emerald-600")}>
                <Icon className="h-3.5 w-3.5" /> {s.label}
              </p>
              {s.time ? (
                <p className="mt-1 text-base font-semibold text-zinc-100 tabular-nums">{s.time}</p>
              ) : (
                <p className="mt-1 text-sm font-medium text-zinc-500">{s.pending ?? "—"}</p>
              )}
              {s.detail && <p className="mt-0.5 text-[11px] text-zinc-500 break-words">{s.detail}</p>}
            </div>,
          ];
        })}
      </div>
      {footer && <div className="mt-2.5 px-1">{footer}</div>}
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
 * Every fact in its own box (label above, value below), two per row on wider
 * screens. Empty ones are shown too, as "Not filled", so nothing looks missing.
 */
export function FactList({ facts, title }: { facts: Fact[]; title?: string }) {
  const t = useT();
  if (!facts.length) return null;
  return (
    <div>
      {title && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</p>}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {facts.map((f) => {
          const empty = isEmptyValue(f.value);
          return (
            <div
              key={f.label}
              className={cn("min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5", f.wide && "sm:col-span-2")}
            >
              <dt className="text-xs text-zinc-500">{f.label}</dt>
              <dd className={cn("mt-0.5 break-words leading-snug", empty ? "text-sm text-zinc-600" : "text-[15px] font-medium text-zinc-100")}>
                {empty ? t("Not filled") : f.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

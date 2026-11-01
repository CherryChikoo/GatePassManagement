"use client";

/**
 * One person on Security's visitor lists (Waiting to accept, Visitors Inside
 * now, Admission Inside now): a card with an avatar, the name, phone, a short
 * details line, chips, the time and how long; the main action (Review / Mark
 * exit) sits on the right on tablets and full width under the details on
 * phones, so the name never gets squeezed. Tapping the card opens the details.
 *
 * Also the screens' compact empty / loading / error boxes, so the three lists
 * look the same.
 */
import { AlertCircle, Clock, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

/** "Dr. Ravi Kumar" → "RK" (titles skipped) */
function initialsOf(name: string): string {
  return (
    name
      .replace(/^(dr|prof|mr|mrs|ms|sri|smt)\.?\s+/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-base font-semibold text-orange-600",
        className
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

type Tone = "coral" | "sky" | "emerald";
const TONE: Record<Tone, string> = {
  coral: "bg-orange-600 hover:bg-orange-700 shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)]",
  sky: "bg-sky-600 hover:bg-sky-700 shadow-[0_8px_18px_-10px_rgba(2,132,199,0.7)]",
  emerald: "bg-emerald-600 hover:bg-emerald-700 shadow-[0_8px_18px_-10px_rgba(5,150,105,0.7)]",
};

/** The card's main button: full width on phones, on the right from tablets up. */
export function PersonCardAction({
  icon: Icon,
  label,
  onClick,
  busy = false,
  disabled = false,
  tone = "sky",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: Tone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-semibold text-white transition-[background-color,transform] active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:min-w-[9.5rem]",
        TONE[tone]
      )}
    >
      {busy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /> : <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export function PersonCard({
  name,
  phone,
  details,
  chips,
  time,
  since,
  action,
  onOpen,
  highlight = false,
  accent = false,
}: {
  name: string;
  phone?: string | null;
  /** One short line: category · purpose · vehicle … */
  details?: string | null;
  /** Small pills (meeting, gate …) */
  chips?: React.ReactNode;
  /** "In 10:32 AM" / "Sent 10:32 AM" */
  time?: string | null;
  /** "Inside 2 h 10 min" (amber) */
  since?: string | null;
  action?: React.ReactNode;
  /** Tapping the card (not the action) opens the details */
  onOpen?: () => void;
  /** Just added: shown tinted for a moment */
  highlight?: boolean;
  /** Needs attention (waiting at the gate): coral border */
  accent?: boolean;
}) {
  const body = (
    <>
      <PersonAvatar name={name} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-base font-semibold leading-snug text-zinc-100 sm:text-lg">{name || "—"}</span>
        {phone && <span className="block truncate text-sm text-zinc-400 tabular-nums">{phone}</span>}
        {details && <span className="line-clamp-2 break-words text-sm text-zinc-500">{details}</span>}
        {chips && <span className="mt-1 flex flex-wrap items-center gap-1.5">{chips}</span>}
        {(time || since) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            {time && (
              <span className="inline-flex items-center gap-1 text-zinc-500 tabular-nums">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {time}
              </span>
            )}
            {since && <span className="font-semibold text-amber-600 tabular-nums">{since}</span>}
          </span>
        )}
      </span>
    </>
  );
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-zinc-900 p-3 shadow-card transition-colors sm:flex-row sm:items-center sm:gap-4 sm:p-4",
        accent ? "border-orange-500/30" : "border-zinc-800",
        highlight && "border-orange-500/40 bg-orange-500/10"
      )}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="-m-1 flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 text-left transition-colors hover:bg-zinc-950/60 sm:items-center"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">{body}</div>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Compact box for "nobody here" (not a giant empty card). */
export function ListEmpty({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/60 px-4 py-5 sm:px-5">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-500" aria-hidden="true">
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-zinc-100">{title}</span>
        {hint && <span className="mt-0.5 block text-sm text-zinc-500">{hint}</span>}
      </span>
    </div>
  );
}

export function ListLoading() {
  const t = useT();
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900 px-4 py-5 text-sm text-zinc-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {t("Loading…")}
    </div>
  );
}

export function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-400">
      <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-950"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t("Try again")}
      </button>
    </div>
  );
}

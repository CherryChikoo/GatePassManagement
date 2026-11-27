import * as React from "react";
import { cn } from "@/lib/utils";
import { ThemedSelect, type ThemedSelectProps } from "./themed-select";
import { usePathname } from "next/navigation";
import { T } from "@/components/providers/language-provider";
import { createPortal } from "react-dom";
import { lockPageScroll } from "@/lib/ui/scroll-lock";
import { Ban, CheckCheck, CheckCircle2, Clock, Hourglass, LogIn, LogOut, XCircle, type LucideIcon } from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Badge
// ──────────────────────────────────────────────────────────────

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "outline";
}

function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variants: Record<string, string> = {
    default: "bg-zinc-950 text-zinc-300 border-zinc-800",
    success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    danger: "bg-red-500/10 text-red-300 border-red-500/20",
    info: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    outline: "border-zinc-800 text-zinc-500 bg-zinc-900",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };

// ──────────────────────────────────────────────────────────────
// Select
// ──────────────────────────────────────────────────────────────

export interface SelectProps extends ThemedSelectProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

/** Labelled dropdown in the portal's own style (see ThemedSelect). */
function Select({ className, label, error, id, children, icon: _icon, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5 min-w-0">
      {label && (
        <label htmlFor={selectId} className="field-label block text-xs sm:text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <ThemedSelect id={selectId} className={cn(error && "border-red-500/50", className)} {...props}>
        {children}
      </ThemedSelect>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
Select.displayName = "Select";

export { Select };

// ──────────────────────────────────────────────────────────────
// Textarea
// ──────────────────────────────────────────────────────────────

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5 min-w-0">
        {label && (
          <label
            htmlFor={textareaId}
            className="field-label block text-xs sm:text-sm font-medium text-zinc-300"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            "flex min-h-[80px] w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50",
            "hover:border-zinc-700",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-none",
            error && "border-red-500/50",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };

// ──────────────────────────────────────────────────────────────
// Status Badge (auto-colored from status string)
// ──────────────────────────────────────────────────────────────

/**
 * Pass / movement status, told apart at a glance: each has its own colour, icon and word
 * (Approved green, Rejected red, Cancelled purple with a strike-through sign, Expired grey…).
 */
const STATUS_LOOK: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  PENDING: { label: "Pending", icon: Clock, cls: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
  APPROVED: { label: "Approved", icon: CheckCircle2, cls: "border-emerald-600 bg-emerald-600 text-white" },
  REJECTED: { label: "Rejected", icon: XCircle, cls: "border-red-600 bg-red-600 text-white" },
  CANCELLED: { label: "Cancelled", icon: Ban, cls: "border-purple-500/50 bg-purple-500/10 text-purple-700" },
  EXPIRED: { label: "Expired", icon: Hourglass, cls: "border-zinc-600 bg-zinc-950 text-zinc-500" },
  EXITED: { label: "Out", icon: LogOut, cls: "border-sky-500/50 bg-sky-500/10 text-sky-700" },
  COMPLETED: { label: "Completed", icon: CheckCheck, cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700" },
  INSIDE: { label: "Inside", icon: LogIn, cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700" },
  OUTSIDE: { label: "Outside", icon: LogOut, cls: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
  EXIT: { label: "Exit", icon: LogOut, cls: "border-sky-500/50 bg-sky-500/10 text-sky-700" },
  ENTRY: { label: "Entry", icon: LogIn, cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700" },
};

/** Who asked for the pass (and so who cancelled it): from the pass itself */
function requesterOf(pass: any): "student" | "faculty" | null {
  if (!pass || typeof pass !== "object") return null;
  if (pass.faculty || pass.facultyId || pass.requesterType === "FACULTY") return "faculty";
  if (pass.student || pass.studentId || pass.rollNumber || pass.requesterType === "STUDENT") return "student";
  return null;
}

export function StatusBadge({
  status,
  className,
  pass,
  by,
}: {
  status: string;
  className?: string;
  /** The pass: tells who cancelled it ("Cancelled by student" / "by faculty") */
  pass?: unknown;
  /** Or say it directly (e.g. a list of only student passes) */
  by?: "student" | "faculty";
}) {
  const look = STATUS_LOOK[status];
  const who = status === "CANCELLED" ? by ?? requesterOf(pass) : null;
  if (!look) {
    return (
      <Badge variant="default" className={className}>
        <T>{status}</T>
      </Badge>
    );
  }
  const Icon = look.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-bold",
        look.cls,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <T>{who === "student" ? "Cancelled by student" : who === "faculty" ? "Cancelled by faculty" : look.label}</T>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Stat Card (for dashboards)
// ──────────────────────────────────────────────────────────────

/** What a count means (all counts share the coral look; "alert" / "waiting" above 0 stand out) */
export type StatTone = "alert" | "waiting" | "done" | "rejected" | "exit" | "entry" | "people" | "info" | "neutral";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  /** Kept for older callers: shown as a hover hint only (no grey line under the number) */
  description?: string;
  /** Meaning; when left out it is worked out from the title */
  tone?: StatTone;
  className?: string;
}

/** A titled group of StatCards, so a dashboard's counts read in sections (Today, Gate, People…). */
export function StatGroup({
  title,
  children,
  className,
  gridClassName,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Column classes for the cards (default: 2 per row) */
  gridClassName?: string;
}) {
  return (
    <section aria-label={title} className={cn("min-w-0 space-y-3", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">{title}</h2>
      <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", gridClassName)}>{children}</div>
    </section>
  );
}

/** The colour a count gets from its title, when the caller does not say */
function toneFromTitle(title: string): StatTone {
  const x = title.toLowerCase();
  if (/overdue|disabled/.test(x)) return "alert";
  if (/reject|denied/.test(x)) return "rejected";
  if (/pending|unused|waiting/.test(x)) return "waiting";
  if (/approv|accepted|completed|handled|attendance/.test(x)) return "done";
  if (/exit|out/.test(x)) return "exit";
  if (/entr|inside|on campus|in/.test(x)) return "entry";
  if (/student|faculty|visitor|hod|head|warden|staff|security|resident|hostel|enrolled|leader|account|scholar|studying|graduat/.test(x))
    return x.includes("graduat") ? "info" : "people";
  if (/request|register|course|movement|total|division|pass/.test(x)) return "info";
  return "neutral";
}

/**
 * One brand look for every count (coral, like the rest of the portal): the
 * icon tile and the sheen of the glass card. Counts that need action (Overdue,
 * Pending… above 0) get a coral edge, a warmer corner and a coral number.
 */
// Icon tile: a solid orange gradient with a white icon, a light top edge and a soft orange glow
const CORAL = {
  tile: "bg-gradient-to-br from-[#ffa14a] via-[#ff7a45] to-[#e0442a] text-white ring-1 ring-inset ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_18px_-8px_rgba(242,107,18,0.6)]",
  number: "text-orange-600",
};
const NEEDS_ACTION: readonly StatTone[] = ["alert", "waiting"];

export function StatCard({
  title,
  value,
  icon,
  trend,
  trendUp,
  description,
  tone,
  className,
}: StatCardProps) {
  const kind = tone ?? toneFromTitle(title);
  const look = CORAL;
  const count = typeof value === "number" ? value : /^d[d,]*$/.test(String(value).trim()) ? Number(String(value).replace(/,/g, "")) : null;
  // Zero: calm and faded. Needs action (e.g. Overdue above 0): the whole card is tinted.
  const zero = count === 0;
  const attention = NEEDS_ACTION.includes(kind) && count !== null && count > 0;
  return (
    <div
      title={description}
      className={cn(
        "glass-card relative min-w-0 overflow-hidden rounded-3xl p-4 sm:p-5 flex flex-col gap-4 sm:gap-5",
        attention && "glass-card-hot",
        className
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl transition-opacity [&>svg]:h-[18px] [&>svg]:w-[18px] sm:[&>svg]:h-5 sm:[&>svg]:w-5",
          look.tile,
          // Zero: a soft tile (the active counts stand out)
          zero && "opacity-45 saturate-[0.85]"
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-3xl sm:text-4xl md:text-[42px] leading-none font-light tracking-tight tabular-nums truncate",
            zero ? "text-zinc-500" : attention ? look.number : "text-zinc-100"
          )}
        >
          {value}
        </p>
        <p className="mt-2 text-sm sm:text-[15px] font-medium text-zinc-400 leading-snug truncate">{title}</p>
        {trend && (
          <p className={cn("mt-1.5 text-xs font-semibold truncate", trendUp ? "text-emerald-600" : "text-red-500")}>
            {trendUp ? "+" : "−"} {trend}
          </p>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Empty State
// ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center">
      <div className="rounded-2xl bg-zinc-800/50 p-3.5 sm:p-4 text-zinc-500 mb-3 sm:mb-4">
        {icon}
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-zinc-200 mb-1">{title}</h3>
      <p className="text-xs sm:text-sm text-zinc-500 text-center max-w-sm mb-4">
        {description}
      </p>
      {action}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Loading Skeleton
// ──────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-zinc-800/50",
        className
      )}
    />
  );
}

// ──────────────────────────────────────────────────────────────
// Modal / Dialog
// ──────────────────────────────────────────────────────────────

const noopSubscribe = () => () => {};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /** When this changes (e.g. a form reset after saving), the popup scrolls back to the top */
  scrollTopKey?: string | number;
  /**
   * Soft look for cards: a solid warm-white popup (white / coloured cards with shadows stand out on it)
   * and a light blur of the page behind — only on phones that handle it (no blur on low-memory phones).
   */
  frosted?: boolean;
}

export function Modal({ open, onClose, title, children, className, scrollTopKey, frosted = false }: ModalProps) {
  // On Security screens the dialog closes with a labelled "Go Back" button
  const goBackStyle = (usePathname() ?? "").startsWith("/security");
  const bodyRef = React.useRef<HTMLDivElement>(null);
  // The page is only reachable in the browser (server render: nothing)
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  React.useEffect(() => {
    if (!open) return;
    return lockPageScroll();
  }, [open]);
  // Keyboard open where the browser only overlays it: the popup takes the space above the keyboard
  const [visible, setVisible] = React.useState<{ top: number; height: number } | null>(null);
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!open || !vv) return;
    // Only a keyboard counts: a text box has the focus and the page is not pinch-zoomed
    // (zooming with two fingers also makes the visible area smaller — the popup must not follow it)
    const typing = () => {
      const a = document.activeElement;
      return !!a && a.matches("input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=button]), textarea, [contenteditable=true]");
    };
    const sync = () =>
      setVisible(vv.scale <= 1.01 && typing() && vv.height < window.innerHeight - 80 ? { top: vv.offsetTop, height: vv.height } : null);
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [open]);
  // A tapped box under the keyboard: scrolled up into view once the keyboard is out
  const focusTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(focusTimer.current), []);
  const onFocusIn = (e: React.FocusEvent) => {
    const el = e.target as HTMLElement;
    if (!el.matches("input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea, select")) return;
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const body = bodyRef.current;
      if (!body || !body.contains(el)) return;
      const r = el.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      const vv = window.visualViewport;
      // Zoomed in with two fingers: leave the page where the person put it
      if (vv && vv.scale > 1.01) return;
      const bottom = Math.min(b.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
      if (r.bottom > bottom - 12 || r.top < b.top) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 350);
  };
  // Back to the top quickly (about a quarter second, smooth): the browser's own smooth scroll is slow on long forms
  React.useEffect(() => {
    const el = bodyRef.current;
    if (!el || el.scrollTop === 0) return;
    const from = el.scrollTop;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 240);
      el.scrollTop = from * (1 - (1 - (1 - p) ** 3)); // ease-out
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [scrollTopKey]);

  if (!open || !mounted) return null;
  // Blur behind the popup: other logins only. Security (tablets at the gate) gets a plain dim
  // backdrop — a full-screen blur is redrawn on every scroll of the popup and overloads tablets.
  const lightBlur = !goBackStyle && (((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) > 4);

  // Drawn over the whole page (not inside the page's scroll area), so only the
  // popup scrolls while it is open and the page is free again once it closes.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={visible ? { top: visible.top, height: visible.height, bottom: "auto" } : undefined}
      onFocus={onFocusIn}
    >
      {/* Backdrop */}
      <div
        className={lightBlur ? "absolute inset-0 bg-black/30 backdrop-blur-[3px]" : "absolute inset-0 bg-black/40"}
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          // As tall as the visible screen at most (above the keyboard when it is open)
          "relative z-10 w-full max-w-lg rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-[0_24px_60px_-20px_rgba(16,24,40,0.35)] flex flex-col max-h-full",
          "animate-in fade-in-0 zoom-in-95 duration-200",
          // Solid (no blur inside: smooth scrolling on every phone)
          frosted && "bg-[#f7f4f1]",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-zinc-800 p-4 sm:p-5 flex-shrink-0">
            <h2 className="text-base sm:text-lg font-semibold text-zinc-100 truncate pr-2">{title}</h2>
            {goBackStyle ? (
              // Security screens: a clear "Go Back" instead of a small ✕
              <button
                onClick={onClose}
                className="inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full border-2 border-zinc-700 bg-zinc-900 pl-1.5 pr-4 text-base font-bold text-zinc-100 hover:bg-zinc-950 transition-colors -mr-1"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </span>
                <T>Go Back</T>
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-950 hover:text-zinc-200 transition-colors shrink-0 -mr-1"
                aria-label="Close dialog"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div ref={bodyRef} className="min-h-0 flex-1 p-4 sm:p-6 overflow-y-auto overscroll-contain min-w-0 scroll-pb-32">{children}</div>
      </div>
    </div>,
    document.body
  );
}

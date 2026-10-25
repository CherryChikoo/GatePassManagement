import * as React from "react";
import { cn } from "@/lib/utils";
import { ThemedSelect, type ThemedSelectProps } from "./themed-select";
import { usePathname } from "next/navigation";
import { T } from "@/components/providers/language-provider";
import { createPortal } from "react-dom";
import { lockPageScroll } from "@/lib/ui/scroll-lock";

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
  const selectId = id || label?.toLowerCase().replace(/s+/g, "-");
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

export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, BadgeProps["variant"]> = {
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "danger",
    CANCELLED: "outline",
    EXPIRED: "outline",
    EXITED: "info",
    COMPLETED: "success",
    INSIDE: "success",
    OUTSIDE: "warning",
    EXIT: "warning",
    ENTRY: "info",
  };
  return (
    <Badge variant={variantMap[status] || "default"}>
      <T>{status}</T>
    </Badge>
  );
}

// ──────────────────────────────────────────────────────────────
// Stat Card (for dashboards)
// ──────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  description?: string;
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

export function StatCard({
  title,
  value,
  icon,
  trend,
  trendUp,
  description,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "relative min-w-0 rounded-3xl border border-zinc-800/80 bg-zinc-900 p-4 sm:p-5 md:p-6 shadow-card flex flex-col justify-between gap-4 sm:gap-6",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <p className="text-sm sm:text-[15px] text-zinc-300 leading-snug truncate">{title}</p>
        <div className="-mt-1 -mr-1 flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-orange-500/15 bg-orange-500/10 text-orange-400 [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-[18px] sm:[&>svg]:w-[18px]">
          {icon}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-3xl sm:text-4xl md:text-[44px] leading-none font-light tracking-tight text-zinc-100 truncate">
          {value}
        </p>
        {trend && (
          <p className={cn("mt-2 text-xs font-medium truncate", trendUp ? "text-emerald-400" : "text-red-400")}>
            {trendUp ? "+" : "−"} {trend}
          </p>
        )}
        {/* The line is kept even when empty, so every card in a row has the same height */}
        <p className="mt-2 text-xs text-zinc-500 truncate" aria-hidden={!description || undefined}>
          {description || " "}
        </p>
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
}

export function Modal({ open, onClose, title, children, className, scrollTopKey }: ModalProps) {
  // On Security screens the dialog closes with a labelled "Go Back" button
  const goBackStyle = (usePathname() ?? "").startsWith("/security");
  const bodyRef = React.useRef<HTMLDivElement>(null);
  // The page is only reachable in the browser (server render: nothing)
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  React.useEffect(() => {
    if (!open) return;
    return lockPageScroll();
  }, [open]);
  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [scrollTopKey]);

  if (!open || !mounted) return null;

  // Drawn over the whole page (not inside the page's scroll area), so only the
  // popup scrolls while it is open and the page is free again once it closes.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          // dvh: the visible screen height on phones (100vh hides the bottom behind the browser bar)
          "relative z-10 w-full max-w-lg rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-[0_24px_60px_-20px_rgba(16,24,40,0.35)] flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]",
          "animate-in fade-in-0 zoom-in-95 duration-200",
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
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 pl-1 pr-3.5 text-sm font-medium text-zinc-100 hover:bg-zinc-950 transition-colors -mr-1"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-white">
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

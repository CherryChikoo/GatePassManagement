import * as React from "react";
import { cn } from "@/lib/utils";

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
    default: "bg-zinc-800 text-zinc-300 border-zinc-700",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    danger: "bg-red-500/15 text-red-400 border-red-500/30",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    outline: "border-zinc-700 text-zinc-400 bg-transparent",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium transition-colors",
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

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5 min-w-0">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs sm:text-sm font-medium text-zinc-300"
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          className={cn(
            "flex h-11 w-full rounded-xl border border-zinc-700/50 bg-zinc-900/50 px-3.5 py-2 text-base sm:text-sm text-zinc-100 transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50",
            "hover:border-zinc-600",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "backdrop-blur-sm",
            "[&>option]:bg-zinc-900 [&>option]:text-zinc-100",
            error && "border-red-500/50",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    );
  }
);
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
            className="block text-xs sm:text-sm font-medium text-zinc-300"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            "flex min-h-[80px] w-full rounded-xl border border-zinc-700/50 bg-zinc-900/50 px-3.5 py-2.5 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50",
            "hover:border-zinc-600",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "backdrop-blur-sm resize-none",
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
      {status}
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
        "relative min-w-0 overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/60 backdrop-blur-xl p-3.5 sm:p-5 md:p-6 shadow-xl transition-all duration-300 hover:border-zinc-700/50 flex flex-col justify-between",
        className
      )}
    >
      {/* Subtle gradient glow */}
      <div className="absolute -top-12 -right-12 h-24 w-24 rounded-full bg-orange-500/5 blur-2xl pointer-events-none" />
      <div className="relative min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs sm:text-sm font-medium text-zinc-400 truncate">{title}</p>
          <div className="rounded-xl bg-zinc-800/80 p-2 sm:p-2.5 text-zinc-400 shrink-0">
            {icon}
          </div>
        </div>
        <div className="mt-2 sm:mt-3 min-w-0">
          <p className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-zinc-100 truncate">
            {value}
          </p>
          {trend && (
            <p
              className={cn(
                "mt-1 text-[11px] sm:text-xs font-medium truncate",
                trendUp ? "text-emerald-400" : "text-red-400"
              )}
            >
              {trendUp ? "↑" : "↓"} {trend}
            </p>
          )}
          {description && (
            <p className="mt-1 text-[10px] sm:text-xs text-zinc-500 font-medium truncate">
              {description}
            </p>
          )}
        </div>
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

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)]",
          "animate-in fade-in-0 zoom-in-95 duration-200",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-zinc-800 p-4 sm:p-5 flex-shrink-0">
            <h2 className="text-base sm:text-lg font-semibold text-zinc-100 truncate pr-2">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors shrink-0"
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
          </div>
        )}
        <div className="p-4 sm:p-6 overflow-y-auto min-w-0">{children}</div>
      </div>
    </div>
  );
}

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// All dates are shown in campus time (IST). A fixed time zone also keeps
// server-rendered and browser-rendered text identical (no hydration mismatch).
const TIME_ZONE = "Asia/Kolkata";

/**
 * Format a date for display
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/**
 * Format time only
 */
export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/**
 * Get relative time (e.g. "2 hours ago")
 */
export function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

/**
 * Status color mappings for permission statuses
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    APPROVED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    REJECTED: "bg-red-500/15 text-red-400 border-red-500/30",
    CANCELLED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    EXPIRED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    EXITED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    COMPLETED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    INSIDE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    OUTSIDE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    EXIT: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    ENTRY: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };
  return colors[status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

/**
 * Truncate a string to a max length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Gives up on a request that hasn't answered within `ms` (a dropped connection
 * shouldn't leave a screen loading forever). Rejects with a TimeoutError.
 */
export function withTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error("Taking too long. Check the connection and try again.");
      err.name = "TimeoutError";
      reject(err);
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

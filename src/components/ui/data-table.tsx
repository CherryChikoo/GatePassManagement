"use client";

import { IntentLink } from "./intent-link";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

/**
 * Premium table format used across the portal.
 *
 *   <Card className="overflow-hidden">
 *     <div className={dt.wrap}>
 *       <table className={dt.table}>
 *         <thead><tr>
 *           <th className={dt.th}>Student</th> … <th className={dt.thRight}>Actions</th>
 *         </tr></thead>
 *         <tbody>
 *           <tr className={dt.trClickable} onClick={…}>
 *             <td className={dt.td}><PersonCell … /></td> … <td className={dt.tdActions}><RowActions>…</RowActions></td>
 *           </tr>
 *         </tbody>
 *       </table>
 *     </div>
 *   </Card>
 */
export const dt = {
  /** Scroll wrapper; the inset padding lets the header band show rounded ends */
  wrap: "overflow-x-auto p-2",
  table: "w-full min-w-[640px] border-separate border-spacing-0 text-sm",
  /** Header band; the transparent bottom border leaves a small gap before the first row */
  th: "bg-zinc-950 bg-clip-padding border-b-[6px] border-b-transparent px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 whitespace-nowrap first:rounded-l-2xl last:rounded-r-2xl first:pl-4 last:pr-4",
  thRight:
    "bg-zinc-950 bg-clip-padding border-b-[6px] border-b-transparent px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 whitespace-nowrap first:rounded-l-2xl last:rounded-r-2xl",
  tr: "group transition-colors",
  trClickable: "group cursor-pointer transition-colors",
  /** Cells carry the row hover (rounded ends) and the hairline between rows */
  td: "px-4 py-3.5 align-middle border-b border-zinc-800/60 group-last:border-b-0 group-hover:bg-zinc-950/70 first:rounded-l-2xl last:rounded-r-2xl text-zinc-300",
  tdMuted:
    "px-4 py-3.5 align-middle border-b border-zinc-800/60 group-last:border-b-0 group-hover:bg-zinc-950/70 first:rounded-l-2xl last:rounded-r-2xl text-zinc-500 text-xs",
  tdActions:
    "px-4 py-3.5 align-middle border-b border-zinc-800/60 group-last:border-b-0 group-hover:bg-zinc-950/70 first:rounded-l-2xl last:rounded-r-2xl text-right whitespace-nowrap",
  /** Small neutral chip, e.g. roll number / employee ID / department code */
  chip: "inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-400",
  /** Mobile stacked rows (same data, below the table breakpoint) */
  mobileList: "divide-y divide-zinc-800/70",
  mobileRow: "flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-950/70 transition-colors",
};

/** Avatar initials + name + optional chip + secondary line. */
export function PersonCell({
  name,
  chip,
  sub,
  className,
}: {
  name: string;
  chip?: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  const initials =
    name
      .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <div className={cn("flex items-center gap-3 min-w-0", className)}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-[13px] font-semibold text-orange-400">
        {initials}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium text-zinc-100">{name}</span>
          {chip}
        </div>
        {sub && <div className="mt-0.5 truncate text-xs text-zinc-500">{sub}</div>}
      </div>
    </div>
  );
}

/** Right-aligned group of IconActions. */
export function RowActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("inline-flex items-center justify-end gap-1", className)} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

const TONES = {
  neutral: "text-zinc-500 hover:bg-zinc-950 hover:text-zinc-100 hover:border-zinc-800",
  coral: "text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/20",
  success: "text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20",
  danger: "text-red-400 hover:bg-red-500/10 hover:border-red-500/20",
} as const;

/**
 * Round icon-only button with a hover label (the label is also the accessible
 * name). Use for row actions: History, Edit, View details, Expand…
 */
export function IconAction({
  label,
  icon,
  onClick,
  href,
  tone = "neutral",
  disabled = false,
  active = false,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: keyof typeof TONES;
  disabled?: boolean;
  /** Pressed state, e.g. an expanded row */
  active?: boolean;
  className?: string;
}) {
  const cls = cn(
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px]",
    TONES[tone],
    active && "bg-zinc-950 border-zinc-800 text-zinc-100",
    disabled && "pointer-events-none opacity-40",
    className
  );
  return (
    <Tooltip label={label}>
      {href && !disabled ? (
        <IntentLink href={href} aria-label={label} className={cls} onClick={(e) => e.stopPropagation()}>
          {icon}
        </IntentLink>
      ) : (
        <button
          type="button"
          aria-label={label}
          aria-pressed={active || undefined}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className={cls}
        >
          {icon}
        </button>
      )}
    </Tooltip>
  );
}

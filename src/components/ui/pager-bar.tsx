"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/providers/language-provider";

/** The app frames (dashboard shell, student shell) render this slot at the bottom of the screen. */
export const PAGE_FOOTER_SLOT_ID = "page-footer-slot";

type PagerBarProps = {
  page: number;
  pageSize: number;
  total: number;
  /** Client-side paging */
  onPageChange?: (page: number) => void;
  /** URL paging (server pages): the link for a page number */
  hrefForPage?: (page: number) => string;
  /** "students", "requests"… shown as "Showing 1–10 of 57 students" */
  itemLabel?: string;
  /** Render in place (e.g. inside a popup) instead of docking at the bottom of the screen */
  inline?: boolean;
  className?: string;
};

/** 1 … 4 5 6 … 12 */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

/**
 * Pagination bar. By default it docks at the bottom of the screen (always
 * visible, whatever the amount of data); with `inline` it renders in place.
 */
export function PagerBar({ page, pageSize, total, onPageChange, hrefForPage, itemLabel = "results", inline = false, className }: PagerBarProps) {
  // Translated where the screen offers Telugu (Security); English everywhere else
  const t = useT();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!inline) setSlot(document.getElementById(PAGE_FOOTER_SLOT_ID));
  }, [inline]);

  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const go = (p: number, label: React.ReactNode, opts: { disabled?: boolean; active?: boolean; ariaLabel?: string; wide?: boolean } = {}) => {
    const cls = cn(
      "inline-flex h-9 items-center justify-center gap-1 rounded-full text-xs font-medium transition-colors",
      opts.wide ? "px-3" : "min-w-9 px-2",
      opts.active
        ? "bg-zinc-100 text-zinc-900"
        : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950 hover:text-zinc-100",
      opts.disabled && "pointer-events-none opacity-40"
    );
    if (hrefForPage && !opts.disabled && !opts.active) {
      return (
        <Link key={`${p}-${String(opts.ariaLabel)}`} href={hrefForPage(p)} scroll={false} className={cls} aria-label={opts.ariaLabel}>
          {label}
        </Link>
      );
    }
    return (
      <button
        key={`${p}-${String(opts.ariaLabel)}`}
        type="button"
        disabled={opts.disabled}
        aria-current={opts.active ? "page" : undefined}
        aria-label={opts.ariaLabel}
        onClick={() => !opts.active && onPageChange?.(p)}
        className={cls}
      >
        {label}
      </button>
    );
  };

  const bar = (
    <nav
      aria-label={t("Pagination")}
      className={cn(
        "flex items-center justify-between gap-3 rounded-[22px] px-3 sm:px-4 py-2.5",
        inline ? "border border-zinc-800 bg-zinc-900" : "glass shadow-card",
        className
      )}
    >
      <p className="min-w-0 truncate text-xs text-zinc-500">
        {total === 0 ? (
          t("No {items}", { items: t(itemLabel) })
        ) : (
          <>
            <span className="hidden sm:inline">{t("Showing")} </span>
            <span className="font-medium text-zinc-200 tabular-nums">
              {from}–{to}
            </span>{" "}
            {t("of")} <span className="font-medium text-zinc-200 tabular-nums">{total}</span>
            <span className="hidden sm:inline"> {t(itemLabel)}</span>
          </>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        {go(current - 1, <><ChevronLeft className="h-4 w-4" /><span className="hidden md:inline">{t("Previous")}</span></>, {
          disabled: current <= 1,
          ariaLabel: t("Previous page"),
          wide: true,
        })}
        <span className="hidden sm:flex items-center gap-1">
          {pageList(current, pages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-zinc-600">…</span>
            ) : (
              go(p, p, { active: p === current, ariaLabel: t("Page {page}", { page: p }) })
            )
          )}
        </span>
        <span className="sm:hidden px-1.5 text-xs font-medium text-zinc-300 tabular-nums">
          {current} / {pages}
        </span>
        {go(current + 1, <><span className="hidden md:inline">{t("Next")}</span><ChevronRight className="h-4 w-4" /></>, {
          disabled: current >= pages,
          ariaLabel: t("Next page"),
          wide: true,
        })}
      </div>
    </nav>
  );

  if (inline) return bar;
  // Docked at the bottom of the screen; until the slot is found (first paint) render nothing
  return slot ? createPortal(bar, slot) : null;
}

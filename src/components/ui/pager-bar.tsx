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
      "inline-flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-[background-color,transform] active:scale-95",
      opts.wide ? "min-w-11 px-3 sm:px-4" : "min-w-11 px-2",
      opts.active
        ? "bg-orange-600 text-white shadow-[0_6px_14px_-8px_rgba(207,62,37,0.7)]"
        : "border-[1.5px] border-zinc-600 bg-zinc-900 text-zinc-100 hover:bg-zinc-950",
      opts.disabled && "pointer-events-none opacity-35"
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
      <p className="min-w-0 truncate text-sm text-zinc-400">
        {total === 0 ? (
          t("No {items}", { items: t(itemLabel) })
        ) : (
          <>
            <span className="hidden sm:inline">{t("Showing")} </span>
            <span className="font-bold text-zinc-100 tabular-nums">
              {from}–{to}
            </span>{" "}
            {t("of")} <span className="font-bold text-zinc-100 tabular-nums">{total}</span>
            <span className="hidden sm:inline"> {t(itemLabel)}</span>
          </>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        {go(current - 1, <><ChevronLeft className="h-5 w-5" /><span className="hidden sm:inline">{t("Previous")}</span></>, {
          disabled: current <= 1,
          ariaLabel: t("Previous page"),
          wide: true,
        })}
        <span className="hidden sm:flex items-center gap-1">
          {pageList(current, pages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-sm font-bold text-zinc-400">…</span>
            ) : (
              go(p, p, { active: p === current, ariaLabel: t("Page {page}", { page: p }) })
            )
          )}
        </span>
        <span className="sm:hidden px-1.5 text-base font-bold text-zinc-100 tabular-nums">
          {current} / {pages}
        </span>
        {go(current + 1, <><span className="hidden sm:inline">{t("Next")}</span><ChevronRight className="h-5 w-5" /></>, {
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

"use client";
import { DateField } from "@/components/ui/date-field";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useState } from "react";
import { CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { istDateString } from "@/lib/time/ist";

export type RegisterFilters = ReturnType<typeof useRegisterFilters>;

/** Date (default today, or all dates), debounced search and page. */
export function useRegisterFilters() {
  const [date, setDateState] = useState(() => istDateString());
  const [allDates, setAllDatesState] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  /** Registers with a Shift field: "" = all shifts */
  const [shift, setShiftState] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  return {
    date,
    setDate: (d: string) => {
      setDateState(d || istDateString());
      setPage(1);
    },
    allDates,
    setAllDates: (v: boolean) => {
      setAllDatesState(v);
      setPage(1);
    },
    dateParam: allDates ? "all" : date,
    qInput,
    setQInput,
    q,
    page,
    setPage,
    shift,
    setShift: (v: string) => {
      setShiftState(v);
      setPage(1);
    },
  };
}

export function RegisterToolbar({ filters, action, searchPlaceholder = "Search…" }: { filters: RegisterFilters; action?: React.ReactNode; searchPlaceholder?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      {/* Primary action first on phones (full width), at the end of the row on larger screens */}
      {action && <div className="order-first sm:order-last sm:ml-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
      <div className="flex items-center gap-2 min-w-0">
        <DateField
          aria-label={t("Date")}
          value={filters.date}
          max={istDateString()}
          disabled={filters.allDates}
          onChange={(e) => filters.setDate(e.target.value)}
          className="h-12 min-w-0 flex-1 sm:flex-none rounded-full border-[1.5px] border-zinc-600 bg-zinc-950 px-4 text-base font-semibold text-zinc-100 [color-scheme:light] outline-none transition-colors hover:border-zinc-500 focus:border-orange-500 focus:bg-zinc-900 focus:ring-4 focus:ring-orange-500/15 disabled:opacity-40"
        />
        {/* A clear toggle (no small checkbox): on = orange with ✓ */}
        <button
          type="button"
          aria-pressed={filters.allDates}
          onClick={() => filters.setAllDates(!filters.allDates)}
          className={`inline-flex h-12 shrink-0 select-none items-center gap-2 rounded-full border-[1.5px] px-4 text-base font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] active:scale-[0.98] ${
            // Off: light orange; selected: solid dark orange with white text
            filters.allDates
              ? "border-orange-600 bg-orange-600 text-white shadow-[0_6px_14px_-8px_rgba(207,62,37,0.7)]"
              : "border-orange-500/40 bg-orange-500/10 text-orange-600 hover:bg-orange-500/15"
          }`}
        >
          {filters.allDates ? <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> : <CalendarRange className="h-5 w-5 shrink-0" aria-hidden="true" />}
          {t("All dates")}
        </button>
      </div>
      <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 pointer-events-none" />
        <input
          type="search"
          aria-label={t("Search")}
          value={filters.qInput}
          onChange={(e) => filters.setQInput(e.target.value)}
          placeholder={t(searchPlaceholder)}
          className="h-12 w-full rounded-full border-[1.5px] border-zinc-600 bg-zinc-950 pl-12 pr-4 text-base text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-500 focus:border-orange-500 focus:bg-zinc-900 focus:ring-4 focus:ring-orange-500/15"
        />
      </div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const t = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between text-xs text-zinc-400">
      <span>
        {t("{from}–{to} of {total}", { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total })}
      </span>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40"
          aria-label={t("Previous page")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>{t("Page {page} of {pages}", { page, pages })}</span>
        <button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40"
          aria-label={t("Next page")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

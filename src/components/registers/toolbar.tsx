"use client";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { istDateString } from "@/lib/time/ist";

export type RegisterFilters = ReturnType<typeof useRegisterFilters>;

/** Date (default today, or all dates), debounced search and page. */
export function useRegisterFilters() {
  const [date, setDateState] = useState(() => istDateString());
  const [allDates, setAllDatesState] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

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
  };
}

export function RegisterToolbar({ filters, action, searchPlaceholder = "Search…" }: { filters: RegisterFilters; action?: React.ReactNode; searchPlaceholder?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2">
        <input
          type="date"
          aria-label={t("Date")}
          value={filters.date}
          max={istDateString()}
          disabled={filters.allDates}
          onChange={(e) => filters.setDate(e.target.value)}
          className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 [color-scheme:light] disabled:opacity-40"
        />
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 whitespace-nowrap">
          <input type="checkbox" checked={filters.allDates} onChange={(e) => filters.setAllDates(e.target.checked)} className="accent-orange-500" />
          {t("All dates")}
        </label>
      </div>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
        <input
          type="search"
          aria-label={t("Search")}
          value={filters.qInput}
          onChange={(e) => filters.setQInput(e.target.value)}
          placeholder={t(searchPlaceholder)}
          className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500"
        />
      </div>
      {action}
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

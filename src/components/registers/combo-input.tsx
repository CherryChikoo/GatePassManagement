"use client";

/**
 * A text box you can type into freely, with a "Select" button attached on the
 * right that opens a list (Car Book / Auto Book: driver, car, auto, faculty).
 * Tapping an item fills the box (still editable); typing filters the list.
 * Laptop: a list under the box. Phone: a bottom sheet with large rows.
 *
 * Also here: the choices for those boxes — fetched once per session with one
 * request (getVehicleOptions) and kept in memory.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { callGate } from "@/lib/gate-call";
import { cn } from "@/lib/utils";
import type { VehicleOptions } from "@/server/actions/registers";

export type ComboItem = {
  /** Text put in the box when picked */
  fill: string;
  /** Shown in the list ("Innova · AP39T1234"); defaults to fill */
  label?: string;
  /** Muted second line (e.g. a phone number) */
  sub?: string;
  /** Anything the caller needs back when picked (e.g. the vehicle's name) */
  extra?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// ── Choices (module-level, for this browser tab) ────────────────
const optionsCache = new Map<string, Promise<VehicleOptions | null>>();
const optionsAt = new Map<string, number>();
/** A kept copy older than this is fetched again when a form opens (new drivers / cars added elsewhere show up) */
const OPTIONS_FRESH_MS = 30_000;

/** The choices of one book, shared by every box of the form; fetched again when over 30 s old. */
export function loadVehicleOptions(registerKey: string): Promise<VehicleOptions | null> {
  let p = optionsCache.get(registerKey);
  if (!p || Date.now() - (optionsAt.get(registerKey) ?? 0) > OPTIONS_FRESH_MS) {
    p = callGate("getVehicleOptions", [registerKey], 15_000)
      .then((r) => (r && "drivers" in r ? r : null))
      .catch(() => null);
    optionsCache.set(registerKey, p);
    optionsAt.set(registerKey, Date.now());
    // A failed load is tried again the next time a form opens
    void p.then((r) => {
      if (!r && optionsCache.get(registerKey) === p) optionsCache.delete(registerKey);
    });
  }
  return p;
}

/** The book's choices as state (null while loading). */
export function useVehicleOptions(registerKey: string, enabled: boolean): VehicleOptions | null {
  const [opts, setOpts] = useState<VehicleOptions | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadVehicleOptions(registerKey).then((r) => alive && setOpts(r));
    return () => {
      alive = false;
    };
  }, [registerKey, enabled]);
  return opts;
}

export function ComboInput({
  id,
  value,
  onChange,
  onPick,
  items,
  loading = false,
  required,
  placeholder,
  title,
  inputClassName,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick?: (item: ComboItem) => void;
  items: ComboItem[];
  loading?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Heading of the phone sheet */
  title?: string;
  /** Same box style as the form's other inputs */
  inputClassName: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<null | "list" | "sheet">(null);
  const [sheetQuery, setSheetQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Browsers keep what was typed in a box (by its name / id) and offer it under the box,
  // even with autocomplete="off": a fresh name each time stops those offers (only our list shows)
  useEffect(() => {
    if (inputRef.current) inputRef.current.name = `c${Math.random().toString(36).slice(2)}`;
  }, []);
  const listId = `${id}-list`;

  const exact = items.some((i) => i.fill === value);
  const q = norm(exact ? "" : open === "sheet" ? sheetQuery : value);
  const shown = useMemo(
    () => (q ? items.filter((i) => norm(`${i.label ?? i.fill} ${i.sub ?? ""}`).includes(q)) : items),
    [items, q]
  );

  // Close on a tap outside (laptop list)
  useEffect(() => {
    if (open !== "list") return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const openList = () => {
    const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
    if (phone) {
      setSheetQuery(exact ? "" : value);
      setOpen("sheet");
    } else {
      setOpen("list");
    }
  };

  const pick = (item: ComboItem) => {
    onChange(item.fill);
    onPick?.(item);
    setOpen(null);
    if (open === "list") inputRef.current?.focus();
  };

  const rows = (sheet: boolean) => (
    <ul
      id={sheet ? undefined : listId}
      role="listbox"
      className={cn("overflow-y-auto overscroll-contain", sheet ? "px-2 pb-4" : "max-h-64 p-1")}
      style={sheet ? { maxHeight: "60dvh" } : undefined}
    >
      {loading && items.length === 0 ? (
        <li className="flex items-center justify-center gap-2 px-4 py-8 text-base text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("Loading…")}
        </li>
      ) : shown.length === 0 ? (
        <li className="px-4 py-8 text-center text-base leading-relaxed text-zinc-500">{t("Not in the list: the typed text will be saved.")}</li>
      ) : (
        shown.map((item, i) => {
          const selected = item.fill === value;
          return (
            <li key={`${item.fill}|${item.label ?? ""}|${i}`} role="option" aria-selected={selected}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 text-left transition-colors",
                  sheet ? "min-h-14 border-b border-zinc-800/70 px-4 text-base last:border-b-0" : "min-h-11 rounded-xl px-3 text-sm",
                  selected ? "bg-orange-500/10 font-medium text-orange-500" : "text-zinc-100 hover:bg-zinc-950"
                )}
              >
                <span className="min-w-0 py-2">
                  <span className="block break-words">{item.label ?? item.fill}</span>
                  {item.sub && <span className="block text-xs text-zinc-500">{item.sub}</span>}
                </span>
                {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            </li>
          );
        })
      )}
    </ul>
  );

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <div className="flex min-w-0">
        <input
          ref={inputRef}
          id={id}
          type="text"
          maxLength={200}
          autoComplete="off"
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            // Typing only fills the box: nothing opens under it (the list opens from "Select")
            if (open === "list") setOpen(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(null);
            else if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              openList();
            } else if (e.key === "Enter" && open === "list" && shown.length === 1 && !exact) {
              e.preventDefault();
              pick(shown[0]);
            }
          }}
          role="combobox"
          aria-expanded={open === "list"}
          aria-controls={open === "list" ? listId : undefined}
          className={cn(inputClassName, "min-w-0 flex-1 rounded-r-none border-r-0")}
        />
        <button
          type="button"
          onClick={() => (open ? setOpen(null) : openList())}
          aria-haspopup="listbox"
          aria-expanded={!!open}
          className={cn(
            "flex h-12 shrink-0 items-center gap-1 rounded-r-2xl border border-zinc-800 bg-zinc-950 px-3.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/10",
            open && "border-orange-500/50 text-orange-500"
          )}
        >
          {t("Select")}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>

      {open === "list" && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-card">{rows(false)}</div>
      )}

      {open === "sheet" &&
        createPortal(
          <div className="fixed inset-0 z-[80]">
            <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={() => setOpen(null)} aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-900 pb-[env(safe-area-inset-bottom)] shadow-card animate-fade-in">
              <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-zinc-800" aria-hidden="true" />
              <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
                <p className="min-w-0 truncate text-base font-semibold text-zinc-100">{title || t("Choose")}</p>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  aria-label={t("Close")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-zinc-400 hover:text-zinc-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {items.length > 6 && (
                <div className="relative border-b border-zinc-800 p-2">
                  <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                  <input
                    value={sheetQuery}
                    onChange={(e) => setSheetQuery(e.target.value)}
                    placeholder={t("Search…")}
                    aria-label={t("Search…")}
                    className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-orange-500/50"
                  />
                </div>
              )}
              {rows(true)}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

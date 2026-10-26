"use client";

/**
 * The portal's own dropdown, in place of the browser's native one (which draws
 * a plain grey OS list that ignores the theme).
 *
 * A drop-in for <select>: the same <option> / <optgroup> children, value +
 * onChange(e.target.value) or name + defaultValue inside a form (read with
 * FormData), required, disabled. Laptop: a rounded list under the box. Phone:
 * a bottom sheet with large rows. Long lists get a search box. Keyboard:
 * arrows, Enter, Esc, Home / End.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/providers/language-provider";

type Item = { value: string; label: string; disabled: boolean; group?: string };

/** Plain text of an option's children ("Dr Rao — Faculty") */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

function collectItems(children: React.ReactNode, group?: string, out: Item[] = []): Item[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: unknown; children?: React.ReactNode; disabled?: boolean; label?: string };
    if (child.type === "option") {
      const label = textOf(props.children);
      out.push({ value: props.value === undefined ? label : String(props.value), label, disabled: !!props.disabled, group });
    } else if (child.type === "optgroup") {
      collectItems(props.children, props.label, out);
    } else if (child.type === React.Fragment) {
      collectItems(props.children, group, out);
    }
  });
  return out;
}

export type ThemedSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue"> & {
  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  /** Called like a native select's onChange: e.target.value is the picked value */
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
};

const SEARCH_FROM = 12;

export function ThemedSelect({
  id,
  name,
  form,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  className,
  children,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: ThemedSelectProps) {
  const t = useT();
  const items = React.useMemo(() => collectItems(children), [children]);
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState(() => String(defaultValue ?? items[0]?.value ?? ""));
  const current = controlled ? String(value) : inner;
  const selected = items.find((i) => i.value === current) ?? null;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number; up: boolean; maxH: number } | null>(null);
  const [sheet, setSheet] = React.useState(false);
  // Phone sheet: dragged down by its handle / title (closes past a threshold)
  const [dragY, setDragY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const drag = React.useRef<{ startY: number; lastY: number; lastT: number; v: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.label.toLowerCase().includes(q) || (i.group ?? "").toLowerCase().includes(q)) : items;

  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 240 && above > below;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 220), up, maxH: Math.min(360, Math.max(160, up ? above : below)) });
  }, []);

  const openList = () => {
    if (disabled) return;
    setDragY(0);
    // A keyboard left open from the last box would hide the sheet's options
    if (window.innerWidth < 640) (document.activeElement as HTMLElement | null)?.blur?.();
    setSheet(window.innerWidth < 640);
    setQuery("");
    setActive(Math.max(0, items.findIndex((i) => i.value === current)));
    place();
    setOpen(true);
  };
  const close = (focusBack = true) => {
    setOpen(false);
    if (focusBack) triggerRef.current?.focus();
  };

  /** Swipe the sheet down to close it (handle and title row) */
  const onDragStart = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: performance.now(), v: 0 };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT); // px per ms
    d.lastY = e.clientY;
    d.lastT = now;
    setDragY(Math.max(0, e.clientY - d.startY));
  };
  const onDragEnd = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const moved = d.lastY - d.startY;
    // Far enough down, or a quick flick down: close; otherwise snap back
    if (moved > 80 || (moved > 20 && d.v > 0.5)) close(false);
    else setDragY(0);
  };

  const choose = (item: Item) => {
    if (item.disabled) return;
    if (!controlled) setInner(item.value);
    if (item.value !== current) {
      const target = { value: item.value, name: name ?? "" } as unknown as EventTarget & HTMLSelectElement;
      onChange?.({ target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>);
    }
    close();
  };

  // Follow the box while the page scrolls / resizes; close on a tap outside
  React.useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close(false);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, place]);

  // Keep the highlighted row in view
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (dir: 1 | -1) => {
    if (!shown.length) return;
    let i = active;
    for (let n = 0; n < shown.length; n++) {
      i = (i + dir + shown.length) % shown.length;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") close(false);
  };

  const placeholder = selected?.value === "" || !selected;
  // Phone sheet: the empty "— Choose —" option becomes the title instead of a row
  const sheetTitle = (items.find((i) => i.value === "")?.label ?? "").replace(/^[\s—–-]+|[\s—–-]+$/g, "");

  const list = (
    <ul ref={listRef} id={listId} role="listbox" aria-labelledby={ariaLabelledBy} className={cn("overflow-y-auto overscroll-contain", sheet ? "px-2 pb-4" : "p-1.5")} style={{ maxHeight: sheet ? "60dvh" : pos?.maxH }}>
      {shown.length === 0 && <li className="px-3 py-3 text-sm text-zinc-500">{t("Nothing matches.")}</li>}
      {shown.map((item, i) => {
        // A group heading above the first row of each group
        const header = item.group && (i === 0 || shown[i - 1].group !== item.group) ? item.group : null;
        const isSel = item.value === current;
        if (sheet && item.value === "") return null;
        return (
          <React.Fragment key={`${item.group ?? ""}|${item.value}|${i}`}>
            {header && (
              <li role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {header}
              </li>
            )}
            <li
              role="option"
              aria-selected={isSel}
              aria-disabled={item.disabled || undefined}
              data-index={i}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(item)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors",
                sheet ? "min-h-14 text-base border-b border-zinc-800/70 last:border-b-0 rounded-none px-4" : "min-h-10 text-sm",
                item.group && "pl-5",
                item.disabled && "cursor-not-allowed opacity-40",
                isSel ? "bg-orange-500/10 font-medium text-orange-500" : i === active ? "bg-zinc-950 text-zinc-100" : "text-zinc-200"
              )}
            >
              <span className={cn("min-w-0 py-2", item.value === "" && !isSel && "text-zinc-500")}>{item.label}</span>
              {isSel && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </li>
          </React.Fragment>
        );
      })}
    </ul>
  );

  const search =
    items.length >= SEARCH_FROM ? (
      <div className="relative border-b border-zinc-800 p-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input
          value={query}
          autoFocus={!sheet}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder={t("Search…")}
          aria-label={t("Search…")}
          aria-controls={listId}
          className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-orange-500/50"
        />
      </div>
    ) : null;

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-3.5 text-left text-base sm:text-sm text-zinc-100 transition-colors hover:border-zinc-700 focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500/50 disabled:cursor-not-allowed disabled:opacity-50",
          className,
          open && "border-orange-500/50 ring-4 ring-orange-500/10"
        )}
      >
        <span className={cn("min-w-0 truncate", placeholder && "text-zinc-500")}>{selected?.label ?? ""}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {/* Carries the value in forms (FormData) and the browser's "required" check */}
      <input
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        form={form}
        value={current}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onFocus={() => triggerRef.current?.focus()}
        className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
      />

      {open &&
        createPortal(
          sheet ? (
            <div className="fixed inset-0 z-[80]" onKeyDown={onKey}>
              <div className="absolute inset-0 bg-black/30 animate-fade-in" aria-hidden="true" />
              <div
                ref={panelRef}
                className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-900 pb-[env(safe-area-inset-bottom)] shadow-card animate-fade-in"
                style={{
                  transform: dragY ? `translateY(${dragY}px)` : undefined,
                  transition: dragging ? "none" : "transform 180ms ease-out",
                }}
              >
                {/* Grab area: hold and swipe down to close */}
                <div
                  className="cursor-grab touch-none select-none active:cursor-grabbing"
                  onPointerDown={onDragStart}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                >
                <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-zinc-800" aria-hidden="true" />
                <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
                  <p className="min-w-0 truncate text-base font-semibold text-zinc-100">{sheetTitle || t("Choose")}</p>
                  <button
                    type="button"
                    onClick={() => close()}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={t("Close")}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-zinc-400 hover:text-zinc-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                </div>
                {search}
                {list}
              </div>
            </div>
          ) : (
            <div
              ref={panelRef}
              onKeyDown={onKey}
              className="fixed z-[80] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-[0_18px_40px_-16px_rgba(16,24,40,0.35)] animate-fade-in"
              style={
                pos
                  ? { left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }
                  : undefined
              }
            >
              {search}
              {list}
            </div>
          ),
          document.body
        )}
    </div>
  );
}

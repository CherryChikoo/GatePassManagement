"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickOption = { value: string; label: string; disabled?: boolean };

/**
 * Our own drop-down (instead of the phone's plain list): a button that opens a
 * small panel of choice tiles. The chosen tile is coral; ones that can't be
 * picked are faded. Arrow keys move, Enter picks, Escape closes.
 * The panel is drawn over the page, so popups and scroll areas never cut it off.
 */
export function PickMenu({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  columns = 4,
  className = "",
}: {
  id?: string;
  value: string;
  options: PickOption[];
  onChange: (v: string) => void;
  ariaLabel: string;
  columns?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const chosen = options.find((o) => o.value === value);

  // Place the panel under the button (above it when there is no room below), kept on screen
  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.max(b.width, columns * 52 + 16);
    const height = panel.current?.offsetHeight ?? 220;
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const up = b.bottom + 8 + height > vh && b.top - 8 - height > 0;
    const left = Math.min(Math.max(8, b.left), vw - width - 8);
    setPos({ left, top: up ? b.top - 8 - height : b.bottom + 8, up, width });
  }, [columns]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Second pass once the panel has its real height
    const r = requestAnimationFrame(place);
    return () => cancelAnimationFrame(r);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    // Focus the chosen tile (or the first that can be picked)
    const f = requestAnimationFrame(() => {
      const tiles = panel.current?.querySelectorAll<HTMLButtonElement>("[role=option]:not([aria-disabled=true])");
      const sel = panel.current?.querySelector<HTMLButtonElement>("[aria-selected=true]");
      (sel ?? tiles?.[0])?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(f);
    };
  }, [open, place]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus({ preventScroll: true });
  };

  const pick = (o: PickOption) => {
    if (o.disabled) return;
    onChange(o.value);
    close();
  };

  // Arrow keys move between tiles (grid-aware), Escape / Tab close
  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key];
    if (!step) return;
    e.preventDefault();
    const tiles = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []);
    let i = tiles.indexOf(document.activeElement as HTMLButtonElement);
    for (let n = 0; n < tiles.length; n++) {
      i = (i + step + tiles.length) % tiles.length;
      if (tiles[i].getAttribute("aria-disabled") !== "true") {
        tiles[i].focus({ preventScroll: true });
        break;
      }
    }
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "field-box flex h-11 min-w-0 flex-1 items-center justify-between gap-1 rounded-xl border px-3 text-sm font-semibold tabular-nums text-zinc-100 outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-orange-500/40",
          open && "border-orange-500/60! bg-white! ring-2 ring-orange-500/25",
          className
        )}
      >
        <span className={cn("truncate", !chosen && "text-zinc-500")}>{chosen?.label ?? "--"}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-orange-500 transition-transform duration-200 ease-[var(--ease-smooth)]", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={onPanelKey}
            className={cn(
              "fixed z-[80] grid gap-1.5 rounded-2xl border border-orange-500/15 bg-white p-2 shadow-[0_18px_40px_-16px_rgba(16,24,40,0.35),0_4px_12px_-6px_rgba(207,62,37,0.25)]",
              "animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none",
              pos?.up ? "origin-bottom" : "origin-top"
            )}
            style={{
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              width: pos?.width,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {options.map((o) => {
              const sel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  aria-disabled={o.disabled || undefined}
                  tabIndex={-1}
                  onClick={() => pick(o)}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-xl text-[15px] font-semibold tabular-nums outline-none transition-colors duration-150",
                    sel
                      ? "bg-gradient-to-b from-[#ff7a5e] to-[#e0442a] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_16px_-10px_rgba(224,68,42,0.7)]"
                      : o.disabled
                        ? "cursor-not-allowed text-zinc-500/40"
                        : "text-zinc-200 hover:bg-orange-500/10 hover:text-orange-600 focus-visible:bg-orange-500/10 focus-visible:text-orange-600 focus-visible:ring-2 focus-visible:ring-orange-500/40"
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

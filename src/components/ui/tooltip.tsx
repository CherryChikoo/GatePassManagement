"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Side = "top" | "right" | "bottom";
type Tip = { x: number; y: number; side: Side };

/**
 * Hover / keyboard-focus label. Drawn in a floating layer on <body>, so
 * scrolling containers (sidebar, wide tables) never clip it. Touch screens
 * don't get it (they have no hover); they see the visible labels instead.
 */
export function Tooltip({
  label,
  side = "top",
  disabled = false,
  className = "inline-flex",
  children,
}: {
  label: string;
  side?: Side;
  /** e.g. the sidebar is expanded and the label is already visible */
  disabled?: boolean;
  /** Classes for the wrapper element (it takes part in layout) */
  className?: string;
  children: React.ReactNode;
}) {
  const [tip, setTip] = useState<Tip | null>(null);

  const show = useCallback(
    (el: HTMLElement) => {
      if (disabled) return;
      const r = el.getBoundingClientRect();
      if (side === "right") setTip({ x: r.right + 10, y: r.top + r.height / 2, side });
      else if (side === "bottom") setTip({ x: r.left + r.width / 2, y: r.bottom + 8, side });
      else setTip({ x: r.left + r.width / 2, y: r.top - 8, side });
    },
    [disabled, side]
  );
  const hide = useCallback(() => setTip(null), []);

  // A scroll or resize moves the trigger: just hide the label
  useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tip, hide]);

  return (
    <span
      className={className}
      onPointerEnter={(e) => e.pointerType === "mouse" && show(e.currentTarget)}
      onPointerLeave={hide}
      onFocus={(e) => e.currentTarget.matches(":has(:focus-visible)") && show(e.currentTarget)}
      onBlur={hide}
      onClick={hide}
    >
      {children}
      {tip &&
        !disabled &&
        createPortal(
          <span
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-[200] whitespace-nowrap rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-[0_8px_24px_-8px_rgba(16,24,40,0.35)] animate-fade-in",
              tip.side === "right" && "-translate-y-1/2",
              tip.side === "top" && "-translate-x-1/2 -translate-y-full",
              tip.side === "bottom" && "-translate-x-1/2"
            )}
            style={{ left: tip.x, top: tip.y }}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}

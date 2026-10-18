"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useT } from "@/components/providers/language-provider";

/**
 * "Loading…" pill pinned near the top of the screen while new data is on its
 * way (date picked, page changed, filter applied). Waits 150 ms before showing,
 * so instant loads don't flash it.
 */
export function LoadingPill({ active }: { active: boolean }) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, [active]);

  if (!visible || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-20 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full glass shadow-card px-4 py-2 text-sm font-medium text-zinc-100 animate-fade-in"
    >
      <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
      {t("Loading…")}
    </div>,
    document.body
  );
}

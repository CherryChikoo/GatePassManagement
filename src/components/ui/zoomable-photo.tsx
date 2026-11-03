"use client";

/**
 * A photo that opens full screen when tapped, and can be zoomed there:
 * two-finger pinch, double-tap, mouse wheel or the + / − buttons; drag to move
 * around while zoomed. Escape, ✕ or tapping the dark area (not zoomed) closes it.
 * No requests: it shows the same image again, larger.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

const MIN = 1;
const MAX = 5;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

export function ZoomablePhoto({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Open photo")}
        className="group relative inline-block shrink-0 cursor-zoom-in rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-orange-500/30"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} />
      </button>
      {open && <PhotoViewer src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const t = useT();
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zoomTo = (next: number) => {
    const s = clamp(next);
    setScale(s);
    if (s === 1) setPos({ x: 0, y: 0 });
  };
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/90 animate-fade-in" role="dialog" aria-modal="true" aria-label={alt || t("Photo")}>
      {/* Buttons */}
      <div className="flex items-center justify-end gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={() => zoomTo(scale - 0.75)} aria-label={t("Zoom out")} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
          <Minus className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => zoomTo(scale + 0.75)} aria-label={t("Zoom in")} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
          <Plus className="h-5 w-5" />
        </button>
        {scale > 1 && (
          <button type="button" onClick={() => zoomTo(1)} aria-label={t("Reset")} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <RotateCcw className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label={t("Close")} className="ml-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_6px_16px_-6px_rgba(220,38,38,0.7)] hover:bg-red-700">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* The photo: pinch / double-tap / wheel to zoom, drag to move */}
      <div
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget && scale === 1) onClose();
        }}
        onWheel={(e) => zoomTo(scale * (1 - e.deltaY * 0.0015))}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) pinch.current = { dist: distance(), scale };
          // Double tap / double click: 2.5× or back to 1×
          const now = Date.now();
          if (pointers.current.size === 1 && now - lastTap.current < 300) zoomTo(scale > 1 ? 1 : 2.5);
          lastTap.current = now;
        }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2 && pinch.current) {
            zoomTo((pinch.current.scale * distance()) / pinch.current.dist);
          } else if (pointers.current.size === 1 && scale > 1) {
            setPos((p) => ({ x: p.x + (e.clientX - prev.x), y: p.y + (e.clientY - prev.y) }));
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={cn("pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain", scale === 1 && "transition-transform duration-200")}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
        />
      </div>
      <p className="pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-white/70">
        {scale > 1 ? t("Drag to move · double-tap to reset") : t("Pinch or double-tap to zoom")}
      </p>
    </div>,
    document.body
  );
}

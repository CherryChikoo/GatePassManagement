"use client";

import { cn } from "@/lib/utils";

/** The portal's on / off switch: coral gradient when on, a white knob that glides */
export function Switch({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-[background-color,box-shadow] duration-200 disabled:opacity-50",
        on
          ? "bg-gradient-to-b from-[#ff6a55] to-[#d23420] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_14px_-8px_rgba(207,62,37,0.7)]"
          : "bg-zinc-800 shadow-[inset_0_1px_2px_rgba(16,24,40,0.12)]"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(16,24,40,0.25)] transition-transform duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)]",
          on && "translate-x-5"
        )}
      />
    </button>
  );
}

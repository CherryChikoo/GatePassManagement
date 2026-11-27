"use client";

import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Grouped-list form pieces (like phone Settings): a titled white group with
 * hairline dividers, rows with a coral icon tile, and borderless inputs that
 * sit inside the row. Tapping a row tints it softly.
 */
export function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-orange-500/90">{title}</h3>
      <div className="divide-y divide-zinc-800/60 overflow-hidden rounded-3xl border border-orange-500/15 bg-white shadow-[inset_0_1px_0_#ffffff,0_14px_30px_-24px_rgba(16,24,40,0.3)]">
        {children}
      </div>
    </section>
  );
}

export function FormRow({
  icon: Icon,
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  icon: LucideIcon;
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-3 px-4 py-3.5 transition-colors focus-within:bg-orange-500/[0.035]", error && "bg-red-500/[0.04]")}>
      <span className="icon-tile mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
          {required && <span className="text-orange-500"> *</span>}
        </label>
        <div className="mt-1.5">{children}</div>
        {error && <p className="mt-1 text-xs font-semibold text-red-500">{error}</p>}
      </div>
    </div>
  );
}

/** An input box inside a row (the grey premium box: clear where to type) */
export const RowInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function RowInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn("field-box h-11 w-full rounded-xl border px-3.5 text-base font-medium text-zinc-100 outline-none placeholder:text-zinc-400 sm:text-[15px]", className)}
      {...props}
    />
  );
});

/** A text-area box inside a row */
export const RowTextarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function RowTextarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn("field-box min-h-[76px] w-full resize-none rounded-xl border px-3.5 py-2.5 text-base font-medium text-zinc-100 outline-none placeholder:text-zinc-400 sm:text-[15px]", className)}
      {...props}
    />
  );
});

"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Pieces shared by the Create and Edit windows for a person, so both look and
 * read the same.
 */

/**
 * One numbered step of a form (stepper timeline): a coral number on the left,
 * joined to the next step by a thin line, with the step's title and fields to
 * its right — no box inside the form's own card.
 */
export function Part({ no, title, children, oneColumn = false }: { no: number; title: string; hint?: string; children: React.ReactNode; oneColumn?: boolean }) {
  return (
    <section className="group/step relative pb-7 last:pb-0">
      {/* The line down to the next step: wider screens only, never after the last */}
      <span
        className="absolute bottom-0 left-4 top-11 hidden w-px bg-gradient-to-b from-orange-500/40 via-orange-500/15 to-transparent group-last/step:hidden sm:block"
        aria-hidden="true"
      />
      <div className="mb-4 flex items-center gap-3">
        <span className="icon-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">{no}</span>
        <h3 className="text-base font-semibold leading-tight text-zinc-100">{title}</h3>
      </div>
      <div className={oneColumn ? "space-y-5 sm:pl-11" : "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:pl-11"}>{children}</div>
    </section>
  );
}

/** Password box with a show / hide button */
export function PasswordField({
  id,
  name,
  label,
  placeholder,
  help,
  required,
}: {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required={required}
          minLength={8}
          maxLength={72}
          placeholder={placeholder}
          className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 pl-4 pr-12 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2.5 text-zinc-500 hover:bg-zinc-950 hover:text-zinc-200"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {help && <p className="mt-1.5 text-xs text-zinc-500">{help}</p>}
    </div>
  );
}

/** "Dean of [ … ]" box: the area is typed, the words "Dean of" stay in front */
export function DeanOfField({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <div className="sm:col-span-2">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">Dean of *</label>
      <div className="flex items-stretch overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700 focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/40">
        <span className="flex items-center bg-zinc-950 px-4 text-sm font-medium text-zinc-500 border-r border-zinc-800 whitespace-nowrap">Dean of</span>
        <input
          id={id}
          name="deanOf"
          required
          maxLength={80}
          defaultValue={defaultValue}
          placeholder="e.g. Placements, Internal Affairs"
          className="h-12 w-full min-w-0 bg-transparent px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

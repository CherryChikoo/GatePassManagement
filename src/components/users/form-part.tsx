"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Pieces shared by the Create and Edit windows for a person, so both look and
 * read the same.
 */

/** One numbered part of the form: number, title and hint on top, its fields below */
export function Part({ no, title, hint, children }: { no: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
          {no}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight text-zinc-100">{title}</h3>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
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

"use client";

import { useState } from "react";
import { DEPARTMENTS, getDepartmentCode } from "@/lib/constants";
import { useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

const OTHER = "__other__";

/** The dropdown value for a stored department ("CSE", "Computer Science", a custom name…). */
function initialChoice(value: string, extra: string[]): { choice: string; custom: string } {
  const v = (value || "").trim();
  if (!v) return { choice: "", custom: "" };
  if (extra.includes(v)) return { choice: v, custom: "" };
  const code = getDepartmentCode(v);
  if (code && DEPARTMENTS.some((d) => d.code === code)) return { choice: code, custom: "" };
  return { choice: OTHER, custom: v };
}

const fieldCls =
  "h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10";

/**
 * Department picker used in every form: the college departments, plus
 * "Other" which opens a box to type the name. The value is the department
 * code ("CSE") or the typed name — the same format Admin's forms already store.
 *
 * - With `name`: works inside a plain <form> (a hidden input carries the value).
 * - With `value` + `onChange`: controlled.
 */
export function DepartmentSelect({
  name,
  value,
  defaultValue = "",
  onChange,
  id,
  required = false,
  placeholder = "Select department",
  extraOptions = [],
  className,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  id?: string;
  required?: boolean;
  placeholder?: string;
  /** e.g. ["All Departments"] for the Dean / Director */
  extraOptions?: string[];
  className?: string;
}) {
  const t = useT();
  const start = initialChoice(value ?? defaultValue, extraOptions);
  const [choice, setChoice] = useState(start.choice);
  const [custom, setCustom] = useState(start.custom);
  const resolved = choice === OTHER ? custom.trim() : choice;

  const emit = (nextChoice: string, nextCustom: string) => {
    onChange?.(nextChoice === OTHER ? nextCustom.trim() : nextChoice);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <select
        id={id}
        value={choice}
        required={required}
        onChange={(e) => {
          setChoice(e.target.value);
          emit(e.target.value, custom);
        }}
        className={fieldCls}
      >
        <option value="">{t(placeholder)}</option>
        {extraOptions.map((o) => (
          <option key={o} value={o}>
            {t(o)}
          </option>
        ))}
        {DEPARTMENTS.map((d) => (
          <option key={d.code} value={d.code}>
            {d.code} – {d.name}
          </option>
        ))}
        <option value={OTHER}>{t("Other (type the name)")}</option>
      </select>
      {choice === OTHER && (
        <input
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            emit(OTHER, e.target.value);
          }}
          required={required}
          maxLength={100}
          autoFocus
          placeholder={t("Type the department name")}
          aria-label={t("Type the department name")}
          className={fieldCls}
        />
      )}
      {name && <input type="hidden" name={name} value={resolved} />}
    </div>
  );
}

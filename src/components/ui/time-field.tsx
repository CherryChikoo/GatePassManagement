"use client";

import { useEffect, useState } from "react";
import { nextIstTime } from "@/lib/time/parse-time";

/**
 * Native time picker (phone clock / desktop spinner). Always submits a valid
 * 24-hour "HH:mm" value, so nothing needs to be typed in a particular format.
 */
export function TimeField({
  name,
  id,
  required,
  defaultToNow = false,
  className = "",
}: {
  name: string;
  id?: string;
  required?: boolean;
  /** Pre-fill with the next quarter hour (IST). Set after mount to avoid hydration mismatch. */
  defaultToNow?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (defaultToNow) setValue(nextIstTime(15));
  }, [defaultToNow]);

  return (
    <input
      type="time"
      name={name}
      id={id ?? name}
      required={required}
      step={60}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={`flex h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 text-sm text-zinc-100 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 ${className}`}
    />
  );
}

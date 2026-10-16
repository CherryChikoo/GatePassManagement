"use client";

import { useRef, useState } from "react";
import Link from "next/link";

/**
 * A Link that loads the next page's data as soon as the user shows intent
 * (rests the mouse on it, touches it, or tabs to it) instead of on click.
 *
 * Only the link the user is about to open is loaded — never every row on the
 * screen — so it adds no load on the database. A quick mouse pass across a
 * list doesn't count as intent (the pointer must rest briefly).
 */
export function IntentLink({
  href,
  dwellMs = 90,
  onPointerEnter,
  onPointerLeave,
  onTouchStart,
  onFocus,
  ...rest
}: React.ComponentProps<typeof Link> & { href: string; dwellMs?: number }) {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <Link
      {...rest}
      href={href}
      // Until intent: no viewport prefetch. After intent: the full page (with its data).
      prefetch={active ? true : false}
      onPointerEnter={(e) => {
        onPointerEnter?.(e);
        if (!active && e.pointerType === "mouse") timer.current = setTimeout(() => setActive(true), dwellMs);
      }}
      onPointerLeave={(e) => {
        onPointerLeave?.(e);
        cancel();
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        setActive(true);
      }}
      onFocus={(e) => {
        onFocus?.(e);
        setActive(true);
      }}
    />
  );
}

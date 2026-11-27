"use client";

import Link from "next/link";
import { Moon, Sun, Sunrise, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroAction = { href: string; label: string; icon: LucideIcon; /** Solid coral (the main one) or coral glass */ primary?: boolean };

/**
 * The dashboard greeting (every staff login), straight on the page (no card):
 * a small date pill with a time-of-day icon, a big light "Good evening, <name>",
 * and on the right the login's main places as buttons.
 */
export function GreetingHero({
  name,
  actions = [],
  children,
}: {
  name: string;
  actions?: HeroAction[];
  /** Small tags under the greeting (e.g. role, department) */
  children?: React.ReactNode;
}) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const Icon = hour < 12 ? Sunrise : hour < 17 ? Sun : Moon;
  const day = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now);

  return (
    <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {/* Date pill */}
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800/80 bg-white/80 py-1 pl-1 pr-3.5 text-sm font-medium text-zinc-500 shadow-[inset_0_1px_0_#ffffff,0_6px_16px_-12px_rgba(16,24,40,0.3)]">
          <span className="icon-tile flex h-7 w-7 items-center justify-center rounded-full">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          {day}
        </span>
        <h1 className="mt-3 truncate text-3xl font-light leading-tight tracking-tight text-zinc-100 sm:text-[44px]">
          {greeting}
          {name ? (
            <>
              , <span className="font-medium bg-gradient-to-r from-[#ff634a] to-[#c2381f] bg-clip-text text-transparent">{name}</span>
            </>
          ) : null}
        </h1>
        {children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
          {actions.map((a) => {
            const Ico = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className={cn(
                  "inline-flex h-12 items-center gap-2.5 rounded-full px-5 text-sm font-semibold transition-[filter,background-color,border-color,transform] active:scale-[0.98]",
                  a.primary
                    ? "bg-gradient-to-b from-[#ff7a5e] to-[#e0442a] text-white ring-1 ring-inset ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_24px_-12px_rgba(207,62,37,0.75)] hover:brightness-[1.06]"
                    : "border border-orange-500/25 bg-white/80 text-orange-600 shadow-[inset_0_1px_0_#ffffff,0_8px_18px_-14px_rgba(207,62,37,0.5)] hover:border-orange-500/45 hover:bg-orange-500/[0.06]"
                )}
              >
                <Ico className="h-4 w-4" aria-hidden="true" />
                {a.label}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** A small tag under the greeting (role, department) */
export function HeroTag({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "coral" }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold",
        tone === "coral" ? "bg-orange-500/10 text-orange-600" : "border border-zinc-800 bg-white/80 text-zinc-400"
      )}
    >
      {children}
    </span>
  );
}

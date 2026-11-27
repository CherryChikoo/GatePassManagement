"use client";

import Link from "next/link";
import { Moon, Sun, Sunrise, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroAction = { href: string; label: string; icon: LucideIcon; /** The main one (reddish-orange fill) or the next ones (white with reddish-orange text and edge) */ primary?: boolean };

/**
 * The dashboard greeting (every staff login), straight on the page (no card), stacked:
 * a small coral date line, "Good morning," then the name in bold, then the role as one
 * quiet line — and on the right the login's main places as buttons.
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
        {/* 1. The day: small, coral, spaced out */}
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {day}
        </p>
        {/* 2. "Good morning," then the name in bold */}
        <h1 className="mt-2.5 min-w-0 leading-tight tracking-tight">
          <span className="block text-xl font-light text-zinc-500 sm:text-2xl">{greeting}{name ? "," : ""}</span>
          {name && <span className="block truncate text-3xl font-semibold text-zinc-100 sm:text-[42px] sm:leading-[1.15]">{name}</span>}
        </h1>
        {/* 3. The role, as one quiet line */}
        {children && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>}
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
                    ? "bg-gradient-to-b from-[#ff6a55] to-[#d23420] text-white ring-1 ring-inset ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_24px_-12px_rgba(207,62,37,0.75)] hover:brightness-[1.06]"
                    : "border border-[#f4503c]/40 bg-white/85 text-[#d23420] shadow-[inset_0_1px_0_#ffffff,0_8px_18px_-14px_rgba(224,68,42,0.55)] hover:border-[#f4503c]/60 hover:bg-[#f4503c]/[0.06]"
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

/** Role badge under the greeting, in the date pill's style: icon tile · title | detail */
export function HeroBadge({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail?: string | null }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2.5">
      <span className="icon-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="truncate text-[15px] font-semibold text-zinc-200">{title}</span>
      {detail && (
        <>
          <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden="true" />
          <span className="truncate text-[15px] font-medium text-zinc-500">{detail}</span>
        </>
      )}
    </span>
  );
}

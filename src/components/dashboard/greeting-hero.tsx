"use client";

import { Moon, Sun, Sunrise } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroChip = { value: number; label: string; /** Coral when above 0 (Overdue, Pending…) */ attention?: boolean };

/**
 * The dashboard greeting (every staff login): a glass banner with a soft coral
 * light — the day with a time-of-day icon, "Good evening, <name>", and the
 * day's key numbers as chips (plus the login's main action). Static light
 * (no live blur), so it costs nothing while scrolling.
 */
export function GreetingHero({
  name,
  chips = [],
  action,
  children,
}: {
  name: string;
  chips?: HeroChip[];
  action?: React.ReactNode;
  /** Small tags under the greeting (e.g. role, department) */
  children?: React.ReactNode;
}) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const Icon = hour < 12 ? Sunrise : hour < 17 ? Sun : Moon;
  const day = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now);

  return (
    <section className="glass-card relative isolate overflow-hidden rounded-[28px] p-5 sm:p-7">
      {/* Same orange glass edge and sheen as the count cards (globals.css .glass-card) */}
      {/* Soft coral light from the corner (painted once: gradients, no blur) */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(55% 130% at 100% 0%, rgba(255, 99, 74, 0.13) 0%, rgba(255, 99, 74, 0) 62%), radial-gradient(40% 90% at 0% 100%, rgba(255, 138, 115, 0.07) 0%, rgba(255, 138, 115, 0) 60%), linear-gradient(180deg, #ffffff 0%, #fdfcfc 100%)",
        }}
      />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 text-sm font-medium text-zinc-500">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            {day}
          </p>
          <h1 className="mt-3 truncate text-3xl font-light leading-tight tracking-tight text-zinc-100 sm:text-[42px]">
            {greeting}
            {name ? (
              <>
                , <span className="font-medium bg-gradient-to-r from-[#ff634a] to-[#c2381f] bg-clip-text text-transparent">{name}</span>
              </>
            ) : null}
          </h1>
          {children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
        </div>

        {(chips.length > 0 || action) && (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {chips.length > 0 && (
              // One glass strip: big light numbers over small labels, hairline dividers
              <div className="glass-card flex items-stretch divide-x divide-orange-500/10 overflow-hidden rounded-2xl">
                {chips.map((c) => {
                  const hot = !!c.attention && c.value > 0;
                  return (
                    <div key={c.label} className={cn("min-w-[84px] px-4 py-2.5 sm:min-w-[96px] sm:px-5", hot && "bg-orange-500/[0.07]")}>
                      <p className={cn("flex items-center gap-1.5 text-2xl font-light leading-none tabular-nums sm:text-[28px]", hot ? "text-orange-600" : c.value === 0 ? "text-zinc-400" : "text-zinc-100")}>
                        {hot && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden="true" />}
                        {c.value}
                      </p>
                      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-orange-500/80">{c.label}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {action}
          </div>
        )}
      </div>
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

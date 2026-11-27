"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, ChevronRight, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { REGISTER_ICON } from "@/components/registers/register-pages";
import { slugForKey } from "@/lib/registers/custom";
import { ESTATE_BOOKS, REGISTER_BY_KEY, type RegisterKey } from "@/lib/registers/definitions";
import { useGateData } from "@/lib/gate-cache";
import { callGate } from "@/lib/gate-call";
import { useLiveTopics } from "@/lib/realtime/live";
import { cn } from "@/lib/utils";

type Counts = { success?: true; counts?: Record<string, number>; books?: string[]; error?: string };

// Any save in one of the books (by Security) or a verification refreshes the counts
const LIVE = [...ESTATE_BOOKS.map((k) => `reg:${k}`), "estate"];

export function EstateHome() {
  const t = useT();
  const { data, error } = useGateData<Counts>("estate-counts", () => callGate("getEstateCounts", [], 15_000) as Promise<Counts>, LIVE);
  // Keeps the live connection open on this screen (the counts refresh by themselves)
  useLiveTopics(LIVE, () => {});
  const counts = data?.counts ?? {};
  // The books this login checks (Siros stock for Civil; the rest for the Estate Manager)
  const books = data?.books ?? [];
  const total = books.reduce((n, k) => n + (counts[k] ?? 0), 0);

  // Alert when new entries arrive while this screen is open
  const last = useRef<number | null>(null);
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    if (!data?.counts) return;
    if (last.current !== null && total > last.current) {
      setFresh((n) => n + (total - last.current!));
      try {
        navigator.vibrate?.(200);
      } catch {}
    }
    last.current = total;
  }, [data, total]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 sm:space-y-6">
      {/* Title, with the total still to verify */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-light tracking-tight text-zinc-100 sm:text-3xl">{t("Books to verify")}</h1>
        {data?.counts &&
          (total > 0 ? (
            <span className="inline-flex items-center rounded-full bg-gradient-to-b from-[#ff7a5e] to-[#e0442a] px-4 py-1.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_20px_-12px_rgba(224,68,42,0.7)]">
              {t("{count} to verify", { count: total })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("All verified")}
            </span>
          ))}
      </div>

      {fresh > 0 && (
        <div role="alert" className="glass-card-hot flex items-center gap-3 rounded-2xl px-4 py-3">
          <span className="icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-base font-semibold text-zinc-100">{t("{count} new entries to verify", { count: fresh })}</p>
          <button
            type="button"
            onClick={() => setFresh(0)}
            aria-label={t("Close")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-950 hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {error && !data && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-600">{t("Could not load. Please try again.")}</p>}

      {/* One card per book: icon, name, and how many are waiting (like the portal's count cards) */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {books.map((key) => {
          const def = REGISTER_BY_KEY[key as RegisterKey];
          if (!def) return null;
          const Icon = REGISTER_ICON[key as RegisterKey];
          const n = counts[key] ?? 0;
          return (
            <li key={key} className="min-w-0">
              <Link
                href={`/estate/registers/${slugForKey(key)}`}
                prefetch={true}
                className={cn(
                  "glass-card group flex h-full min-w-0 flex-col gap-4 rounded-3xl p-5 transition-transform duration-200 active:scale-[0.98]",
                  n > 0 && "glass-card-hot"
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className={cn("icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", !n && data?.counts && "opacity-45 saturate-[0.85]")}>
                    {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-orange-500 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-base font-semibold leading-snug text-zinc-100">{t(def.title)}</span>
                  {data?.counts &&
                    (n ? (
                      <span className="mt-3 flex items-baseline gap-2">
                        <span className="text-4xl font-light leading-none tracking-tight tabular-nums text-orange-600">{n}</span>
                        <span className="text-sm font-medium text-zinc-500">{t("to verify")}</span>
                      </span>
                    ) : (
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("All verified")}
                      </span>
                    ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-xs text-zinc-500">{t("Counts show the last 60 days.")}</p>
    </div>
  );
}

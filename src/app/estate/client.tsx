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

type Counts = { success?: true; counts?: Record<string, number>; error?: string };

// Any save in one of the books (by Security) or a verification refreshes the counts
const LIVE = [...ESTATE_BOOKS.map((k) => `reg:${k}`), "estate"];

export function EstateHome() {
  const t = useT();
  const { data, error } = useGateData<Counts>("estate-counts", () => callGate("getEstateCounts", [], 15_000) as Promise<Counts>, LIVE);
  // Keeps the live connection open on this screen (the counts refresh by themselves)
  useLiveTopics(LIVE, () => {});
  const counts = data?.counts ?? {};
  const total = ESTATE_BOOKS.reduce((n, k) => n + (counts[k] ?? 0), 0);

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
    <div data-look="clear" className="mx-auto w-full max-w-[1100px] space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">{t("Books to verify")}</h1>
        <p className="mt-1 text-base font-semibold text-zinc-400">
          {data?.counts ? (total ? t("{count} entries not verified yet", { count: total }) : t("All entries verified")) : t("Loading…")}
        </p>
      </div>

      {fresh > 0 && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border-[1.5px] border-orange-500/60 bg-orange-500/10 px-4 py-3 shadow-card">
          <Bell className="h-6 w-6 shrink-0 text-orange-600" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-base font-bold text-orange-700">{t("{count} new entries to verify", { count: fresh })}</p>
          <button
            type="button"
            onClick={() => setFresh(0)}
            aria-label={t("Close")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white hover:bg-red-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {error && !data && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-600">{t("Could not load. Please try again.")}</p>}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ESTATE_BOOKS.map((key) => {
          const def = REGISTER_BY_KEY[key as RegisterKey];
          if (!def) return null;
          const Icon = REGISTER_ICON[key as RegisterKey];
          const n = counts[key] ?? 0;
          return (
            <li key={key}>
              <Link
                href={`/estate/registers/${slugForKey(key)}`}
                prefetch={true}
                className={cn(
                  "flex min-h-[88px] items-center gap-3 rounded-3xl border-[1.5px] bg-zinc-900 p-4 shadow-card transition-[transform,border-color] active:scale-[0.98]",
                  n ? "border-amber-500/50 hover:border-amber-500" : "border-emerald-500/30 hover:border-emerald-500/60"
                )}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700">
                  {Icon && <Icon className="h-6 w-6" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-base font-bold leading-snug text-zinc-100 sm:text-lg">{t(def.title)}</span>
                  {data?.counts &&
                    (n ? (
                      <span className="mt-1 inline-flex rounded-lg bg-amber-500/15 px-2 py-0.5 text-sm font-bold text-amber-700">
                        {t("{count} to verify", { count: n })}
                      </span>
                    ) : (
                      <span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("All verified")}
                      </span>
                    ))}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-sm text-zinc-500">{t("Counts show the last 60 days.")}</p>
    </div>
  );
}

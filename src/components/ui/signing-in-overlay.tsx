"use client";

import { Check, Loader2, ShieldCheck } from "lucide-react";
import { useT } from "@/components/providers/language-provider";

export type SigningInStep = "checking" | "opening";

const STEPS: { key: SigningInStep; label: string }[] = [
  { key: "checking", label: "Checking your details" },
  { key: "opening", label: "Opening your dashboard" },
];

/**
 * Full-screen "Signing in…" shown when signing in takes a moment (sleeping
 * server, slow network): what is happening now, step by step, so the person
 * waits instead of tapping again. Matches the sign-in page (white, coral).
 */
export function SigningInOverlay({ step }: { step: SigningInStep }) {
  const t = useT();
  const current = STEPS.findIndex((s) => s.key === step);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#f2f2f3]/85 px-4 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-[320px] overflow-hidden rounded-[28px] border border-[#ececee] bg-white shadow-[0_24px_60px_-28px_rgba(16,24,40,0.25)] animate-scale-in">
        <div className="flex flex-col items-center px-6 pt-7 pb-5 text-center">
          {/* Coral ring turning around the shield */}
          <div className="relative flex h-16 w-16 items-center justify-center">
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-spin rounded-full border-[3px] border-orange-500/15 border-t-orange-500 [animation-duration:900ms]"
            />
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 text-lg font-semibold text-zinc-100">{t("Signing in…")}</p>

          <ol className="mt-4 w-full space-y-2.5 text-left">
            {STEPS.map((s, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li key={s.key} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      done ? "bg-emerald-500 text-white" : active ? "bg-orange-500 text-white" : "bg-[#eef0f3] text-zinc-500"
                    }`}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className={`text-sm ${active ? "font-medium text-zinc-100" : done ? "text-zinc-400" : "text-zinc-500"}`}>
                    {t(s.label)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        {/* Moving bar: still working */}
        <div className="relative h-1 w-full overflow-hidden bg-orange-500/10" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-orange-500 animate-signing-in-bar" />
        </div>
      </div>
    </div>
  );
}

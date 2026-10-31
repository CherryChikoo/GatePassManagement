"use client";

import { Loader2 } from "lucide-react";
import { useT } from "@/components/providers/language-provider";

export type SigningInStep = "checking" | "opening";

/** Full-screen overlay while signing in and the dashboard loads (same look as SigningOutOverlay). */
export function SigningInOverlay({ step }: { step: SigningInStep }) {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/90 animate-fade-in"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-8 py-6 shadow-2xl">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-zinc-100">{t("Signing in…")}</p>
        <p className="text-xs text-zinc-500">{t(step === "checking" ? "Checking your details" : "Opening your dashboard")}</p>
      </div>
    </div>
  );
}

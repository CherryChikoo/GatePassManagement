"use client";

import { AlertCircle, Loader2, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

type Tone = "wait" | "ok" | "bad" | "info";

const TONE: Record<Tone, string> = {
  wait: "bg-amber-500/10 text-amber-600",
  ok: "bg-emerald-500/10 text-emerald-600",
  bad: "bg-red-500/10 text-red-500",
  info: "bg-orange-500/10 text-orange-500",
};

/** One big message on the phone: a round icon, a heading and a few words. */
export function StateCard({
  tone,
  icon,
  title,
  children,
  className,
}: {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-6 text-center", className)}>
      <span className={cn("mx-auto flex h-20 w-20 items-center justify-center rounded-full [&>svg]:h-10 [&>svg]:w-10", TONE[tone])} aria-hidden="true">
        {icon}
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-100">{title}</h1>
      {children && <div className="mt-2 space-y-3 text-base leading-relaxed text-zinc-400">{children}</div>}
    </Card>
  );
}

/** Loading the page's first answer */
export function PhoneLoading({ label }: { label?: string }) {
  const t = useT();
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500">
      <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden="true" />
      <p className="text-base">{label ?? t("Loading…")}</p>
    </div>
  );
}

/** A problem under a form or a card (server message already translated) */
export function PhoneAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-500">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="text-sm font-medium leading-relaxed">{children}</p>
    </div>
  );
}

/** Small line while the phone cannot reach the server (it keeps trying by itself) */
export function OfflineNote({ text }: { text: string }) {
  return (
    <p role="status" className="flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-center text-xs font-medium text-zinc-500">
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

/** Big full-width button / link look for the phone */
export const bigButtonCls =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-6 text-base font-medium text-white shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)] transition-colors hover:bg-orange-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const plainButtonCls =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-6 text-base font-medium text-zinc-200 transition-colors hover:bg-zinc-950 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

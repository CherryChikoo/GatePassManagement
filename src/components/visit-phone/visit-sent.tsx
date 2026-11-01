"use client";

/**
 * After the form is sent: what the visitor sees on their phone. It comes from
 * this phone's own storage (no server call, no checking for news), so a reload
 * shows it again. The security officer does the rest at the gate.
 */
import { CheckCircle2, Clock, FilePlus2, KeyRound, LogOut, UserRound } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Card } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";
import { plainButtonCls } from "@/components/visit-phone/parts";
import type { SentVisit } from "@/components/visit-phone/visit-store";

export function VisitSent({ sent, onAnother }: { sent: SentVisit; onAnother: () => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-emerald-500/10 px-6 pb-6 pt-7 text-center">
          <span
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
            aria-hidden="true"
          >
            <CheckCircle2 className="h-11 w-11" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-100">{t("Details sent")}</h1>
          <p className="mt-2 text-base leading-relaxed text-zinc-400">
            {t("Your details are sent. The security officer will check them and take your photo.")}
          </p>
        </div>

        <dl className="divide-y divide-zinc-800/70 px-6">
          <div className="flex items-center gap-3 py-4">
            <UserRound className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden="true" />
            <dt className="sr-only">{t("Name")}</dt>
            <dd className="min-w-0 break-words text-lg font-semibold text-zinc-100">{sent.name}</dd>
          </div>
          <div className="flex items-center gap-3 py-4">
            <Clock className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden="true" />
            <dt className="sr-only">{t("Time")}</dt>
            <dd className="text-base text-zinc-300">{t("Sent at {time}", { time: formatTime(sent.at) })}</dd>
          </div>
        </dl>
      </Card>

      {/* How they leave */}
      {sent.hostName ? (
        <div className="flex items-start gap-3 rounded-3xl border border-orange-500/30 bg-orange-500/5 p-5">
          <KeyRound className="mt-0.5 h-6 w-6 shrink-0 text-orange-500" aria-hidden="true" />
          <p className="text-base font-medium leading-relaxed text-zinc-200">
            {t("When you leave, tell the security officer the 4-digit code {name} gives you.", { name: sent.hostName })}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <LogOut className="mt-0.5 h-6 w-6 shrink-0 text-zinc-500" aria-hidden="true" />
          <p className="text-base leading-relaxed text-zinc-300">{t("When you leave, the security officer will mark your exit.")}</p>
        </div>
      )}

      <button type="button" className={plainButtonCls} onClick={onAnother}>
        <FilePlus2 className="h-5 w-5" aria-hidden="true" />
        {t("Fill another form")}
      </button>
    </div>
  );
}

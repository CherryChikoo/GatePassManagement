"use client";
import { useT } from "@/components/providers/language-provider";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatTime } from "@/lib/utils";
import { formatDelay } from "@/lib/passes/return-scan";
import { AlertTriangle, CheckCircle2, DoorOpen, LogOut, Phone, ScanLine, ShieldCheck } from "lucide-react";
import type { VisitorExitCard } from "@/server/actions/visit-requests";

/** Readable visitor category for the guard (same words as the Visitors Book form) */
const CATEGORY: Record<string, string> = {
  GUEST: "Guest / Visitor",
  PARENT: "Parent / Guardian",
  VENDOR: "Vendor / Delivery",
  WORKER: "Worker / Staff",
};

/** Which book the visit was written in */
export const REGISTER_LABEL: Record<string, string> = { VISITORS: "Visitors Book", ADMISSION: "Admission Book" };

/**
 * A scanned visitor Exit QR: who it is, how long they were inside, what their
 * phone proved (met the person / visited the office), and one "Allow exit".
 */
export function VisitorExitResult({
  card,
  insideMinutes,
  error,
  onAllow,
  onCancel,
  onScanAgain,
}: {
  card: VisitorExitCard;
  /** Minutes since they were let in, worked out when the QR was scanned */
  insideMinutes: number | null;
  /** Already translated */
  error: string | null;
  onAllow: () => void;
  onCancel: () => void;
  onScanAgain: () => void;
}) {
  const t = useT();
  const v = card.visitor;
  const checked =
    v.exitMethod === "CODE"
      ? { title: t("Met {name}", { name: v.hostName || t("the person they came to meet") }), hint: t("Meeting code checked on the visitor's phone") }
      : {
          title: v.officeName ? t("Visited {office}", { office: v.officeName }) : t("Visited the office"),
          hint: t("Office QR scanned on the visitor's phone"),
        };

  return (
    <div className="space-y-3 animate-scale-in">
      {/* 1. The verdict */}
      <div className="flex items-center gap-4 rounded-3xl bg-sky-600 px-5 py-4 text-white shadow-card">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
          <LogOut className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold leading-tight">{t("Visitor exit")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-white/90">
            <ShieldCheck className="h-4 w-4 shrink-0" /> {t("Valid exit QR")} · {t(REGISTER_LABEL[v.register] ?? v.register)}
          </p>
        </div>
      </div>

      {/* 2. The visitor: photo taken at check-in to compare, name, call */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-4">
            {v.photoUrl ? (
              <img
                src={v.photoUrl}
                alt={v.name}
                className="h-20 w-20 shrink-0 rounded-2xl border border-zinc-800 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-3xl font-semibold text-orange-500">
                {v.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold leading-tight text-zinc-100 break-words">{v.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-500">
                  {v.register === "ADMISSION" ? t("Admission") : t(CATEGORY[v.category ?? ""] ?? "Guest / Visitor")}
                </span>
              </div>
            </div>
            {v.phone && (
              <a
                href={`tel:${v.phone}`}
                aria-label={`${t("Call")} ${v.phone}`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-orange-500 transition-colors hover:border-orange-500/40"
              >
                <Phone className="h-5 w-5" />
              </a>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Fact label={t("Mobile Number")} value={v.phone} wide />
            <Fact label={t("Time In")} value={v.insideSince ? formatTime(v.insideSince) : null} />
            <Fact label={t("Inside for")} value={insideMinutes === null ? null : formatDelay(insideMinutes)} />
            {v.register === "VISITORS" && <Fact label={t("Vehicle Number")} value={v.vehicleNumber === "On foot" ? t("On foot") : v.vehicleNumber} wide />}
            {v.purpose && <Fact label={t("Purpose")} value={t(v.purpose)} wide />}
          </dl>
        </CardContent>
      </Card>

      {/* 3. What the visitor's phone proved */}
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-snug text-zinc-100 break-words">{checked.title} ✓</p>
          <p className="mt-0.5 text-sm text-zinc-500">{checked.hint}</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-500">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Allow exit */}
      <div className="space-y-2 pt-1">
        <Button onClick={onAllow} size="lg" className="h-16 w-full text-lg">
          <DoorOpen className="h-5 w-5" />
          {t("Allow exit")}
        </Button>
        {error ? (
          <Button onClick={onScanAgain} variant="outline" className="h-12 w-full">
            <ScanLine className="h-4 w-4" />
            {t("Scan again")}
          </Button>
        ) : (
          <Button onClick={onCancel} variant="ghost" className="h-12 w-full">
            {t("Cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** One detail about the visitor, in its own box ("Not filled" when empty) */
function Fact({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  const t = useT();
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5", wide && "col-span-2")}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={cn("mt-0.5 text-[15px] font-medium leading-snug break-words", empty ? "text-zinc-500" : "text-zinc-100")}>
        {empty ? t("Not filled") : value}
      </dd>
    </div>
  );
}

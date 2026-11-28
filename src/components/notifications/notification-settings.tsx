"use client";

import { useEffect, useState } from "react";
import { BellRing, CalendarClock, DoorOpen, FileText, Loader2, Send, ShieldCheck, Smartphone, UserRound, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/components/providers/language-provider";
import { usePush } from "@/lib/push/client";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

type Kind = "request" | "pass" | "scan" | "visitor" | "system";

const KIND_INFO: Record<Kind, { label: string; icon: LucideIcon }> = {
  request: { label: "New pass requests", icon: FileText },
  pass: { label: "My pass updates", icon: ShieldCheck },
  scan: { label: "Gate scans", icon: DoorOpen },
  visitor: { label: "Visitors", icon: UserRound },
  system: { label: "Reminders & summaries", icon: CalendarClock },
};

/** The alert types each login actually gets */
const KINDS_FOR: Record<string, Kind[]> = {
  STUDENT: ["pass", "scan", "system"],
  FACULTY: ["request", "pass", "scan", "visitor"],
  FACULTY_ADMIN: ["request", "pass", "scan", "visitor", "system"],
  DEAN: ["request", "visitor", "system"],
  DIRECTOR: ["request", "visitor", "system"],
  WARDEN: ["request", "system"],
  SECURITY: ["visitor", "system"],
};

/**
 * Settings → Notifications: phone / desktop notifications on this device, a
 * test, and which alert types to hear about (Urgent ones always come).
 */
export function NotificationSettings({ role }: { role: string }) {
  const t = useT();
  const push = usePush();
  const [muted, setMuted] = useState<string[] | null>(null);
  const [tested, setTested] = useState(false);
  const kinds = KINDS_FOR[role] ?? ["visitor", "system"];

  useEffect(() => {
    fetch("/api/notifications/preferences", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : { muted: [] }))
      .then((d: { muted?: string[] }) => setMuted(d.muted ?? []))
      .catch(() => setMuted([]));
  }, []);

  const toggleKind = (kind: Kind, on: boolean) => {
    const next = on ? (muted ?? []).filter((k) => k !== kind) : [...new Set([...(muted ?? []), kind])];
    setMuted(next);
    void fetch("/api/notifications/preferences", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted: next }),
    }).catch(() => {});
  };

  const statusText: Record<string, string> = {
    on: "On",
    off: "Off",
    blocked: "Blocked in this browser",
    unsupported: "Not available in this browser",
    "needs-install": "Add to Home Screen first",
  };

  return (
    <Card>
      <CardHeader className="border-b border-zinc-800/80 pb-4">
        <CardTitle className="text-base font-medium flex items-center gap-2 text-zinc-100">
          <span className="icon-tile flex h-8 w-8 items-center justify-center rounded-full">
            <BellRing className="h-4 w-4" />
          </span>
          {t("Notifications")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-5 sm:p-6">
        {/* This device */}
        <div className="flex items-center gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <span className="icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
            <Smartphone className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-zinc-100">{t("Notifications on this device")}</span>
            <span className={cn("block text-xs font-medium", push.state === "on" ? "text-emerald-600" : push.state === "off" ? "text-zinc-500" : "text-amber-600")}>
              {t(statusText[push.state])}
            </span>
          </span>
          {push.busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          ) : (
            <Switch
              on={push.state === "on"}
              disabled={push.state !== "on" && push.state !== "off"}
              onChange={(v) => void (v ? push.enable() : push.disable())}
              label={t("Notifications on this device")}
            />
          )}
        </div>
        {push.state === "needs-install" && (
          <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700" data-keep>
            {t("iPhone: tap Share → Add to Home Screen, then open Gate Pass from the Home Screen")}
          </p>
        )}
        {push.state === "blocked" && (
          <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700" data-keep>
            {t("Blocked once, so the browser won't ask again. To allow: tap the icon at the left of the web address (or ⋮ → Settings → Site settings) → Notifications → Allow, then reload.")}
          </p>
        )}
        {push.state === "on" && (
          <button
            type="button"
            onClick={() => {
              setTested(true);
              void push.test();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-semibold text-zinc-300 transition-colors hover:border-orange-500/30 hover:text-orange-600"
          >
            <Send className="h-4 w-4" /> {tested ? t("Test sent") : t("Send a test")}
          </button>
        )}

        {/* What to hear about */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-400">{t("Alerts")}</h3>
          <ul className="divide-y divide-zinc-800/70 overflow-hidden rounded-2xl border border-zinc-800/80">
            {kinds.map((kind) => {
              const Icon = KIND_INFO[kind].icon;
              const on = !(muted ?? []).includes(kind);
              return (
                <li key={kind} className="flex items-center gap-3 px-4 py-3">
                  <span className="icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">{t(KIND_INFO[kind].label)}</span>
                  <Switch on={on} disabled={muted === null} onChange={(v) => toggleKind(kind, v)} label={t(KIND_INFO[kind].label)} />
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

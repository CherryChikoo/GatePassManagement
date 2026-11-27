"use client";

import { useState } from "react";
import { BellRing, CalendarClock, Check, Hourglass, Loader2, Moon, RotateCcw, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
import { Time12Input } from "@/components/ui/time-field";
import { Switch } from "@/components/ui/switch";
import { BackButton } from "@/components/ui/back-button";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";
import { cn } from "@/lib/utils";
import type { NotificationTimers } from "@/lib/notifications/config";
import { saveNotificationSettings } from "@/server/actions/notification-config";

/** Section label, as on the dashboards */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">{children}</h2>;
}

/** One setting: coral icon tile, a one-line name, its control on the right */
function Row({ icon: Icon, label, children, dim }: { icon: LucideIcon; label: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center", dim && "opacity-50")}>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="truncate text-[15px] font-medium text-zinc-100">{label}</span>
      </span>
      <div className="flex shrink-0 items-center sm:justify-end">{children}</div>
    </div>
  );
}

export function NotificationsClient({ initial }: { initial: NotificationTimers }) {
  const t = useT();
  const [v, setV] = useState<NotificationTimers>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "done"; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await saveNotificationSettings(v);
      setMsg("error" in res ? { tone: "error", text: res.error } : { tone: "done", text: t("Saved") });
    } catch (err) {
      setMsg({ tone: "error", text: actionErrorMessage(err, t("Could not save")) });
    }
    setSaving(false);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div className="space-y-3">
        <BackButton href="/admin" label="Back to Dashboard" className="-ml-2" />
        <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-zinc-100">{t("Notifications")}</h1>
      </div>

      {msg && (
        <div
          role={msg.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
            msg.tone === "error" ? "border-red-500/20 bg-red-500/10 text-red-500" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
          )}
        >
          {msg.tone === "error" ? <TriangleAlert className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          <span className="font-medium">{msg.text}</span>
        </div>
      )}

      <section className="space-y-3">
        <SectionLabel>{t("Visitors")}</SectionLabel>
        <Card>
          <CardContent className="divide-y divide-zinc-800/70 p-0">
            <Row icon={Hourglass} label={t("Visitor still inside after")}>
              <div className="w-full sm:w-44">
                <ThemedSelect aria-label={t("Visitor still inside after")} value={String(v.overstayHours)} onChange={(e) => setV({ ...v, overstayHours: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>{`${h} ${h === 1 ? "hour" : "hours"}`}</option>
                  ))}
                </ThemedSelect>
              </div>
            </Row>
            <Row icon={RotateCcw} label={t("Remind Security every")}>
              <div className="w-full sm:w-44">
                <ThemedSelect aria-label={t("Remind Security every")} value={String(v.reminderMinutes)} onChange={(e) => setV({ ...v, reminderMinutes: Number(e.target.value) })}>
                  <option value="30">30 min</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                </ThemedSelect>
              </div>
            </Row>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("Hostel")}</SectionLabel>
        <Card>
          <CardContent className="p-0">
            <Row icon={Moon} label={t("Curfew list to wardens at")}>
              <div className="w-full sm:w-64">
                <Time12Input value={v.curfewTime} onChange={(x) => setV({ ...v, curfewTime: x || v.curfewTime })} required />
              </div>
            </Row>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("Summaries")}</SectionLabel>
        <Card>
          <CardContent className="divide-y divide-zinc-800/70 p-0">
            <Row icon={CalendarClock} label={t("Morning summary")}>
              <Switch on={v.summariesOn} onChange={(x) => setV({ ...v, summariesOn: x })} label={t("Morning summary")} />
            </Row>
            <Row icon={BellRing} label={t("Send at")} dim={!v.summariesOn}>
              <div className="w-full sm:w-64">
                <Time12Input value={v.summaryTime} onChange={(x) => setV({ ...v, summaryTime: x || v.summaryTime })} required />
              </div>
            </Row>
            <Row icon={Users} label={t("Mentee alerts")}>
              <Switch on={v.menteeAlertsOn} onChange={(x) => setV({ ...v, menteeAlertsOn: x })} label={t("Mentee alerts")} />
            </Row>
          </CardContent>
        </Card>
      </section>

      <div className="flex justify-end">
        <Button size="lg" onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("Save")}
        </Button>
      </div>
    </div>
  );
}

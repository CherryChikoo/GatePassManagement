"use client";

import { useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { BackButton } from "@/components/ui/back-button";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";
import type { NotificationTimers } from "@/lib/notifications/config";
import { saveNotificationSettings } from "@/server/actions/notification-config";

/** Section label, as on the dashboards */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">{children}</h2>;
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-orange-500" />
    </label>
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
    <div className="space-y-6 animate-fade-in">
      <BackButton href="/admin" />
      <div>
        <h1 className="text-3xl font-light">{t("Notifications")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("When the portal reminds people. Times are India time.")}</p>
      </div>

      {msg && (
        <div
          role={msg.tone === "error" ? "alert" : "status"}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
            msg.tone === "error" ? "border-red-500/20 bg-red-500/10 text-red-500" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {msg.tone === "error" ? <TriangleAlert className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          <span className="font-medium">{msg.text}</span>
        </div>
      )}

      <div className="space-y-3">
        <SectionLabel>{t("Visitors")}</SectionLabel>
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="field-label text-sm font-medium text-zinc-300">{t("Alert Security when a visitor stays inside longer than")}</label>
              <ThemedSelect aria-label={t("Overstay hours")} value={String(v.overstayHours)} onChange={(e) => setV({ ...v, overstayHours: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>{`${h} ${h === 1 ? "hour" : "hours"}`}</option>
                ))}
              </ThemedSelect>
            </div>
            <div className="flex flex-col gap-1">
              <label className="field-label text-sm font-medium text-zinc-300">{t("Then remind every")}</label>
              <ThemedSelect aria-label={t("Reminder")} value={String(v.reminderMinutes)} onChange={(e) => setV({ ...v, reminderMinutes: Number(e.target.value) })}>
                <option value="30">30 min</option>
                <option value="60">60 min</option>
                <option value="120">120 min</option>
              </ThemedSelect>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <SectionLabel>{t("Hostel")}</SectionLabel>
        <Card>
          <CardContent className="p-5">
            <Input label={t("Curfew time (wardens are told who is not back)")} type="time" value={v.curfewTime} onChange={(e) => setV({ ...v, curfewTime: e.target.value })} wrapperClassName="sm:max-w-xs" />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <SectionLabel>{t("Summaries and mentees")}</SectionLabel>
        <Card>
          <CardContent className="space-y-4 p-5">
            <Toggle label={t("Morning summary")} hint={t("HODs, Deans and the Director get yesterday's numbers")} on={v.summariesOn} onChange={(x) => setV({ ...v, summariesOn: x })} />
            {v.summariesOn && (
              <Input label={t("Send at")} type="time" value={v.summaryTime} onChange={(e) => setV({ ...v, summaryTime: e.target.value })} wrapperClassName="sm:max-w-xs" />
            )}
            <Toggle label={t("Mentee alerts")} hint={t("Tell mentors when their mentees are out or late")} on={v.menteeAlertsOn} onChange={(x) => setV({ ...v, menteeAlertsOn: x })} />
          </CardContent>
        </Card>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("Save")}
      </Button>
    </div>
  );
}

"use client";

/**
 * "Meeting (faculty / staff)": a plain dropdown of the portal's faculty / staff
 * (grouped by department or role). Optional — left empty when the visitor came
 * for a student or other work, and then no meeting code is made. The value is
 * the picked person's profile id.
 */
import { ThemedSelect } from "@/components/ui/themed-select";
import { useEffect, useState } from "react";
import { useT } from "@/components/providers/language-provider";
import type { VisitHostOption } from "@/server/actions/visits";
import { callGate } from "@/lib/gate-call";

// Fetched once and shared by every picker for 5 minutes
let hostsCache: { at: number; list: Promise<VisitHostOption[]> } | null = null;
function loadHosts(): Promise<VisitHostOption[]> {
  if (!hostsCache || Date.now() - hostsCache.at > 5 * 60_000) {
    hostsCache = {
      at: Date.now(),
      list: callGate("getVisitHostOptions", [], 15_000).catch(() => {
        hostsCache = null;
        return [];
      }),
    };
  }
  return hostsCache.list;
}

const selectCls =
  "flex h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [&>option]:bg-zinc-900 [&_optgroup]:bg-zinc-900";

export function HostPicker({ id, value, onChange }: { id: string; value: string; onChange: (profileId: string) => void }) {
  const t = useT();
  const [hosts, setHosts] = useState<VisitHostOption[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadHosts().then((list) => alive && setHosts(list));
    return () => {
      alive = false;
    };
  }, []);

  // Department (faculty, HODs) or role (Dean, Director, Warden…) groups, A-Z
  const groups = new Map<string, VisitHostOption[]>();
  for (const h of hosts ?? []) {
    const g = h.department || h.title;
    groups.set(g, [...(groups.get(g) ?? []), h]);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <ThemedSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={hosts === null} className={selectCls}>
      <option value="">{hosts === null ? t("Loading…") : t("— Not meeting faculty / staff —")}</option>
      {sorted.map(([group, people]) => (
        <optgroup key={group} label={group}>
          {people.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
              {h.department && h.title ? ` — ${h.title}` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </ThemedSelect>
  );
}

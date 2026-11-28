"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, DoorOpen, FileText, Loader2, ShieldCheck, ShieldX, Smartphone, UserRound, X, type LucideIcon, Send } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { useOwnLive } from "@/lib/realtime/live";
import { autoAskOnFirstTap, syncPush, usePush } from "@/lib/push/client";
import { IphoneAlertsHint } from "./iphone-alerts-hint";
import { cn } from "@/lib/utils";

type Note = {
  id: string;
  kind: string;
  level: "URGENT" | "IMPORTANT" | "INFO" | string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

const ICONS: Record<string, LucideIcon> = { request: FileText, pass: ShieldCheck, scan: DoorOpen, visitor: UserRound, system: Bell };
const iconFor = (n: Note) => (n.kind === "pass" && n.title.toLowerCase().includes("reject") ? ShieldX : ICONS[n.kind] ?? Bell);

/** "now", "5 min", "2 h", "3 d" */
function ago(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/**
 * The bell (every login): unread count, a glass panel with the newest 30, and
 * a short on-screen alert when a new Important / Urgent one arrives while the
 * portal is open. Updates on the person's live "notify" ping — never polled.
 */
export function NotificationBell({ showTest = true }: { showTest?: boolean } = {}) {
  const t = useT();
  const router = useRouter();
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Note | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const push = usePush();
  const [testState, setTestState] = useState<"idle" | "sending" | "sent">("idle");
  // Phone notifications already allowed on this device: kept saved for whoever is signed in now
  useEffect(() => {
    void syncPush();
    // Alerts on by default: the first tap asks the browser once
    autoAskOnFirstTap();
  }, []);
  // A device notification tapped while the portal is open: go to its screen in place
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; link?: string } | null;
      if (d?.type === "gatepass:open" && typeof d.link === "string" && d.link.startsWith("/")) router.push(d.link);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Note[]; unread: number };
      const list = data.items ?? [];
      // A new Important / Urgent one since the last look: shown on screen for a few seconds
      if (seen.current) {
        const fresh = list.find((n) => !n.readAt && n.level !== "INFO" && !seen.current!.has(n.id));
        if (fresh) setToast(fresh);
      }
      seen.current = new Set(list.map((n) => n.id));
      setItems(list);
      setUnread(data.unread ?? 0);
      setNow(Date.now());
    } catch {
      // offline for a moment: the next ping or visit loads it
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // The person's own live topic: "notify" when one arrives ("*" after a reconnect)
  useOwnLive((changed) => {
    if (changed.includes("notify") || changed.includes("*")) void load();
  });

  // The on-screen alert leaves by itself
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.level === "URGENT" ? 10_000 : 6_000);
    return () => clearTimeout(id);
  }, [toast]);

  // Close on a tap outside / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = async (body: { ids?: string[]; all?: boolean }) => {
    const ids = body.ids;
    setItems((list) => list.map((n) => (body.all || ids?.includes(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    setUnread((u) => (body.all ? 0 : Math.max(0, u - (ids?.length ?? 0))));
    await fetch("/api/notifications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  const openNote = (n: Note) => {
    if (!n.readAt) void markRead({ ids: [n.id] });
    setOpen(false);
    setToast(null);
    if (n.link) router.push(n.link);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setNow(Date.now());
        }}
        aria-label={unread ? `${t("Notifications")} (${unread})` : t("Notifications")}
        aria-expanded={open}
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors",
          open ? "border-orange-500/20 bg-orange-500/10 text-orange-500" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-950 hover:text-zinc-200"
        )}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-r from-[#f2492f] to-[#b82c18] px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("Notifications")}
            className="fixed inset-x-3 top-[4.75rem] z-[70] flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-[26px] glass shadow-[0_24px_60px_-20px_rgba(16,24,40,0.35)] animate-scale-in sm:inset-x-auto sm:right-6 sm:w-[400px]"
          >
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
              <h2 className="text-base font-semibold text-zinc-100">{t("Notifications")}</h2>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markRead({ all: true })}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-500/10"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> {t("Mark all read")}
                </button>
              )}
            </div>
            {push.state === "off" && (
              <div className="mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.06] p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                  <Smartphone className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">{t("Get alerts on this device")}</span>
                <button
                  type="button"
                  onClick={() => void push.enable()}
                  disabled={push.busy}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#f2492f] to-[#b82c18] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] disabled:opacity-60"
                >
                  {push.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t("Turn on")}
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
              {items.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500">
                    <Bell className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-zinc-400">{t("You're all caught up")}</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {items.map((n) => {
                    const Icon = iconFor(n);
                    const unreadNote = !n.readAt;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNote(n)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
                            unreadNote ? "bg-orange-500/[0.06] hover:bg-orange-500/10" : "hover:bg-zinc-950"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                              n.level === "URGENT" ? "bg-gradient-to-br from-[#f2492f] to-[#b82c18] text-white" : "bg-orange-500/10 text-orange-500"
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={cn("truncate text-sm", unreadNote ? "font-semibold text-zinc-100" : "font-medium text-zinc-300")}>{t(n.title)}</span>
                              <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{ago(n.createdAt, now)}</span>
                            </span>
                            {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-zinc-500">{n.body}</span>}
                          </span>
                          {unreadNote && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-label="Unread" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {/* Test (every login except Security): arrives in 5 s — in the bell, and on the device if the portal is closed */}
            {showTest && (
              <div className="border-t border-zinc-800/70 p-3">
                <button
                  type="button"
                  disabled={testState === "sending"}
                  onClick={() => {
                    setTestState("sending");
                    void push.test().finally(() => setTestState("sent"));
                  }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#ff6a55] to-[#d23420] text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_20px_-12px_rgba(207,62,37,0.7)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98] disabled:opacity-70"
                >
                  {testState === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {testState === "idle" ? t("Send a test notification") : testState === "sending" ? t("Arrives in 5 seconds…") : t("Test sent")}
                </button>
              </div>
            )}
          </div>,
          document.body
        )}

      {toast &&
        !open &&
        createPortal(
          <div className="fixed inset-x-3 top-[4.75rem] z-[75] flex justify-center sm:inset-x-auto sm:right-6 sm:w-[380px]" role="status" data-keep>
            <div className="flex w-full items-start gap-3 rounded-[22px] glass p-3.5 shadow-[0_24px_60px_-20px_rgba(16,24,40,0.4)] animate-slide-in">
              <button type="button" onClick={() => openNote(toast)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                    toast.level === "URGENT" ? "bg-gradient-to-br from-[#f2492f] to-[#b82c18] text-white" : "bg-orange-500/10 text-orange-500"
                  )}
                >
                  {(() => {
                    const Icon = iconFor(toast);
                    return <Icon className="h-[18px] w-[18px]" />;
                  })()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-100">{t(toast.title)}</span>
                  {toast.body && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-zinc-500">{toast.body}</span>}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label={t("Close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-950 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>,
          document.body
        )}
      {/* iPhone / iPad: how to get alerts (once) */}
      <IphoneAlertsHint />
    </>
  );
}

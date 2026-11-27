/**
 * Phone / desktop notifications (Web Push, free): sent to every device the
 * person turned them on for. The browser's own push service delivers them
 * even when the portal is closed. When the portal is open on screen, the
 * service worker (public/sw.js) shows nothing — the in-portal alert does.
 *
 * Devices that are gone (uninstalled browser, cleared data) answer 404 / 410
 * and are removed, so the list never grows stale.
 */
import webpush from "web-push";
import { prisma } from "@/lib/db/prisma";

export type PushNote = { profileId: string; title: string; body?: string | null; link?: string | null; level: string; kind: string; dedupeKey: string };

let ready: boolean | null = null;
function configured(): boolean {
  if (ready !== null) return ready;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "https://gate-pass-management-psi.vercel.app";
  ready = !!(pub && priv);
  if (ready) webpush.setVapidDetails(subject.startsWith("http") || subject.startsWith("mailto:") ? subject : `mailto:${subject}`, pub!, priv!);
  else console.warn("[push] VAPID keys missing: phone notifications are off");
  return ready;
}

/** Sends these notifications to their people's devices (Important / Urgent only) */
export async function deliverPush(notes: PushNote[]) {
  const wanted = notes.filter((n) => n.level === "URGENT" || n.level === "IMPORTANT");
  if (!wanted.length || !configured()) return;
  const subs = await prisma.pushSubscription.findMany({
    where: { profileId: { in: [...new Set(wanted.map((n) => n.profileId))] } },
    select: { id: true, profileId: true, endpoint: true, p256dh: true, auth: true },
  });
  if (!subs.length) return;
  const byProfile = new Map<string, typeof subs>();
  for (const s of subs) byProfile.set(s.profileId, [...(byProfile.get(s.profileId) ?? []), s]);

  const gone: string[] = [];
  const used: string[] = [];
  const jobs: Promise<void>[] = [];
  for (const n of wanted) {
    const payload = JSON.stringify({
      title: n.title,
      body: n.body ?? "",
      link: n.link ?? "/",
      level: n.level,
      kind: n.kind,
      // Same kind replaces the older one on the phone (no pile of 10 "New pass request")
      tag: `${n.kind}:${n.dedupeKey}`,
    });
    for (const s of byProfile.get(n.profileId) ?? []) {
      jobs.push(
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: n.level === "URGENT" ? 4 * 3600 : 3600,
            urgency: n.level === "URGENT" ? "high" : "normal",
            timeout: 8_000,
          })
          .then(() => void used.push(s.id))
          .catch((err: { statusCode?: number; message?: string }) => {
            if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(s.id);
            else console.warn("[push] send failed:", err?.statusCode ?? "", err?.message ?? "");
          })
      );
    }
  }
  await Promise.all(jobs);
  if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } }).catch(() => {});
  if (used.length) await prisma.pushSubscription.updateMany({ where: { id: { in: used } }, data: { lastUsedAt: new Date() } }).catch(() => {});
}

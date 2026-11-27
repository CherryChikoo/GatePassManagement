/**
 * Notifications (server side): one row per person in the notifications table,
 * then a live ping on that person's private topic ("notify") so their bell and
 * on-screen alert update at once. Never sent twice: each has a dedupe key.
 * Runs after the response (see `later` in realtime/notify.ts) — a failure here
 * never fails the save that caused it.
 */
import { prisma } from "@/lib/db/prisma";
import { deliverPush } from "./push";

export type NoteLevel = "URGENT" | "IMPORTANT" | "INFO";
export type NoteInput = {
  profileId: string;
  /** For the live ping (the person's auth user id) */
  userId: string;
  kind: "request" | "pass" | "scan" | "visitor" | "system";
  level: NoteLevel;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey: string;
};

type Ping = (userIds: string[], topics: string[]) => Promise<void>;

/** Saves the notifications (skipping any already sent) and pings their people */
export async function saveNotifications(input: NoteInput[], ping: Ping) {
  let notes = input;
  if (!notes.length) return;
  try {
    // Only what is new: an event seen again (same dedupe key) is never stored, pinged or pushed twice
    const existing = await prisma.notification.findMany({
      where: { dedupeKey: { in: [...new Set(notes.map((n) => n.dedupeKey))] }, profileId: { in: [...new Set(notes.map((n) => n.profileId))] } },
      select: { profileId: true, dedupeKey: true },
    });
    const had = new Set(existing.map((e) => `${e.profileId}|${e.dedupeKey}`));
    // What each person muted (Urgent always comes through)
    const prefs = await prisma.notificationPreference
      .findMany({ where: { profileId: { in: [...new Set(notes.map((n) => n.profileId))] } }, select: { profileId: true, muted: true } })
      .catch(() => []);
    const muted = new Map(prefs.map((p) => [p.profileId, new Set(p.muted)]));
    const fresh = notes.filter(
      (n) => !had.has(`${n.profileId}|${n.dedupeKey}`) && (n.level === "URGENT" || !muted.get(n.profileId)?.has(n.kind))
    );
    if (!fresh.length) return;
    notes = fresh;
    await prisma.notification.createMany({
      data: notes.map((n) => ({
        profileId: n.profileId,
        kind: n.kind,
        level: n.level,
        title: n.title.slice(0, 120),
        body: n.body ? n.body.slice(0, 300) : null,
        link: n.link ?? null,
        dedupeKey: n.dedupeKey,
      })),
      skipDuplicates: true,
    });
    await ping([...new Set(notes.map((n) => n.userId))], ["notify"]);
    // Phones / desktops (Important and Urgent only)
    await deliverPush(notes).catch((err: any) => console.warn("[notify] push failed:", err?.message));
  } catch (err: any) {
    console.warn("[notify] could not save notifications:", err?.message);
  }
}

/** A request decided / cancelled: its "New pass request" notifications are done for everyone */
export async function settleNotifications(dedupeKeys: string[]) {
  if (!dedupeKeys.length) return;
  try {
    await prisma.notification.updateMany({ where: { dedupeKey: { in: dedupeKeys }, readAt: null }, data: { readAt: new Date() } });
  } catch (err: any) {
    console.warn("[notify] could not settle notifications:", err?.message);
  }
}

/** The approver's request list for their login */
export function requestsLinkFor(role: string): string {
  switch (role) {
    case "WARDEN":
      return "/warden/requests";
    case "FACULTY_ADMIN":
      return "/faculty-admin/requests";
    case "DEAN":
      return "/dean/requests";
    case "DIRECTOR":
      return "/director/requests";
    case "FACULTY":
      return "/faculty/requests";
    default:
      return "/";
  }
}

/** The pass holder's own pass screen */
export function passLinkFor(role: string): string {
  switch (role) {
    case "STUDENT":
      return "/student";
    case "FACULTY":
      return "/faculty/apply";
    case "FACULTY_ADMIN":
      return "/faculty-admin/apply";
    default:
      return "/";
  }
}

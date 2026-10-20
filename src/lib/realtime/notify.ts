/**
 * Live updates for the gate screens (server side).
 *
 * After a change, the server sends a tiny "this changed" ping — topic names
 * only, never any data — on a private Supabase Realtime broadcast channel.
 * Open Security / Admin / Supervisor screens that show that data reload it
 * (see src/lib/realtime/live.ts). No polling: screens only fetch when
 * something actually changed, which keeps Vercel and Supabase usage low.
 *
 * Topics:
 *   reg:<REGISTER_KEY>  a register's records (add, In/Out, edit, status…)
 *   gate                gate scans and pass approvals (faculty / outing books, log)
 *   visitors            visitors registered / checked out / edited
 *   attendance          staff attendance marks and remarks
 *
 * Pass holders (students / faculty) get their own private topic, user:<id>,
 * with "pass:<id>" when their pass is approved, rejected or scanned — their
 * open pass screen updates at once (notifyPassHolder).
 *
 * The channel is private: only the server (service key) can send, and only
 * signed-in gate staff can listen — see prisma/migrations/realtime_live_updates.sql.
 * Sending happens after the response, so saving is never slowed down, and a
 * failed ping only means screens refresh on their next open / tab focus.
 */
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { LIVE_CHANNEL, LIVE_EVENT, personalTopic } from "./topics";

type Message = { topic: string; topics: string[] };

async function sendMessages(messages: Message[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !messages.length) return;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({ topic: m.topic, event: LIVE_EVENT, payload: { topics: m.topics }, private: true })),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) console.warn("[live] broadcast failed:", res.status);
  } catch (err: any) {
    console.warn("[live] broadcast failed:", err?.message);
  }
}

/** Runs after the response (or straight away outside a request, e.g. scripts). */
function later(job: () => Promise<void>) {
  try {
    after(job);
  } catch {
    void job();
  }
}

/** Tell open gate screens that these topics changed (sent after the response). */
export function notifyLive(...topics: string[]) {
  const list = [...new Set(topics.filter(Boolean))];
  if (!list.length) return;
  later(() => sendMessages([{ topic: LIVE_CHANNEL, topics: list }]));
}

/**
 * Tell the pass holder (student or faculty member) that their pass changed —
 * approved, rejected, scanned at the gate… — on their own private topic, so an
 * open pass screen updates at once without checking every few seconds.
 */
export function notifyPassHolder(...permissionIds: string[]) {
  const ids = [...new Set(permissionIds.filter(Boolean))];
  if (!ids.length) return;
  later(async () => {
    try {
      const rows = await prisma.permission.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          student: { select: { profile: { select: { userId: true } } } },
          faculty: { select: { profile: { select: { userId: true } } } },
        },
      });
      const messages = rows.flatMap((r) => {
        const userId = r.student?.profile.userId ?? r.faculty?.profile.userId;
        return userId ? [{ topic: personalTopic(userId), topics: [`pass:${r.id}`] }] : [];
      });
      await sendMessages(messages);
    } catch (err: any) {
      console.warn("[live] pass ping failed:", err?.message);
    }
  });
}

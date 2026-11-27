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
 * open pass screen updates at once (notifyPassHolder). Approvers (HOD, Dean,
 * warden) get "requests" on theirs when a request for them arrives, is
 * cancelled or is decided (notifyApprovers) — their request list reloads.
 *
 * The channel is private: only the server (service key) can send, and only
 * signed-in gate staff can listen — see prisma/migrations/realtime_live_updates.sql.
 * Sending happens after the response, so saving is never slowed down, and a
 * failed ping only means screens refresh on their next open / tab focus.
 */
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";
import { LIVE_CHANNEL, LIVE_EVENT, personalTopic } from "./topics";
import { passLinkFor, requestsLinkFor, saveNotifications, settleNotifications, type NoteInput } from "@/lib/notifications/send";

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

/** Ping one private topic (e.g. a user's own user:<id> topic) with these topic names. */
export function notifyTopic(topic: string, ...topics: string[]) {
  const list = [...new Set(topics.filter(Boolean))];
  if (!topic || !list.length) return;
  later(() => sendMessages([{ topic, topics: list }]));
}

/** Pings these people's own private topics with these topic names */
async function pingUsers(userIds: string[], topics: string[]) {
  await sendMessages([...new Set(userIds)].map((u) => ({ topic: personalTopic(u), topics })));
}

/** Same ping, for callers outside a request (the timed-alerts tick) */
export async function pingUsersNow(userIds: string[], topics: string[]) {
  await pingUsers(userIds, topics);
}

/** Short date for messages: "28 Nov" */
const shortDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d) : "";

/**
 * Tell the pass holder (student or faculty member) that their pass changed —
 * approved, rejected, scanned at the gate… — on their own private topic, so an
 * open pass screen updates at once without checking every few seconds. The
 * change is also kept as a notification (bell / alert): approved and rejected
 * are Important, gate scans are Info.
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
          status: true,
          type: true,
          exitDate: true,
          rejectionReason: true,
          student: { select: { profile: { select: { id: true, userId: true, role: true } } } },
          faculty: { select: { profile: { select: { id: true, userId: true, role: true } } } },
        },
      });
      const messages = rows.flatMap((r) => {
        const userId = r.student?.profile.userId ?? r.faculty?.profile.userId;
        return userId ? [{ topic: personalTopic(userId), topics: [`pass:${r.id}`] }] : [];
      });
      await sendMessages(messages);

      const notes: NoteInput[] = [];
      for (const r of rows) {
        const who = r.student?.profile ?? r.faculty?.profile;
        if (!who) continue;
        const link = passLinkFor(who.role);
        const day = shortDate(r.exitDate);
        const base = { profileId: who.id, userId: who.userId, link, dedupeKey: `pass:${r.id}:${r.status}` };
        if (r.status === "APPROVED") {
          notes.push({ ...base, kind: "pass", level: "IMPORTANT", title: "Pass approved", body: day ? `For ${day} · show your QR at the gate` : "Show your QR at the gate" });
        } else if (r.status === "REJECTED") {
          notes.push({ ...base, kind: "pass", level: "IMPORTANT", title: "Pass rejected", body: r.rejectionReason || null });
        } else if (r.status === "EXITED") {
          notes.push({ ...base, kind: "scan", level: "INFO", title: "Exit recorded at the gate", body: null });
        } else if (r.status === "COMPLETED") {
          notes.push({ ...base, kind: "scan", level: "INFO", title: r.type === "ENTRY" ? "Entry recorded" : "Back on campus", body: null });
        }
      }
      await saveNotifications(notes, pingUsers);
    } catch (err: any) {
      console.warn("[live] pass ping failed:", err?.message);
    }
  });
}

type Approver = { userId: string; profileId: string; role: string };

/**
 * Tell the approvers of these requests that their request list changed (new
 * request, cancelled, or decided by the other approver), on their own private
 * topic — their open screens reload just the requests, without polling.
 * Who: the routed approver (warden / HOD / faculty), plus for faculty passes the
 * Dean and the HODs of that faculty member's department, and for student passes
 * routed to an HOD every HOD of that student's department (all of them see and
 * can decide those requests).
 * A request still waiting is also a "New pass request" notification for each of
 * them; once decided or cancelled, those notifications are marked done for all.
 */
export function notifyApprovers(...permissionIds: string[]) {
  const ids = [...new Set(permissionIds.filter(Boolean))];
  if (!ids.length) return;
  later(async () => {
    try {
      const rows = await prisma.permission.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          status: true,
          purpose: true,
          approverType: true,
          approverId: true,
          faculty: { select: { department: true, profile: { select: { id: true, name: true } } } },
          student: { select: { department: true, studentRoll: true, profile: { select: { name: true } } } },
        },
      });
      const profileSel = { id: true, userId: true, role: true } as const;

      const pings = new Set<string>();
      const notes: NoteInput[] = [];
      const settled: string[] = [];
      for (const r of rows) {
        const facultyDepts = r.faculty?.department ? [r.faculty.department] : [];
        // HODs see their whole department: faculty passes, and student passes routed to an HOD
        const studentDepts = r.approverType === "FACULTY_ADMIN" && r.student?.department ? [r.student.department] : [];
        const hodDepts = [...new Set([...facultyDepts, ...studentDepts].flatMap((d) => [d, ...getDepartmentVariants(d)]))];
        const [warden, approver, deansAndHods] = await Promise.all([
          r.approverType === "WARDEN" && r.approverId
            ? prisma.warden.findUnique({ where: { id: r.approverId }, select: { profile: { select: profileSel } } })
            : null,
          // approverId is a profile id (HOD / Dean) or a faculty id, depending on the route
          r.approverType !== "WARDEN" && r.approverId
            ? prisma.profile.findFirst({ where: { OR: [{ id: r.approverId }, { faculty: { id: r.approverId } }] }, select: profileSel })
            : null,
          hodDepts.length
            ? prisma.profile.findMany({
                where: {
                  active: true,
                  OR: [
                    ...(facultyDepts.length ? [{ role: "DEAN" as const }] : []),
                    { role: "FACULTY_ADMIN" as const, faculty: { department: { in: hodDepts } } },
                  ],
                },
                select: profileSel,
              })
            : [],
        ]);
        const people = new Map<string, Approver>();
        for (const p of [warden?.profile, approver, ...deansAndHods]) {
          if (p) people.set(p.userId, { userId: p.userId, profileId: p.id, role: p.role });
        }
        // Never told about their own pass (an HOD asking for leave)
        const own = r.faculty?.profile.id;
        for (const [u, p] of people) if (p.profileId === own) people.delete(u);
        for (const u of people.keys()) pings.add(u);

        const key = `req:${r.id}`;
        if (r.status === "PENDING") {
          const name = r.student?.profile.name ?? r.faculty?.profile.name ?? "Someone";
          const who = r.student?.studentRoll ? `${name} (${r.student.studentRoll})` : name;
          for (const p of people.values()) {
            notes.push({
              profileId: p.profileId,
              userId: p.userId,
              kind: "request",
              level: "IMPORTANT",
              title: "New pass request",
              body: r.purpose ? `${who} · ${r.purpose}` : who,
              link: requestsLinkFor(p.role),
              dedupeKey: key,
            });
          }
        } else {
          settled.push(key);
        }
      }
      await sendMessages([...pings].map((u) => ({ topic: personalTopic(u), topics: ["requests"] })));
      await settleNotifications(settled);
      await saveNotifications(notes, pingUsers);
    } catch (err: any) {
      console.warn("[live] approver ping failed:", err?.message);
    }
  });
}

/** A visitor registered at the gate to meet this person: an Urgent notification for them */
export function notifyVisitorForHost(hostProfileId: string | null | undefined, visitorName: string, visitKey: string) {
  if (!hostProfileId) return;
  later(async () => {
    try {
      const host = await prisma.profile.findUnique({ where: { id: hostProfileId }, select: { id: true, userId: true } });
      if (!host) return;
      await saveNotifications(
        [
          {
            profileId: host.id,
            userId: host.userId,
            kind: "visitor",
            level: "URGENT",
            title: "Visitor at the gate",
            body: `${visitorName.trim() || "A visitor"} came to meet you`,
            link: "/my-visitors",
            dedupeKey: `visit:${visitKey}`,
          },
        ],
        pingUsers
      );
    } catch (err: any) {
      console.warn("[notify] visitor notification failed:", err?.message);
    }
  });
}

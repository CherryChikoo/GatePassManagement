/**
 * Timed alerts, run by /api/cron/notify-tick every 5 minutes (Supabase pg_cron).
 * Every alert has a dedupe key, so running twice (or every 5 minutes) never
 * sends the same one again. All days and times are IST. Server only.
 */
import { prisma } from "@/lib/db/prisma";
import { getDepartmentVariants } from "@/lib/constants";
import { istDateString, istDateTime, istDayRange } from "@/lib/time/ist";
import { checkerBooks } from "@/lib/registers/definitions";
import { pingUsersNow } from "@/lib/realtime/notify";
import { passLinkFor, requestsLinkFor, saveNotifications, type NoteInput } from "./send";
import { getNotificationTimers, type NotificationTimers } from "./config";

const MIN = 60_000;
const DAY = 86_400_000;
const REQUEST_WAIT_MIN = 60;
const VERIFY_DAYS = 60;

type Person = { id: string; userId: string; role: string };
const personSel = { id: true, userId: true, role: true } as const;

/** Same "expects a return" rule as the dashboards (faculty and hostellers) */
const returnPass = { OR: [{ facultyId: { not: null } }, { student: { studentType: "HOSTELLER" as const } }] };

const hm = (min: number) => `${Math.floor(min / 60)} h ${min % 60} min`;

/** Drops the notes already sent (same person + key), so a tick only pings new ones */
async function onlyNew(notes: NoteInput[]): Promise<NoteInput[]> {
  if (!notes.length) return [];
  const keys = [...new Set(notes.map((n) => n.dedupeKey))];
  const profiles = [...new Set(notes.map((n) => n.profileId))];
  const rows = await prisma.notification.findMany({
    where: { dedupeKey: { in: keys }, profileId: { in: profiles } },
    select: { profileId: true, dedupeKey: true },
  });
  const have = new Set(rows.map((r) => `${r.profileId}|${r.dedupeKey}`));
  return notes.filter((n) => !have.has(`${n.profileId}|${n.dedupeKey}`));
}

/** A placeholder note, only used to ask "was this already sent today?" before counting */
const probe = (p: { id: string; userId: string }, dedupeKey: string): NoteInput => ({
  profileId: p.id,
  userId: p.userId,
  kind: "system",
  level: "INFO",
  title: "",
  dedupeKey,
});

/** a. Visitors still inside longer than the limit: Security */
async function visitorOverstay(cfg: NotificationTimers, now: Date): Promise<NoteInput[]> {
  const limitMin = cfg.overstayHours * 60;
  const visitors = await prisma.outsider.findMany({
    where: { status: "INSIDE", entryTime: { lt: new Date(now.getTime() - limitMin * MIN) } },
    select: { id: true, name: true, entryTime: true, visitingStudent: true, visitPass: { select: { hostName: true } } },
    orderBy: { entryTime: "asc" },
    take: 100,
  });
  if (!visitors.length) return [];
  const guards = await prisma.profile.findMany({ where: { role: "SECURITY", active: true }, select: personSel, take: 200 });
  const notes: NoteInput[] = [];
  for (const v of visitors) {
    const elapsed = Math.floor((now.getTime() - v.entryTime.getTime()) / MIN);
    const n = Math.floor((elapsed - limitMin) / cfg.reminderMinutes);
    const meets = v.visitPass?.hostName || v.visitingStudent;
    const body = `${v.name} · inside ${hm(elapsed)}${meets ? ` · to meet ${meets}` : ""}`;
    for (const g of guards) {
      notes.push({
        profileId: g.id,
        userId: g.userId,
        kind: "visitor",
        level: "URGENT",
        title: "Visitor still inside",
        body,
        link: "/security/visitors",
        dedupeKey: `overstay:${v.id}:${n}`,
      });
    }
  }
  return notes;
}

/** b. Pass holders: return due soon / overdue */
async function passHolders(now: Date, todayStart: Date): Promise<NoteInput[]> {
  const soon = new Date(now.getTime() + 30 * MIN);
  // Only recent lateness: an old stale pass is not announced out of the blue
  const recent = new Date(now.getTime() - 2 * DAY);
  const rows = await prisma.permission.findMany({
    where: {
      status: "EXITED",
      ...returnPass,
      AND: [
        {
          OR: [
            { expectedReturn: { gte: recent, lte: soon } },
            { expectedReturn: null, endDate: { gte: recent, lt: todayStart } },
          ],
        },
      ],
    },
    select: {
      id: true,
      expectedReturn: true,
      student: { select: { profile: { select: personSel } } },
      faculty: { select: { profile: { select: personSel } } },
    },
    take: 1000,
  });
  const notes: NoteInput[] = [];
  for (const r of rows) {
    const who = r.student?.profile ?? r.faculty?.profile;
    if (!who) continue;
    const base = { profileId: who.id, userId: who.userId, kind: "pass" as const, link: passLinkFor(who.role) };
    const left = r.expectedReturn ? Math.ceil((r.expectedReturn.getTime() - now.getTime()) / MIN) : -1;
    if (r.expectedReturn && left > 0) {
      const at = r.expectedReturn.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
      notes.push({ ...base, level: "IMPORTANT", title: "Return in 30 min", body: `Be back by ${at}`, dedupeKey: `due-soon:${r.id}` });
    } else {
      notes.push({ ...base, level: "URGENT", title: "You are overdue", body: "Your return time has passed", dedupeKey: `overdue:${r.id}` });
    }
  }
  return notes;
}

/** c. Wardens: hostellers still out after curfew (once a day) */
async function curfew(cfg: NotificationTimers, now: Date, today: string): Promise<NoteInput[]> {
  const at = istDateTime(today, cfg.curfewTime);
  if (!at || now < at) return [];
  const wardens = await prisma.warden.findMany({ where: { profile: { active: true } }, select: { id: true, profile: { select: personSel } }, take: 200 });
  const fresh = new Set((await onlyNew(wardens.map((w) => probe(w.profile, `curfew:${w.profile.id}:${today}`)))).map((n) => n.profileId));
  if (!fresh.size) return [];
  const out = await prisma.permission.findMany({
    where: { status: "EXITED", student: { studentType: "HOSTELLER", wardenId: { not: null } } },
    select: { student: { select: { wardenId: true, profile: { select: { name: true } } } } },
    take: 3000,
  });
  const byWarden = new Map<string, Set<string>>();
  for (const p of out) {
    const w = p.student?.wardenId;
    if (!w || !p.student) continue;
    const set = byWarden.get(w) ?? new Set<string>();
    set.add(p.student.profile.name);
    byWarden.set(w, set);
  }
  const notes: NoteInput[] = [];
  for (const w of wardens) {
    const names = [...(byWarden.get(w.id) ?? [])];
    if (!names.length || !fresh.has(w.profile.id)) continue;
    notes.push({
      profileId: w.profile.id,
      userId: w.profile.userId,
      kind: "pass",
      level: "IMPORTANT",
      title: `${names.length} hostellers not back by curfew`,
      body: names.slice(0, 5).join(", ") + (names.length > 5 ? ` +${names.length - 5} more` : ""),
      link: "/warden/activity",
      dedupeKey: `curfew:${w.profile.id}:${today}`,
    });
  }
  return notes;
}

/** d. Morning summary for HOD / Dean / Director */
async function morningSummary(cfg: NotificationTimers, now: Date, today: string): Promise<NoteInput[]> {
  if (!cfg.summariesOn) return [];
  const at = istDateTime(today, cfg.summaryTime);
  if (!at || now < at) return [];
  const people = await prisma.profile.findMany({
    where: { active: true, role: { in: ["FACULTY_ADMIN", "DEAN", "DIRECTOR"] } },
    select: { ...personSel, faculty: { select: { department: true } } },
    take: 200,
  });
  const fresh = new Set((await onlyNew(people.map((p) => probe(p, `summary:${p.id}:${today}`)))).map((n) => n.profileId));
  const todo = people.filter((p) => fresh.has(p.id));
  if (!todo.length) return [];

  const { start: todayStart } = istDayRange(now);
  const yesterday = { gte: new Date(todayStart.getTime() - DAY), lt: todayStart };
  const notes: NoteInput[] = [];
  for (const p of todo) {
    const dept = p.faculty?.department;
    const variants = dept ? [dept, ...getDepartmentVariants(dept)] : [];
    if (p.role === "FACULTY_ADMIN" && !variants.length) continue;
    // HOD: their department; Dean: faculty passes; Director: whole campus
    const scope =
      p.role === "FACULTY_ADMIN"
        ? { OR: [{ student: { department: { in: variants } } }, { faculty: { department: { in: variants } } }] }
        : p.role === "DEAN"
          ? { facultyId: { not: null } }
          : {};
    const [out, overdue, visitors] = await Promise.all([
      prisma.permission.count({ where: { ...scope, status: { in: ["EXITED", "COMPLETED"] }, exitDate: yesterday } }),
      prisma.permission.count({
        where: { AND: [scope, { status: "EXITED" }, returnPass, { OR: [{ expectedReturn: { lt: now } }, { expectedReturn: null, endDate: { lt: todayStart } }] }] },
      }),
      // Visitors are campus-wide, so only the Director sees them
      p.role === "DIRECTOR" ? prisma.outsider.count({ where: { entryTime: yesterday } }) : Promise.resolve(null),
    ]);
    const parts = [`Yesterday: ${out} out`, `${overdue} overdue`];
    if (visitors !== null) parts.push(`${visitors} visitors`);
    notes.push({
      profileId: p.id,
      userId: p.userId,
      kind: "system",
      level: "INFO",
      title: "Morning summary",
      body: parts.join(" · "),
      link: p.role === "FACULTY_ADMIN" ? "/faculty-admin" : p.role === "DEAN" ? "/dean" : "/director",
      dedupeKey: `summary:${p.id}:${today}`,
    });
  }
  return notes;
}

/** e. Approvers with requests waiting over an hour (at most every 2 hours) */
async function approverReminders(now: Date): Promise<NoteInput[]> {
  const pending = await prisma.permission.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - REQUEST_WAIT_MIN * MIN) } },
    select: {
      approverType: true,
      approverId: true,
      faculty: { select: { department: true, profile: { select: { id: true } } } },
      student: { select: { department: true } },
    },
    take: 1000,
  });
  if (!pending.length) return [];

  // Who decides these, found in a few batched queries (same rules as notifyApprovers)
  const wardenIds = [...new Set(pending.filter((r) => r.approverType === "WARDEN").map((r) => r.approverId))];
  const otherIds = [...new Set(pending.filter((r) => r.approverType !== "WARDEN").map((r) => r.approverId))];
  const deptsOf = (r: (typeof pending)[number]) => {
    const f = r.faculty?.department ? [r.faculty.department] : [];
    const s = r.approverType === "FACULTY_ADMIN" && r.student?.department ? [r.student.department] : [];
    return [...new Set([...f, ...s].flatMap((d) => [d, ...getDepartmentVariants(d)]))];
  };
  const allDepts = [...new Set(pending.flatMap(deptsOf))];
  const needDean = pending.some((r) => r.faculty?.department);

  const [wardens, routed, hodsAndDeans] = await Promise.all([
    wardenIds.length ? prisma.warden.findMany({ where: { id: { in: wardenIds } }, select: { id: true, profile: { select: personSel } } }) : [],
    otherIds.length
      ? prisma.profile.findMany({ where: { OR: [{ id: { in: otherIds } }, { faculty: { id: { in: otherIds } } }] }, select: { ...personSel, faculty: { select: { id: true } } } })
      : [],
    allDepts.length || needDean
      ? prisma.profile.findMany({
          where: {
            active: true,
            OR: [
              ...(needDean ? [{ role: "DEAN" as const }] : []),
              ...(allDepts.length ? [{ role: "FACULTY_ADMIN" as const, faculty: { department: { in: allDepts } } }] : []),
            ],
          },
          select: { ...personSel, faculty: { select: { department: true } } },
        })
      : [],
  ]);

  const counts = new Map<string, { p: Person; n: number }>();
  for (const r of pending) {
    const people = new Map<string, Person>();
    if (r.approverType === "WARDEN") {
      const w = wardens.find((x) => x.id === r.approverId)?.profile;
      if (w) people.set(w.id, w);
    } else {
      const a = routed.find((x) => x.id === r.approverId || x.faculty?.id === r.approverId);
      if (a) people.set(a.id, a);
    }
    const depts = deptsOf(r);
    for (const h of hodsAndDeans) {
      const applies = h.role === "DEAN" ? !!r.faculty?.department : !!h.faculty?.department && depts.includes(h.faculty.department);
      if (applies) people.set(h.id, h);
    }
    // Never reminded about their own pass
    if (r.faculty?.profile.id) people.delete(r.faculty.profile.id);
    for (const p of people.values()) {
      const c = counts.get(p.id) ?? { p, n: 0 };
      c.n++;
      counts.set(p.id, c);
    }
  }

  const today = istDateString(now);
  const slot = Math.floor(new Date(now.getTime() + 330 * MIN).getUTCHours() / 2);
  return [...counts.values()].map(({ p, n }) => ({
    profileId: p.id,
    userId: p.userId,
    kind: "request" as const,
    level: "IMPORTANT" as const,
    title: `${n} request${n === 1 ? "" : "s"} waiting`,
    body: "Waiting for your decision for over an hour",
    link: requestsLinkFor(p.role),
    dedupeKey: `remind:${p.id}:${today}:${slot}`,
  }));
}

/** f. Estate Manager: entries to verify, daily at 09:00 */
async function estateToVerify(now: Date, today: string): Promise<NoteInput[]> {
  const at = istDateTime(today, "09:00");
  if (!at || now < at) return [];
  const managers = await prisma.profile.findMany({ where: { role: "ESTATE_MANAGER", active: true }, select: personSel, take: 50 });
  const todo = await onlyNew(managers.map((m) => probe(m, `estate:${m.id}:${today}`)));
  if (!todo.length) return [];
  // Same count as the Estate Manager's home (getEstateCounts)
  const n = await prisma.registerEntry.count({
    where: {
      register: { in: [...checkerBooks("ESTATE_MANAGER")] },
      kind: "ORIGINAL",
      entryDate: { gte: new Date(now.getTime() - VERIFY_DAYS * DAY) },
      supplements: { none: { kind: "VERIFICATION" } },
    },
  });
  if (!n) return [];
  return todo.map((t) => ({ ...t, title: `${n} entries to verify`, body: null, link: "/estate" }));
}

/** Runs every job once; a failing job never stops the others. Returns counts sent per job. */
export async function runNotifyTick() {
  const now = new Date();
  const today = istDateString(now);
  const { start: todayStart } = istDayRange(now);
  const cfg = await getNotificationTimers();
  const result: Record<string, number | string> = {};

  const jobs: [string, () => Promise<NoteInput[]>][] = [
    ["visitorOverstay", () => visitorOverstay(cfg, now)],
    ["passHolders", () => passHolders(now, todayStart)],
    ["curfew", () => curfew(cfg, now, today)],
    ["morningSummary", () => morningSummary(cfg, now, today)],
    ["approverReminders", () => approverReminders(now)],
    ["estateToVerify", () => estateToVerify(now, today)],
  ];
  for (const [name, run] of jobs) {
    try {
      const fresh = await onlyNew(await run());
      await saveNotifications(fresh, pingUsersNow);
      result[name] = fresh.length;
    } catch (err: any) {
      result[name] = `error: ${err?.message ?? "failed"}`;
    }
  }
  return result;
}

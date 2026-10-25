/**
 * Meeting codes for visitors / admission people (server only).
 *
 * Security records someone coming to meet a faculty / staff member (the
 * "host") -> a 4-digit code is made and shown only to the host ("My visitors").
 * After the meeting the host tells the visitor the code; at the gate Security
 * marks the exit only with it. After 5 wrong codes it locks; Head Security or
 * Main Admin can then let the visitor out with a written reason.
 *
 * Used by the Visitors Book (outsiders.ts) and registers with a "Meeting"
 * picker, e.g. the Admission Book (registers.ts).
 */
import { randomInt, timingSafeEqual } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth/helpers";
import { notifyTopic } from "@/lib/realtime/notify";
import { personalTopic } from "@/lib/realtime/topics";

type Db = PrismaClient | Prisma.TransactionClient;

/** Who can be picked as the person being met */
export const HOST_ROLES = ["FACULTY", "FACULTY_ADMIN", "DEAN", "DIRECTOR", "WARDEN", "ADMIN", "SECURITY_SUPERVISOR"] as const;
export const MAX_CODE_TRIES = 5;

export function newVisitCode(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

/** The picked host, if it is an active staff account that can be met. */
export async function resolveHost(profileId: unknown, db: Db = prisma) {
  if (typeof profileId !== "string" || !/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  const p = await db.profile.findUnique({ where: { id: profileId }, select: { id: true, name: true, role: true, active: true } });
  if (!p || !p.active || !(HOST_ROLES as readonly string[]).includes(p.role)) return null;
  return { id: p.id, name: p.name };
}

/** Head Security and Main Admin may let a visitor out without the code (with a reason). */
export async function canOverrideVisitExit(user: AuthUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role !== "SECURITY") return false;
  const staff = await prisma.securityStaff.findUnique({ where: { profileId: user.profileId }, select: { isHead: true } });
  return !!staff?.isHead;
}

type OpenPass = { id: string; code: string; status: string; attempts: number; hostName: string };

export type VisitExitResult =
  | { ok: true; passId: string | null; method?: "CODE" | "OVERRIDE"; reason?: string }
  | { ok: false; error: string; needsCode: true; locked: boolean; triesLeft: number };

function sameCode(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * May this visitor leave? No open meeting code -> yes. Otherwise the right
 * code, or a reason from someone allowed to override. A wrong code is counted
 * (on `db`, so inside a transaction it is saved with it).
 */
export async function checkVisitExit(
  pass: OpenPass | null,
  input: { code?: unknown; overrideReason?: unknown },
  canOverride: boolean,
  db: Db = prisma
): Promise<VisitExitResult> {
  if (!pass || pass.status === "EXITED") return { ok: true, passId: null };
  const triesLeft = Math.max(0, MAX_CODE_TRIES - pass.attempts);
  const fail = (error: string, left = triesLeft): VisitExitResult => ({ ok: false, error, needsCode: true, locked: left <= 0, triesLeft: left });

  const reason = typeof input.overrideReason === "string" ? input.overrideReason.trim().slice(0, 300) : "";
  if (reason) {
    if (!canOverride) return fail("Only Head Security or Main Admin can let a visitor out without the code.");
    if (reason.length < 5) return fail("Write a short reason (at least 5 letters).");
    return { ok: true, passId: pass.id, method: "OVERRIDE", reason };
  }
  if (triesLeft <= 0) return fail("Code locked after 5 wrong tries. Head Security can let the visitor out with a reason.", 0);

  const code = typeof input.code === "string" ? input.code.replace(/\D/g, "") : "";
  if (code.length !== 4) return fail("Enter the 4-digit meeting code.");
  if (!sameCode(code, pass.code)) {
    await db.visitPass.update({ where: { id: pass.id }, data: { attempts: { increment: 1 } } });
    const left = triesLeft - 1;
    // Fixed phrases (translated on screen); the screen adds how many tries are left
    return fail(left > 0 ? "Wrong code." : "Wrong code. The code is now locked: Head Security can let the visitor out with a reason.", left);
  }
  return { ok: true, passId: pass.id, method: "CODE" };
}

/** Marks the meeting code as used (the visitor has left). */
export async function closeVisitPass(db: Db, check: Extract<VisitExitResult, { ok: true }>, user: AuthUser) {
  if (!check.passId) return;
  await db.visitPass.update({
    where: { id: check.passId },
    data: {
      status: "EXITED",
      exitedAt: new Date(),
      exitMethod: check.method ?? "CODE",
      overrideReason: check.method === "OVERRIDE" ? check.reason ?? null : null,
      exitedByName: user.name,
    },
  });
}

/** Tells the host's open "My visitors" page that something changed (live). */
export async function notifyHost(hostProfileId: string | null | undefined) {
  if (!hostProfileId) return;
  try {
    const p = await prisma.profile.findUnique({ where: { id: hostProfileId }, select: { userId: true } });
    if (p?.userId) notifyTopic(personalTopic(p.userId), "visits");
  } catch {
    // live update only: the page still refreshes when opened
  }
}

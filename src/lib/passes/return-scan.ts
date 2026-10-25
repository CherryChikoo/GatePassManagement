import type { Prisma } from "@prisma/client";

/**
 * One pass for the whole trip: security scans the QR when the person leaves,
 * and the SAME QR again when they come back, recording the return on that pass.
 *
 * Applies to:
 * - faculty exit passes (same result as "Mark In" in the Faculty Book), and
 * - hostellers' exit passes (outings / going home).
 * Day scholars still use a separate Entry pass; hostel passes (college → hostel)
 * are scanned by the warden, not at the gate.
 */
export function canScanReturn(
  p: {
    facultyId: string | null;
    studentId: string | null;
    /** The student's type, when the pass belongs to a student */
    studentType?: string | null;
    passKind?: string | null;
    type: string;
    status: string;
    qr: { usedForExit: boolean; usedForEntry: boolean } | null;
  },
  hasEntryMovement: boolean
): boolean {
  const outOnThisPass =
    p.type !== "ENTRY" &&
    p.passKind !== "HOSTEL" &&
    p.status === "EXITED" &&
    !!p.qr?.usedForExit &&
    !p.qr.usedForEntry &&
    !hasEntryMovement;
  if (!outOnThisPass) return false;
  if (p.facultyId && !p.studentId) return true;
  return !!p.studentId && p.studentType === "HOSTELLER";
}

/** Lifetime of one displayed return code (the screen refreshes it every 45 s). */
export const RETURN_QR_TTL_MS = 120_000;

/**
 * Passes on which someone is out right now and has not come back: a faculty or
 * hosteller exit pass that was scanned out, with no return yet. (Day scholars'
 * exit passes end at the exit, and hostel passes are one-way, so neither counts.)
 * While one is open, no new pass can be requested — the return QR is shown.
 */
export const OPEN_TRIP_WHERE: Prisma.PermissionWhereInput = {
  status: "EXITED",
  type: { not: "ENTRY" },
  qr: { usedForExit: true, usedForEntry: false },
  movements: { none: { type: "ENTRY" } },
  AND: [
    { OR: [{ passKind: null }, { passKind: { not: "HOSTEL" } }] },
    { OR: [{ facultyId: { not: null } }, { student: { studentType: "HOSTELLER" } }] },
  ],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the person is due back on campus: the planned return time on the pass
 * (hosteller outings), else the end of its last day (leave over several days,
 * faculty permissions). Null = no planned return.
 */
export function returnDueAt(p: {
  expectedReturn?: Date | string | null;
  endDate?: Date | string | null;
  exitDate?: Date | string | null;
}): Date | null {
  if (p.expectedReturn) return new Date(p.expectedReturn);
  const last = p.endDate ?? p.exitDate;
  if (!last) return null;
  // endDate / exitDate are stored as the start of an IST day: due by that day's end
  return new Date(new Date(last).getTime() + DAY_MS);
}

/**
 * Minutes late: of a return made at `returnedAt`, or of someone still out now.
 * 0 when on time (or no planned return). The return QR never expires because
 * of this — a late return is only marked "Delayed return".
 */
export function delayMinutes(dueAt: Date | null, returnedAt: Date | string | null = null): number {
  if (!dueAt) return 0;
  const at = returnedAt ? new Date(returnedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((at - dueAt.getTime()) / 60_000));
}

/** "45 min", "2 h 10 min", "3 days 4 h" */
export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours ? `${days} day${days === 1 ? "" : "s"} ${hours} h` : `${days} day${days === 1 ? "" : "s"}`;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}

/** After the planned exit time, the exit QR stays valid this long (if the chosen window is shorter) */
export const PLANNED_EXIT_GRACE_MS = 2 * 60 * 60_000;

/**
 * When an approved pass's QR stops working for LEAVING (the return QR has no
 * time limit):
 * - pass for a future day: that whole day;
 * - pass for today: the approver's chosen window from now, or until 2 h after
 *   the planned exit time if later — never past the end of the exit day.
 */
export function exitQrExpiresAt(input: {
  exitDayStart: Date;
  exitDayEnd: Date;
  expectedExit?: Date | null;
  chosenMinutes: number;
  now?: Date;
}): Date {
  const now = input.now ?? new Date();
  if (input.exitDayStart > now) return input.exitDayEnd;
  const chosenEnd = now.getTime() + input.chosenMinutes * 60_000;
  const plannedEnd = input.expectedExit ? input.expectedExit.getTime() + PLANNED_EXIT_GRACE_MS : 0;
  return new Date(Math.min(input.exitDayEnd.getTime(), Math.max(chosenEnd, plannedEnd)));
}

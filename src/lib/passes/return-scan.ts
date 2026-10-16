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

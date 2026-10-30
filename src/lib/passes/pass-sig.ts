/**
 * Short fingerprint of a pass: status, QR use and number of gate scans. It
 * changes whenever the pass is approved, rejected, scanned out or back in.
 *
 * /api/pass-status returns it, and the screen's own data carries the one it is
 * showing; when they differ, the screen is out of date and reloads (see
 * usePassWatch). Both sides must use this one function.
 */
export function passSig(
  p: {
    status: string;
    qr?: { usedForExit?: boolean | null; usedForEntry?: boolean | null; active?: boolean | null } | null;
  },
  movementCount: number
): string {
  return [p.status, p.qr?.usedForExit ? 1 : 0, p.qr?.usedForEntry ? 1 : 0, p.qr?.active ? 1 : 0, movementCount].join("|");
}

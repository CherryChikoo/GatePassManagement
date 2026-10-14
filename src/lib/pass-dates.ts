import { formatDate } from "@/lib/utils";
import { istDateString } from "@/lib/time/ist";

/**
 * A pass has two dates: when it was requested (createdAt) and the day it is
 * for (exitDate). Activity views list a pass on either day, so whenever the two
 * differ the scheduled day must be shown too. Returns "" when they match.
 */
export function scheduledNote(pass: { createdAt?: string | Date | null; exitDate?: string | Date | null }): string {
  if (!pass?.exitDate || !pass?.createdAt) return "";
  const scheduled = istDateString(new Date(pass.exitDate));
  const requested = istDateString(new Date(pass.createdAt));
  return scheduled === requested ? "" : ` • Scheduled for ${formatDate(pass.exitDate)}`;
}

/**
 * What security marked at the gate for this pass ("" if not scanned yet).
 * Only states the recorded exit/entry; it does not claim where the person is now.
 */
export function gateMarkText(qr?: { usedForExit?: boolean | null; usedForEntry?: boolean | null } | null): string {
  if (qr?.usedForExit && qr?.usedForEntry) return "Exit and entry marked at the gate";
  if (qr?.usedForExit) return "Exit marked at the gate";
  if (qr?.usedForEntry) return "Entry marked at the gate";
  return "";
}

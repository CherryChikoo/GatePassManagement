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

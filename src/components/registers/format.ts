import { yesNoWords, type FieldDef } from "@/lib/registers/definitions";
import { formatDate, formatDateTime } from "@/lib/utils";

/** "14:05" → "2:05 PM" */
export function formatClock(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export function formatFieldValue(f: FieldDef, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (f.type) {
    case "date":
      return typeof v === "string" ? formatDate(`${v}T00:00:00+05:30`) : "—";
    case "time":
      return typeof v === "string" ? formatClock(v) : "—";
    case "yesno":
      return v === true ? yesNoWords(f)[0] : v === false ? yesNoWords(f)[1] : "—";
    case "photo":
      return "Photo";
    case "staff": {
      const s = v as { name?: string; employeeId?: string | null };
      return s?.name ? `${s.name}${s.employeeId ? ` (${s.employeeId})` : ""}` : "—";
    }
    default:
      return String(v);
  }
}

export function formatInstant(iso?: string | null): string {
  return iso ? formatDateTime(iso) : "—";
}

export function formatDay(iso?: string | null): string {
  return iso ? formatDate(iso) : "—";
}

export function newClientToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

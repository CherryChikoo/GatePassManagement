/**
 * Server-side validation of register submissions, generated from the field
 * definitions. Never trust the browser: every value is re-checked here, and
 * dates / times are always set from the server clock (IST).
 */
import { firstDirection, pendingActions, type Direction, type EntryRegister, type FieldDef } from "./definitions";
import { istDateString } from "@/lib/time/ist";

export type RawPayload = {
  fields?: Record<string, unknown>;
  groups?: Record<string, unknown>;
  /** In / Out registers: the side this record starts with */
  direction?: unknown;
};

/** What a guard records later on a saved record. */
export type CompletionPayload = {
  /** Record the other side (In or Out) now */
  markMovement?: unknown;
  /** Reading for that side (e.g. In Reading) */
  reading?: unknown;
  /** Group rows to mark out now, e.g. { workers: [0, 3] } */
  groupMarks?: Record<string, unknown>;
};

export type StaffSnapshot = { id: string; name: string; employeeId: string | null };
export type StaffResolver = (id: string) => Promise<StaffSnapshot | null>;

type FieldValue = string | number | boolean | StaffSnapshot | null;
export type RegisterData = Record<string, FieldValue | Record<string, FieldValue>[]>;

const PHONE_RE = /^\+?[0-9][0-9\s-]{8,16}[0-9]$/;
/** Safety cap for unlimited groups (e.g. workers under one contractor) */
const HARD_GROUP_LIMIT = 500;

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** Current IST wall-clock time, "HH:mm". */
export function istTimeNow(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(11, 16);
}

/** Validates one value a guard typed. Dates and times never come from the browser. */
async function cleanValue(
  f: FieldDef,
  raw: unknown,
  resolveStaff: StaffResolver
): Promise<{ value: FieldValue } | { error: string }> {
  if (f.type === "yesno") {
    if (isBlank(raw)) return { value: null };
    if (raw === true || raw === "yes" || raw === "true") return { value: true };
    if (raw === false || raw === "no" || raw === "false") return { value: false };
    return { error: `${f.label}: choose Yes or No` };
  }
  if (isBlank(raw)) return { value: null };
  if (typeof raw !== "string" && typeof raw !== "number") return { error: `${f.label}: invalid value` };
  const s = String(raw).trim();

  switch (f.type) {
    case "text":
      if (s.length > 200) return { error: `${f.label}: at most 200 characters` };
      return { value: s };
    case "textarea":
      if (s.length > 1000) return { error: `${f.label}: at most 1000 characters` };
      return { value: s };
    case "phone":
      if (!PHONE_RE.test(s)) return { error: `${f.label}: enter a valid phone number (10–15 digits)` };
      return { value: s };
    case "number": {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return { error: `${f.label}: enter a valid number` };
      return { value: n };
    }
    case "select":
      if (!f.options?.includes(s)) return { error: `${f.label}: choose one of the listed options` };
      return { value: s };
    case "staff": {
      const staff = await resolveStaff(s);
      if (!staff) return { error: `${f.label}: choose a security staff member from the list` };
      return { value: staff };
    }
    default:
      return { value: null };
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Keys the server fills itself (time / date, and the movement readings handled separately). */
function serverKeys(def: EntryRegister): Set<string> {
  const keys = new Set<string>();
  for (const f of def.fields) if (f.type === "date" || f.type === "time") keys.add(f.key);
  const m = def.movement;
  if (m) {
    for (const side of [m.in, m.out]) if (side.readingKey) keys.add(side.readingKey);
    if (m.directionField) keys.add(m.directionField);
  }
  return keys;
}

/** Text used for search: names, numbers and other short fields. */
export function buildSearchText(def: EntryRegister, data: RegisterData): string {
  const parts: string[] = [];
  const push = (f: FieldDef, v: unknown) => {
    if (v === null || v === undefined) return;
    if (f.type === "staff" && typeof v === "object") {
      const s = v as StaffSnapshot;
      parts.push(s.name, s.employeeId ?? "");
    } else if (f.type !== "time" && f.type !== "date" && f.type !== "yesno") {
      parts.push(String(v));
    }
  };
  for (const f of def.fields) push(f, data[f.key]);
  for (const g of def.groups ?? []) {
    const rows = Array.isArray(data[g.key]) ? (data[g.key] as Record<string, FieldValue>[]) : [];
    for (const row of rows) for (const f of g.fields) push(f, row[f.key]);
  }
  return parts.join(" ").toLowerCase().replace(/\s+/g, " ").slice(0, 4000);
}

/**
 * Validates a new record. Every input is optional, but at least one detail is
 * needed. Dates are today; times are now; In / Out registers need a direction.
 */
export async function validateNewRecord(
  def: EntryRegister,
  payload: RawPayload,
  resolveStaff: StaffResolver,
  now: Date = new Date()
): Promise<{ data: RegisterData; entryDateStr: string } | { error: string }> {
  const fields = asRecord(payload?.fields);
  const groups = asRecord(payload?.groups);
  const today = istDateString(now);
  const time = istTimeNow(now);
  const m = def.movement;
  const skip = serverKeys(def);
  const data: RegisterData = {};
  let details = 0;

  let direction: Direction | null = null;
  if (m) {
    if (payload?.direction !== "IN" && payload?.direction !== "OUT") return { error: "Choose In or Out" };
    direction = payload.direction;
    if (!m.firstDirections.includes(direction)) {
      return { error: `A new record must start with ${m.firstDirections.map((d) => (d === "IN" ? m.in.label : m.out.label)).join(" or ")}` };
    }
  }

  for (const f of def.fields) {
    if (f.type === "date") {
      data[f.key] = today;
      continue;
    }
    if (f.type === "time") {
      // Movement times: only the chosen side, now. Any other time field: now.
      if (m && (f.key === m.in.timeKey || f.key === m.out.timeKey)) {
        const side = direction === "IN" ? m.in : m.out;
        data[f.key] = f.key === side.timeKey ? time : null;
      } else {
        data[f.key] = time;
      }
      continue;
    }
    if (skip.has(f.key)) continue;
    const res = await cleanValue(f, fields[f.key], resolveStaff);
    if ("error" in res) return { error: res.error };
    data[f.key] = res.value;
    if (res.value !== null) details++;
  }

  if (m && direction) {
    const side = direction === "IN" ? m.in : m.out;
    const otherSide = direction === "IN" ? m.out : m.in;
    if (side.readingKey) {
      const f = def.fields.find((x) => x.key === side.readingKey)!;
      const res = await cleanValue(f, fields[side.readingKey], resolveStaff);
      if ("error" in res) return { error: res.error };
      data[side.readingKey] = res.value;
      if (res.value !== null) details++;
    }
    if (otherSide.readingKey && otherSide.readingKey !== side.readingKey) data[otherSide.readingKey] = null;
    if (m.directionField) data[m.directionField] = direction === "IN" ? "In" : "Out";
    data.direction = direction;
  }

  for (const g of def.groups ?? []) {
    const list = Array.isArray(groups[g.key]) ? (groups[g.key] as unknown[]) : [];
    const rows: Record<string, FieldValue>[] = [];
    for (const item of list) {
      const raw = asRecord(item);
      const typed = g.fields.filter((f) => f.type !== "time" && f.type !== "date");
      if (typed.every((f) => isBlank(raw[f.key]))) continue; // empty row
      const row: Record<string, FieldValue> = {};
      for (const f of g.fields) {
        if (f.type === "time") {
          row[f.key] = f.completion ? null : time;
          continue;
        }
        const res = await cleanValue(f, raw[f.key], resolveStaff);
        if ("error" in res) return { error: `${g.itemLabel} ${rows.length + 1} — ${res.error}` };
        row[f.key] = res.value;
      }
      rows.push(row);
    }
    const limit = g.max ?? HARD_GROUP_LIMIT;
    if (rows.length > limit) return { error: `At most ${limit} ${g.label.toLowerCase()} per record` };
    data[g.key] = rows;
    details += rows.length;
  }

  if (details === 0) return { error: "Enter at least one detail" };

  if (def.key === "SIROS_LABOUR_CONTRACT") {
    const total = typeof data.totalWorkers === "number" ? data.totalWorkers : null;
    const workers = Array.isArray(data.workers) ? data.workers.length : 0;
    if (total !== null && !Number.isInteger(total)) return { error: "Total workers must be a whole number" };
    if (total !== null && workers > total) return { error: `You listed ${workers} workers but the total under the contractor is ${total}` };
  }
  if ((def.key === "DAILY_LABOUR" || def.key === "LABOUR_CONTRACT") && typeof data.workerCount === "number" && !Number.isInteger(data.workerCount)) {
    return { error: "Worker count must be a whole number" };
  }

  return { data, entryDateStr: today };
}

/**
 * Validates what is recorded later on a saved record: the other side of an
 * In / Out register (time = now, plus its reading), and/or group rows marked out now.
 */
export async function validateCompletion(
  def: EntryRegister,
  current: RegisterData,
  payload: CompletionPayload,
  now: Date = new Date()
): Promise<{ data: RegisterData } | { error: string }> {
  const pending = pendingActions(def, current);
  const time = istTimeNow(now);
  const data: RegisterData = {};
  let provided = 0;

  if (payload?.markMovement === true) {
    if (!pending.next) return { error: "This record has nothing more to record" };
    const side = pending.next;
    data[side.timeKey] = time;
    provided++;
    if (side.readingKey && !isBlank(payload.reading)) {
      const n = Number(String(payload.reading).trim());
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return { error: "Enter a valid reading" };
      const otherReadingKey = side.direction === "IN" ? def.movement!.out.readingKey : def.movement!.in.readingKey;
      const other = otherReadingKey ? current[otherReadingKey] : null;
      if (typeof other === "number") {
        if (side.direction === "IN" && n < other) return { error: "In reading cannot be less than the out reading" };
        if (side.direction === "OUT" && n > other) return { error: "Out reading cannot be more than the in reading" };
      }
      data[side.readingKey] = n;
    }
  }

  const marks = asRecord(payload?.groupMarks);
  for (const { group, field, open } of pending.groups) {
    const raw = Array.isArray(marks[group.key]) ? (marks[group.key] as unknown[]) : [];
    const indices = [...new Set(raw.map(Number).filter((i) => Number.isInteger(i) && open.includes(i)))];
    if (indices.length === 0) continue;
    data[group.key] = indices.map((index) => ({ index, [field!.key]: time }));
    provided += indices.length;
  }

  if (provided === 0) return { error: "Nothing selected to record" };
  return { data };
}

/**
 * The values to display for a record: the original with later recordings
 * filled in. The stored rows themselves never change.
 */
export function effectiveData(
  def: EntryRegister,
  original: RegisterData,
  supplements: { kind: string; data: unknown; createdAt: Date | string }[]
): RegisterData {
  const sorted = [...supplements].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const corrections = sorted.filter((s) => s.kind === "CORRECTION");
  const base: RegisterData = structuredClone(
    (corrections.length ? (corrections[corrections.length - 1].data as RegisterData) : original) ?? {}
  );
  const groupKeys = new Set((def.groups ?? []).map((g) => g.key));
  for (const c of sorted.filter((s) => s.kind === "COMPLETION")) {
    const d = (c.data ?? {}) as RegisterData;
    for (const [k, v] of Object.entries(d)) {
      if (groupKeys.has(k)) {
        const rows = Array.isArray(base[k]) ? (base[k] as Record<string, FieldValue>[]) : [];
        for (const u of Array.isArray(v) ? (v as Record<string, FieldValue>[]) : []) {
          const row = rows[Number(u.index)];
          if (!row) continue;
          for (const [rk, rv] of Object.entries(u)) {
            if (rk !== "index" && isBlank(row[rk])) row[rk] = rv;
          }
        }
      } else if (isBlank(base[k])) {
        base[k] = v as FieldValue;
      }
    }
  }
  // Older records: make sure the starting side is known
  if (def.movement && !base.direction) {
    const first = firstDirection(def, base);
    if (first) base.direction = first;
  }
  return base;
}

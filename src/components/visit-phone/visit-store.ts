/**
 * What the visitor's phone remembers (no login, no app), all in localStorage:
 * - "gp_visit_sent": the "details sent" confirmation, so a page reload (or a new
 *   deployment reloading the open page) shows it again without asking the server.
 *   Cleared by "Fill another form"; forgotten after a day's visit.
 * - a draft of the form (2 h), so a reload while typing keeps what was typed;
 *   also used after "scan the QR again" (same register).
 *
 * Every read / write is wrapped: private mode or blocked storage just means
 * nothing is remembered.
 */

export type CheckInRegister = "VISITORS" | "ADMISSION";

/** The confirmation shown after sending the form */
export type SentVisit = {
  register: CheckInRegister;
  /** The visitor's name as sent (a parent found by roll number: the student's name, see forStudent) */
  name: string;
  /** When the server received it (ISO) */
  at: string;
  /** The faculty / staff member chosen in "Who are you meeting?" (they give the exit code) */
  hostName: string | null;
  /** `name` is the student the parent came to see (the parent's own details never reach the phone) */
  forStudent?: boolean;
};

const SENT_KEY = "gp_visit_sent";
const DRAFT_PREFIX = "gp_visit_draft:";
/** A confirmation older than this is not shown any more (visits are same-day) */
const SENT_MAX_AGE_MS = 12 * 60 * 60_000;

export function readSentVisit(): SentVisit | null {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SentVisit> & { savedAt?: number };
    const savedAt = typeof v.savedAt === "number" && Number.isFinite(v.savedAt) ? v.savedAt : 0;
    if (
      Date.now() - savedAt > SENT_MAX_AGE_MS ||
      (v.register !== "VISITORS" && v.register !== "ADMISSION") ||
      typeof v.name !== "string" ||
      typeof v.at !== "string" ||
      Number.isNaN(Date.parse(v.at))
    ) {
      localStorage.removeItem(SENT_KEY);
      return null;
    }
    return {
      register: v.register,
      name: v.name.slice(0, 100),
      at: v.at,
      hostName: typeof v.hostName === "string" && v.hostName ? v.hostName.slice(0, 100) : null,
      forStudent: v.forStudent === true,
    };
  } catch {
    return null;
  }
}

export function saveSentVisit(sent: SentVisit) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...sent, savedAt: Date.now() }));
  } catch {}
}

export function clearSentVisit() {
  try {
    localStorage.removeItem(SENT_KEY);
  } catch {}
}

/**
 * The half-typed form: in localStorage (not this tab only), because scanning the
 * QR again with the camera usually opens a new tab. Kept for a couple of hours.
 */
const DRAFT_MAX_AGE_MS = 2 * 60 * 60_000;

export function readDraft<T>(register: CheckInRegister): T | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + register);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at?: number; draft?: T };
    if (typeof saved.at !== "number" || Date.now() - saved.at > DRAFT_MAX_AGE_MS || saved.draft === undefined) {
      localStorage.removeItem(DRAFT_PREFIX + register);
      return null;
    }
    return saved.draft;
  } catch {
    return null;
  }
}

export function saveDraft(register: CheckInRegister, draft: unknown) {
  try {
    localStorage.setItem(DRAFT_PREFIX + register, JSON.stringify({ at: Date.now(), draft }));
  } catch {}
}

export function clearDraft(register: CheckInRegister) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + register);
  } catch {}
}

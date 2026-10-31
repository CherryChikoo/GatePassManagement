/**
 * What the visitor's phone remembers (no login, no app):
 * - "gp_visit" (localStorage): the visit this phone follows, so an office
 *   poster scanned later knows whose visit it is, and a page reload (a new
 *   deployment reloads open pages) never loses it. The secret is also in the
 *   status page's address (/v/me/<secret>).
 * - a draft of the form (localStorage, 2 h), so a reload while typing keeps what
 *   was typed; also used after "scan the QR again" (same register).
 *
 * Every read / write is wrapped: private mode or blocked storage just means
 * nothing is remembered.
 */

export type CheckInRegister = "VISITORS" | "ADMISSION";

export type SavedVisit = { secret: string; register: CheckInRegister; at: number };

const VISIT_KEY = "gp_visit";
const DRAFT_PREFIX = "gp_visit_draft:";
/** A saved visit older than this is not offered any more (visits are same-day) */
const VISIT_MAX_AGE_MS = 18 * 60 * 60_000;
/** Phone secret from /api/visit/submit (43 chars base64url) */
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

export function isVisitSecret(v: unknown): v is string {
  return typeof v === "string" && SECRET_RE.test(v);
}

export function readSavedVisit(): SavedVisit | null {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedVisit>;
    if (!isVisitSecret(v.secret) || (v.register !== "VISITORS" && v.register !== "ADMISSION")) return null;
    const at = typeof v.at === "number" && Number.isFinite(v.at) ? v.at : 0;
    if (Date.now() - at > VISIT_MAX_AGE_MS) return null;
    return { secret: v.secret, register: v.register, at };
  } catch {
    return null;
  }
}

export function saveVisit(visit: SavedVisit) {
  try {
    localStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  } catch {}
}

/** Forget the saved visit (only if it is still this one, when a secret is given) */
export function clearSavedVisit(secret?: string) {
  try {
    if (secret) {
      const cur = readSavedVisit();
      if (cur && cur.secret !== secret) return;
    }
    localStorage.removeItem(VISIT_KEY);
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

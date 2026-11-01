/**
 * The visitor's phone talks to the public routes under /api/visit/* (never
 * server actions: their IDs change with every deployment and this page may
 * stay open for a long time). The JSON answer is read whatever the HTTP status.
 * Calls: open the form, a parent's Find (the student by roll number), and send
 * it. Nothing is asked after sending.
 */
import type { CheckInRegister } from "@/components/visit-phone/visit-store";

/** A faculty / staff member the visitor can choose in "Who are you meeting?" */
export type VisitHost = { id: string; name: string; title: string; department: string | null };

/** GET /api/visit/form?t= */
export type VisitFormOk = {
  ok: true;
  register: CheckInRegister;
  /** The gate of the security officer whose QR was scanned (when the server sends it) */
  gate?: string | null;
  hosts: VisitHost[];
  expiresAt: string;
};

/** POST /api/visit/submit (`forStudent`: `name` is the student's, for a parent found by roll number) */
export type VisitSubmitOk = { ok: true; name: string; at: string; forStudent?: boolean };

/** GET /api/visit/student?t=&roll= : the student only, and which parents are saved (never their details) */
export type VisitStudentOk = {
  ok: true;
  studentName: string;
  department: string | null;
  year: number | null;
  has: { father: boolean; mother: boolean; guardian: boolean };
};

/** Not an answer from the server: no network / timed out (`status` 0) */
export type VisitFailure = { ok: false; error: string; status: number };

/** No answer reached us (offline, timed out) */
export const NETWORK = "network";

async function call<T extends { ok: boolean }>(url: string, init?: RequestInit, timeoutMs = 15_000): Promise<T | VisitFailure> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { ok: false, error: NETWORK, status: 0 };
  }
  try {
    const body = (await res.json()) as T | Omit<VisitFailure, "status">;
    if (body && typeof body === "object" && "ok" in body) {
      return body.ok ? (body as T) : { ...(body as Omit<VisitFailure, "status">), status: res.status };
    }
  } catch {}
  return { ok: false, error: "Something went wrong. Please try again.", status: res.status };
}

export async function fetchVisitForm(token: string) {
  const res = await call<VisitFormOk>(`/api/visit/form?t=${encodeURIComponent(token)}`);
  // No list means nobody to choose (never a crash)
  return res.ok ? { ...res, hosts: Array.isArray(res.hosts) ? res.hosts : [] } : res;
}

/** A parent's tap of Find (never while typing) */
export async function findVisitStudent(token: string, roll: string) {
  const res = await call<VisitStudentOk>(`/api/visit/student?t=${encodeURIComponent(token)}&roll=${encodeURIComponent(roll)}`);
  if (!res.ok) return res;
  const has = (res.has ?? {}) as Partial<VisitStudentOk["has"]>;
  return {
    ...res,
    studentName: typeof res.studentName === "string" ? res.studentName : "",
    department: typeof res.department === "string" ? res.department : null,
    year: typeof res.year === "number" ? res.year : null,
    has: { father: has.father === true, mother: has.mother === true, guardian: has.guardian === true },
  };
}

export function submitVisit(body: { t: string; data: Record<string, unknown>; hostProfileId?: string }) {
  return call<VisitSubmitOk>(
    "/api/visit/submit",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    25_000
  );
}

type Translate = (text: string, vars?: Record<string, string | number>) => string;

/**
 * A server message in the visitor's language. Register form checks come as
 * "<Field label>: <problem>" or "<Field label> is required": both halves are
 * translated.
 */
export function visitMessage(t: Translate, error: string): string {
  if (error === NETWORK) return t("No internet connection. Please check your network and try again.");
  const whole = t(error);
  if (whole !== error) return whole;
  const required = /^(.+) is required$/.exec(error);
  if (required) return t("{field} is required", { field: t(required[1]) });
  const split = /^(.+?): (.+)$/.exec(error);
  if (split) return `${t(split[1])}: ${t(split[2])}`;
  return whole;
}

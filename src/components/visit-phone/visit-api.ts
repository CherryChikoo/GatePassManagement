/**
 * The visitor's phone talks to the public routes under /api/visit/* (never
 * server actions: their IDs change with every deployment and this page may
 * stay open for hours). The JSON answer is read whatever the HTTP status.
 */
import type { VisitFormResult, VisitStatus } from "@/lib/visits/requests";

export type { VisitFormResult, VisitStatus };
export type VisitFormOk = Extract<VisitFormResult, { ok: true }>;
export type VisitExitWay = VisitStatus["exit"];

/** Not an answer from the server: no network / timed out (`status` 0) */
export type VisitFailure = { ok: false; error: string; status: number; locked?: boolean; triesLeft?: number };

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

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function fetchVisitForm(token: string) {
  return call<VisitFormOk>(`/api/visit/form?t=${encodeURIComponent(token)}`);
}

export function submitVisit(body: { t: string; s?: string; data: Record<string, unknown>; hostProfileId: string; officeId: string }) {
  return call<{ ok: true; secret: string }>("/api/visit/submit", post(body), 25_000);
}

/** The secret goes in the body, never the address (addresses are written to request logs on every check) */
export function fetchVisitStatus(secret: string) {
  return call<VisitStatus>("/api/visit/status", post({ s: secret }), 12_000);
}

export function sendMeetingCode(secret: string, code: string) {
  return call<VisitStatus>("/api/visit/code", post({ s: secret, code }), 20_000);
}

export function fetchOffice(posterKey: string) {
  return call<{ ok: true; id: string; name: string }>(`/api/visit/office?k=${encodeURIComponent(posterKey)}`);
}

export function recordOfficeVisit(secret: string, posterKey: string) {
  return call<VisitStatus>("/api/visit/office", post({ s: secret, k: posterKey }), 20_000);
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

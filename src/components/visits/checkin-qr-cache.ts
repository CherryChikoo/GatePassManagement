"use client";

/**
 * The check-in QR (Visitors Book / Admission Book), kept in this browser tab
 * between pop-ups: the last signed token per register, with the time it runs
 * out and its drawn image. Opening the QR again (registers list pop-up, the
 * 4-button screen's pop-up, full screen) shows it at once with no request while
 * it has more than 2 minutes left; a new one is fetched only when it is about to
 * run out. Touching a QR button warms it up (the token only when none is kept).
 *
 * Never shared between users: the cache lives in this page's memory only (a
 * sign-out loads a new page, hardNavigate in src/stores/app-store.ts), and is
 * also emptied the moment the signed-in user changes or signs out in the store.
 */
import { callGate } from "@/lib/gate-call";
import { useAppStore } from "@/stores/app-store";
import type { CheckInRegister } from "./arrival-alert";

/** The token lives 15 minutes (src/lib/qr/token.ts); a new one is fetched this long before it runs out */
export const REFRESH_BEFORE_MS = 60_000;
const DEFAULT_TTL_MS = 15 * 60_000;
/** A kept QR is shown without any request only with at least this long left */
const REUSE_MIN_LEFT_MS = 2 * 60_000;

type Entry = {
  token: string;
  /** Local time (this phone's clock) the token stops working */
  expiresAt: number;
  /** The drawn QR (data URL), once drawn */
  image: string | null;
  drawing: Promise<string> | null;
};

export type CheckInQr = Pick<Entry, "token" | "expiresAt">;

const cache = new Map<CheckInRegister, Entry>();
const inflight = new Map<CheckInRegister, Promise<Entry | { error: string }>>();
/** Bumped when the cache is emptied: a request already on its way is then not kept */
let generation = 0;

function clearCheckInQrCache() {
  generation++;
  cache.clear();
  inflight.clear();
}

if (typeof window !== "undefined") {
  // Signed out (store reset) or another user signed in: forget this user's QR
  useAppStore.subscribe((state, prev) => {
    if (prev.user && state.user?.profileId !== prev.user.profileId) clearCheckInQrCache();
  });
}

/** The kept QR when it still has more than 2 minutes left (else null). */
function usable(register: CheckInRegister): Entry | null {
  if (typeof window === "undefined") return null;
  const entry = cache.get(register);
  return entry && entry.expiresAt - Date.now() > REUSE_MIN_LEFT_MS ? entry : null;
}

/** The kept QR's image, ready to show at once (no request), or null. */
export function readyCheckInQrImage(register: CheckInRegister): string | null {
  return usable(register)?.image ?? null;
}

/**
 * The QR to show: the kept one when it has more than 2 minutes left (no
 * request), else a new one from the server (one request, shared by everyone
 * asking at the same time). Throws when there is no network.
 */
export function getCheckInQr(register: CheckInRegister): Promise<CheckInQr | { error: string }> {
  const kept = usable(register);
  if (kept) return Promise.resolve(kept);
  const running = inflight.get(register);
  if (running) return running;
  const gen = generation;
  const job = (async (): Promise<Entry | { error: string }> => {
    const res = await callGate("getCheckInQr", [register], 15_000);
    if ("error" in res) return { error: res.error };
    // Timed on this phone's clock (the phone's clock may be off from the server's)
    let ttl = Date.parse(res.expiresAt) - Date.now();
    if (!(ttl > 2 * REFRESH_BEFORE_MS && ttl <= 2 * DEFAULT_TTL_MS)) ttl = DEFAULT_TTL_MS;
    const entry: Entry = { token: res.token, expiresAt: Date.now() + ttl, image: null, drawing: null };
    if (gen === generation) cache.set(register, entry);
    return entry;
  })().finally(() => {
    if (inflight.get(register) === job) inflight.delete(register);
  });
  inflight.set(register, job);
  return job;
}

let qrLib: Promise<typeof import("qrcode")> | null = null;
/** The QR drawing code (loaded once, only when a QR is about to be shown) */
export function loadQrLib() {
  qrLib ??= import("qrcode")
    // A CommonJS package: its functions sit on `default` in some bundles
    .then((mod) => (mod.default ?? mod) as typeof mod)
    .catch((err) => {
      qrLib = null; // try again next time
      throw err;
    });
  return qrLib;
}

/** The QR's image (drawn once per token, then reused). */
export function checkInQrImage(qr: CheckInQr): Promise<string> {
  const entry = qr as Entry;
  if (entry.image) return Promise.resolve(entry.image);
  entry.drawing ??= loadQrLib()
    .then((lib) =>
      lib.toDataURL(`${window.location.origin}/v/${entry.token}`, {
        width: 720, // drawn large: crisp dots scan faster from a screen
        margin: 4, // the standard white border scanners need
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      })
    )
    .then((image) => (entry.image = image))
    .finally(() => {
      entry.drawing = null;
    });
  return entry.drawing;
}

/**
 * A QR button was touched: get the QR ready while the tap completes. Asks the
 * server only when no usable QR is kept; failures are left to the QR screen.
 */
export function warmCheckInQr(register: CheckInRegister) {
  if (typeof window === "undefined") return;
  getCheckInQr(register)
    .then((qr) => ("error" in qr ? null : checkInQrImage(qr)))
    .catch(() => {});
}

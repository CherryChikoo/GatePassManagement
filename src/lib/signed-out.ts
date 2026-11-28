import { timeoutSignal } from "@/lib/timeout-signal";
/**
 * Signing a device out with a clear message and a 5-second countdown, then
 * the sign-in page — instead of screens that quietly stop loading.
 * - The server no longer accepts this login ("Your login has ended").
 * - No use for a long time (every role except Security): "Stay signed in"
 *   cancels it when someone is there.
 * (Security tablets never come here: they stay signed in until Log out.)
 */
export type SignOutReason = "ended" | "idle";
/** "Are you there?" waits this long for an answer, then signs out */
export const SIGN_OUT_SECONDS = 30;
/** Shown by <SignOutNotice /> (in the root layout) */
export const SIGN_OUT_EVENT = "gatepass:sign-out";
let open = false;

/** Clears this device's login cookies (this device only), then the sign-in page */
export function signOutNow(reason: SignOutReason) {
  fetch("/api/auth/logout", { method: "POST", credentials: "include", signal: timeoutSignal(5_000) })
    .catch(() => {})
    .finally(() => window.location.replace(`/login?${reason}=1`));
}

/** "Stay signed in" on the notice */
export function staySignedIn() {
  open = false;
  markActive(true);
}

/**
 * ended: the login is no longer accepted (unauthorized) — signed out at once.
 * idle: no use for a long time — "Are you there?", then signed out.
 */
export function goToSignIn(reason: SignOutReason = "ended") {
  if (typeof window === "undefined" || open || window.location.pathname === "/login") return;
  // A refused request (often right after the laptop wakes, while the login is being renewed by
  // another request) never signs out at once: the page reloads with the newest login and the
  // server decides — it sends a really ended login to the sign-in page itself. Only a second
  // refusal within a minute signs out here. (Every role; Security also renews on the server.)
  if (reason === "ended") {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem("gatepass:auth-reload") || 0);
    } catch {}
    if (Date.now() - last > 60_000) {
      try {
        sessionStorage.setItem("gatepass:auth-reload", String(Date.now()));
      } catch {}
      open = true;
      window.location.reload();
      return;
    }
  }
  open = true;
  if (reason === "ended") {
    signOutNow(reason);
    return;
  }
  window.dispatchEvent(new CustomEvent<SignOutReason>(SIGN_OUT_EVENT, { detail: reason }));
}

/** Just signed in / signed out: the activity clock starts again (an old visit never counts as "away") */
export function resetActivity() {
  try {
    localStorage.setItem(IDLE_KEY, String(Date.now()));
  } catch {
    // storage blocked: nothing kept
  }
}

// ─── Sign-out after a long time without use (every role except Security) ───

/** No taps, typing or scrolling for this long (any tab of this browser): signed out */
export const IDLE_LIMIT_MS = 2 * 60 * 60_000;
const IDLE_KEY = "gatepass:last-active";
let lastWrite = 0;

function readLastActive(): number {
  try {
    return Number(localStorage.getItem(IDLE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Someone used the screen (written at most every 30 s; shared by all tabs) */
export function markActive(force = false) {
  const now = Date.now();
  if (!force && now - lastWrite < 30_000) return;
  lastWrite = now;
  try {
    localStorage.setItem(IDLE_KEY, String(now));
  } catch {
    // storage blocked: this tab alone keeps the time
  }
}

/** Starts watching; returns a stop function. Reopening after the limit signs out straight away (with the notice). */
export function watchIdle(): () => void {
  const last = readLastActive();
  // Back after a long time away (tab reopened, phone woken): "Are you there?"
  if (last && Date.now() - last > IDLE_LIMIT_MS) goToSignIn("idle");
  else markActive(true);
  const onUse = () => markActive();
  const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
  for (const e of events) window.addEventListener(e, onUse, { passive: true, capture: true });
  const check = () => {
    const at = readLastActive() || lastWrite;
    if (at && Date.now() - at > IDLE_LIMIT_MS) goToSignIn("idle");
  };
  const onVisible = () => document.visibilityState === "visible" && check();
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(check, 60_000);
  return () => {
    for (const e of events) window.removeEventListener(e, onUse, { capture: true });
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
  };
}

/**
 * Signing a device out with a clear message and a 5-second countdown, then
 * the sign-in page — instead of screens that quietly stop loading.
 * - The server no longer accepts this login ("Your login has ended").
 * - No use for a long time (every role except Security): "Stay signed in"
 *   cancels it when someone is there.
 * (Security tablets never come here: they stay signed in until Log out.)
 */
export type SignOutReason = "ended" | "idle";
export const SIGN_OUT_SECONDS = 5;
/** Shown by <SignOutNotice /> (in the root layout) */
export const SIGN_OUT_EVENT = "gatepass:sign-out";
let open = false;

/** Clears this device's login cookies (this device only), then the sign-in page */
export function signOutNow(reason: SignOutReason) {
  fetch("/api/auth/logout", { method: "POST", credentials: "include", signal: AbortSignal.timeout(5_000) })
    .catch(() => {})
    .finally(() => window.location.replace(`/login?${reason}=1`));
}

/** "Stay signed in" on the notice */
export function staySignedIn() {
  open = false;
  markActive(true);
}

export function goToSignIn(reason: SignOutReason = "ended") {
  if (typeof window === "undefined" || open || window.location.pathname === "/login") return;
  open = true;
  window.dispatchEvent(new CustomEvent<SignOutReason>(SIGN_OUT_EVENT, { detail: reason }));
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
  // Back after a long time away (tab reopened, phone woken)
  if (last && Date.now() - last > IDLE_LIMIT_MS) {
    goToSignIn("idle");
  } else {
    markActive(true);
  }
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

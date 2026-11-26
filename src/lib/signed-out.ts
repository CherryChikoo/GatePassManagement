/**
 * Signing a device out with a clear message and a 5-second countdown, then
 * the sign-in page — instead of screens that quietly stop loading.
 * - The server no longer accepts this login ("Your login has ended").
 * - No use for a long time (every role except Security): "Stay signed in"
 *   cancels it when someone is there.
 * (Security tablets never come here: they stay signed in until Log out.)
 */
let open = false;
const SECONDS = 5;

function signOutNow(reason: "ended" | "idle") {
  // Clears this device's login cookies (this device only), then the sign-in page
  fetch("/api/auth/logout", { method: "POST", credentials: "include", signal: AbortSignal.timeout(5_000) })
    .catch(() => {})
    .finally(() => window.location.replace(`/login?${reason}=1`));
}

export function goToSignIn(reason: "ended" | "idle" = "ended") {
  if (typeof window === "undefined" || open || window.location.pathname === "/login") return;
  open = true;

  const idle = reason === "idle";
  const btn =
    "margin-top:12px;height:48px;width:100%;border-radius:9999px;font-size:16px;font-weight:700;cursor:pointer";
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-live", "assertive");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.45);font-family:inherit";
  overlay.innerHTML = `
    <div style="width:100%;max-width:420px;border-radius:24px;background:#fff;padding:24px;box-shadow:0 24px 60px -20px rgba(16,24,40,0.45);text-align:center">
      <p style="margin:0;font-size:20px;font-weight:700;color:#18181b">${idle ? "No activity for a long time" : "Your login has ended"}</p>
      <p style="margin:12px 0 8px;font-size:16px;font-weight:600;color:#52525b">Signing out in <span data-n style="color:#ea580c">${SECONDS}</span> s</p>
      ${idle ? `<button type="button" data-stay style="${btn};border:0;background:#ea580c;color:#fff">Stay signed in</button>` : ""}
      <button type="button" data-out style="${btn};${idle ? "border:2px solid #d4d4d8;background:#fff;color:#3f3f46" : "border:0;background:#ea580c;color:#fff"}">${idle ? "Sign out now" : "Sign in again"}</button>
    </div>`;
  document.body.appendChild(overlay);

  const count = overlay.querySelector<HTMLElement>("[data-n]");
  let left = SECONDS;
  const timer = setInterval(() => {
    left -= 1;
    if (count) count.textContent = String(Math.max(0, left));
    if (left <= 0) {
      clearInterval(timer);
      signOutNow(reason);
    }
  }, 1000);
  overlay.querySelector("[data-out]")?.addEventListener("click", () => {
    clearInterval(timer);
    signOutNow(reason);
  });
  overlay.querySelector("[data-stay]")?.addEventListener("click", () => {
    clearInterval(timer);
    overlay.remove();
    open = false;
    markActive(true);
  });
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

/**
 * Helpers for "version skew": a tab opened before a new deployment still runs the
 * old JavaScript, so its server-action IDs no longer exist on the server.
 */

export const CLIENT_BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";

/** True for the error Next.js throws when a server action from an old build is called. */
export function isStaleDeploymentError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  return /Server Action .* was not found on the server|failed-to-find-server-action|Failed to find Server Action/i.test(msg);
}

/**
 * User-facing message for an unexpected server-action failure. Reloads the page
 * if the failure is caused by a newer deployment; never shows raw internals.
 */
export function actionErrorMessage(err: unknown, fallback: string): string {
  if (isStaleDeploymentError(err)) {
    reloadForNewDeployment();
    return "A new version of GatePass is available. Reloading…";
  }
  return fallback;
}

const RELOAD_GUARD_KEY = "gatepass:stale-reload-at";

/** Reloads the page to pick up the new deployment (at most once per 30 s to avoid loops). */
export function reloadForNewDeployment(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {}
  window.location.reload();
  return true;
}

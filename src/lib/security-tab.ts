/**
 * Security's bottom tab the guard last opened (Registers, Daily labours, Passes, Siros):
 * a book opened from a tab keeps that tab lit, and Go Back returns to it.
 */
const KEY = "gatepass:security-tab";
export const SECURITY_TABS = ["/security", "/security/labours", "/security/passes", "/security/siros"] as const;

export function rememberSecurityTab(path: string) {
  if (!(SECURITY_TABS as readonly string[]).includes(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {}
}

export function lastSecurityTab(): string {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v && (SECURITY_TABS as readonly string[]).includes(v)) return v;
  } catch {}
  return "/security";
}

/** The bottom tab a Security page belongs to */
export function securityTabFor(pathname: string): string | null {
  if ((SECURITY_TABS as readonly string[]).includes(pathname)) return pathname;
  if (pathname.startsWith("/security/scan")) return null;
  if (pathname.startsWith("/security/log") || pathname.startsWith("/security/faculty")) return "/security/passes";
  if (pathname.startsWith("/security/registers/")) return lastSecurityTab();
  if (pathname.startsWith("/security")) return "/security";
  return null;
}

"use client";

import { usePathname } from "next/navigation";

/**
 * True on Security screens. Their bigger, bolder design (page buttons, solid
 * popups, card rows…) stays there; every other login keeps the portal look.
 */
export function useSecurityLook(): boolean {
  return (usePathname() ?? "").startsWith("/security");
}

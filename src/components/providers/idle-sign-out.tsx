"use client";

import { useEffect } from "react";
import { watchIdle } from "@/lib/signed-out";

/** Signs out after a long time without use (src/lib/signed-out.ts). Never for Security: they sign out only by Log out. */
export function IdleSignOut({ role }: { role: string }) {
  useEffect(() => {
    if (role === "SECURITY") return;
    return watchIdle();
  }, [role]);
  return null;
}

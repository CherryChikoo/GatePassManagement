"use client";

import { useEffect } from "react";
import { CLIENT_BUILD_VERSION, isStaleDeploymentError, reloadForNewDeployment } from "@/lib/deployment";

/**
 * Keeps open tabs on the current deployment:
 * - when the tab becomes visible again (and every 5 minutes), compares its build
 *   version with /api/version and reloads if a newer deployment is live;
 * - if a server action still fails with "not found on the server", reloads.
 */
export function VersionWatcher() {
  useEffect(() => {
    if (CLIENT_BUILD_VERSION === "dev") return; // local development

    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (res.ok) {
          const { version } = await res.json();
          if (version && version !== "dev" && version !== CLIENT_BUILD_VERSION) {
            reloadForNewDeployment();
          }
        }
      } catch {
        // offline — try again later
      } finally {
        checking = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isStaleDeploymentError(e.reason)) reloadForNewDeployment();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    window.addEventListener("unhandledrejection", onRejection);
    // Also checked on focus / tab return, so a slow timer is enough
    const interval = setInterval(check, 15 * 60_000);
    check();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.removeEventListener("unhandledrejection", onRejection);
      clearInterval(interval);
    };
  }, []);

  return null;
}

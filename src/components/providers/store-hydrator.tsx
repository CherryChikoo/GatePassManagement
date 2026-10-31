"use client";

import { useEffect, useRef } from "react";
import { useOwnLive } from "@/lib/realtime/live";
import { useSafetyReload } from "@/lib/realtime/safety-reload";
import {
  useAppStore,
  hardNavigate,
  subscribeSessionEvents,
  type StoreUser,
} from "@/stores/app-store";

/**
 * StoreHydrator — renders nothing visible.
 * Dropped inside every signed-in layout. It:
 * 1. Initializes the client data store for this user (single preload request)
 * 2. Keeps this tab in sync with the browser's single session:
 *    - another tab logged out  → this tab goes to /login
 *    - another tab logged in   → this tab reloads as that user (or to /login)
 *    - page restored by Back/swipe from the browser cache → re-validated on the server
 */
/** Roles with requests to approve: their list reloads the moment a request arrives */
const APPROVER_ROLES = ["FACULTY_ADMIN", "DEAN", "WARDEN"];
/** Approver's screen open: a safety refresh this often while live… */
const APPROVER_SAFETY_MS = 2 * 60_000;
/** …and this often while the live connection is down */
const APPROVER_DOWN_MS = 30_000;

export function StoreHydrator({ user }: { user: StoreUser }) {
  const initialize = useAppStore((s) => s.initialize);
  const initialized = useRef(false);

  // A request for this approver arrived, was cancelled or decided elsewhere:
  // a small refresh (requests and counts, not the directories).
  const isApprover = APPROVER_ROLES.includes(user.role);
  const approverLive = useOwnLive((changed) => {
    if (changed.includes("requests") || changed.includes("*")) useAppStore.getState().refresh(true);
  }, isApprover);
  // If that live connection quietly died (laptop asleep, Wi-Fi change), new
  // requests must still show without reloading the page
  useSafetyReload(() => useAppStore.getState().refresh(true), {
    isLive: () => approverLive,
    whenLiveMs: APPROVER_SAFETY_MS,
    whenDownMs: APPROVER_DOWN_MS,
    enabled: isApprover,
  });

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initialize(user);
    }
  }, [user, initialize]);

  useEffect(() => {
    const unsubscribe = subscribeSessionEvents((event) => {
      useAppStore.getState().reset();
      hardNavigate(event.type === "logout" ? "/login" : "/");
    });

    // Back/forward cache restores a frozen page without asking the server.
    // Reload it so the proxy re-checks the session (→ /login after logout).
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);

    // Internet back after a drop: anything that changed meanwhile shows at once
    const onOnline = () => useAppStore.getState().refresh(true);
    window.addEventListener("online", onOnline);

    // When the tab becomes visible again, confirm the session still belongs to this user
    // (at most once every 30 s — switching apps back and forth sends no extra requests).
    const onVisible = () => {
      if (document.visibilityState === "visible") useAppStore.getState().refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubscribe();
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

/**
 * True once the store has loaded data for the current user.
 */
export function useStoreReady(): boolean {
  const isInitialized = useAppStore((s) => s.isInitialized);
  const isLoading = useAppStore((s) => s.isLoading);
  return isInitialized && !isLoading;
}

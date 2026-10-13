"use client";

import { useEffect, useRef } from "react";
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
export function StoreHydrator({ user }: { user: StoreUser }) {
  const initialize = useAppStore((s) => s.initialize);
  const initialized = useRef(false);

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

    // When the tab becomes visible again, confirm the session still belongs to this user.
    const onVisible = () => {
      if (document.visibilityState === "visible") useAppStore.getState().refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubscribe();
      window.removeEventListener("pageshow", onPageShow);
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

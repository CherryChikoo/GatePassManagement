"use client";

import { useEffect, useRef } from "react";
import { useAppStore, type StoreUser } from "@/stores/app-store";

/**
 * StoreHydrator — renders nothing visible.
 * Drop it inside any role layout to initialize the store for that user.
 *
 * It:
 * 1. Calls store.initialize(user) on mount — triggers a single preload API call
 * 2. The store handles background sync (30s interval + tab focus)
 * 3. Clears the store on unmount if the user logs out
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

  return null;
}

/**
 * Hook to check if the store has been hydrated from localStorage.
 * Use this to avoid hydration mismatches in SSR.
 */
export function useStoreReady(): boolean {
  const isInitialized = useAppStore((s) => s.isInitialized);
  const isLoading = useAppStore((s) => s.isLoading);
  return isInitialized && !isLoading;
}

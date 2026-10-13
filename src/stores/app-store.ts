"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StoreUser {
  name: string;
  email: string;
  role: string;
  profileId: string;
}

/**
 * All data is stored flat under string keys.
 * Each role uses the keys it needs:
 *
 * FACULTY:  dashboard, requests, students, wardens
 * WARDEN:   dashboard, requests, students, wardens
 * STUDENT:  dashboard, formData, history
 * SECURITY: dashboard, log, outsiders, gates
 * ADMIN:    dashboard, users, gates, activity, faculty, wardens, allGates
 */
export type StoreData = Record<string, any>;

interface AppState {
  user: StoreUser | null;
  data: StoreData;
  isInitialized: boolean;
  isLoading: boolean;
  lastSyncAt: number;
  error: string | null;
}

interface AppActions {
  /** First-time init: sets user, fetches all data */
  initialize: (user: StoreUser) => Promise<void>;
  /** Background refresh — silent, no loading state. Use force=true to bypass throttle */
  refresh: (force?: boolean) => Promise<void>;
  /** Set a single data key */
  setData: (key: string, value: any) => void;
  /** Immutably update a single data key */
  updateData: (key: string, updater: (prev: any) => any) => void;
  /** Completely reset the store (logout) */
  reset: () => void;
}

export type AppStore = AppState & AppActions;

// ─── Constants ──────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 15_000; // 15 seconds for near real-time sync across all dashboards
const STORE_NAME = "gatepass-store";
const STALE_THRESHOLD_MS = 5 * 60_000; // 5 minutes — force re-fetch if older
const THROTTLE_MS = 10_000; // 10 seconds — prevent tab-switch spam but allow frequent syncs

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchPreload(): Promise<StoreData> {
  const res = await fetch("/api/data/preload", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Preload failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ─── Store ──────────────────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;

function startBackgroundSync(refresh: (force?: boolean) => Promise<void>) {
  stopBackgroundSync();

  // Periodic sync (every 15s, but ONLY if the tab is actively open/visible)
  syncTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === "visible") {
      refresh();
    }
  }, SYNC_INTERVAL_MS);

  // Visibility change — refresh immediately when user returns to tab
  visibilityHandler = () => {
    if (typeof document !== 'undefined' && document.visibilityState === "visible") {
      refresh(); // Will be throttled if called too recently
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener("visibilitychange", visibilityHandler);
  }
}

function stopBackgroundSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── State ───────────────────────────────
      user: null,
      data: {},
      isInitialized: false,
      isLoading: false,
      lastSyncAt: 0,
      error: null,

      // ── Actions ─────────────────────────────
      initialize: async (user: StoreUser) => {
        const state = get();

        // Already initialized for this user AND data isn't stale
        if (
          state.isInitialized &&
          state.user?.profileId === user.profileId &&
          Date.now() - state.lastSyncAt < STALE_THRESHOLD_MS
        ) {
          startBackgroundSync(get().refresh);
          return;
        }

        // Different user — reset first
        if (state.user && state.user.profileId !== user.profileId) {
          stopBackgroundSync();
          set({ data: {}, isInitialized: false, lastSyncAt: 0 });
        }

        set({ user, isLoading: true, error: null });

        try {
          const preloadData = await fetchPreload();
          set({
            data: preloadData,
            isInitialized: true,
            isLoading: false,
            lastSyncAt: Date.now(),
            error: null,
          });
          startBackgroundSync(get().refresh);
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
          // Even on error, start sync so it retries
          startBackgroundSync(get().refresh);
        }
      },

      refresh: async (force = false) => {
        const state = get();
        if (!state.user || !state.isInitialized) return;

        // Throttle rapid refreshes (e.g. tab spam) unless explicitly forced
        if (!force && Date.now() - state.lastSyncAt < THROTTLE_MS) {
          return;
        }

        try {
          const preloadData = await fetchPreload();
          set({
            data: preloadData,
            lastSyncAt: Date.now(),
            error: null,
          });
        } catch {
          // Silent fail on background sync — data is still usable
        }
      },

      setData: (key, value) => {
        set((state) => ({
          data: { ...state.data, [key]: value },
        }));
      },

      updateData: (key, updater) => {
        set((state) => ({
          data: { ...state.data, [key]: updater(state.data[key]) },
        }));
      },

      reset: () => {
        stopBackgroundSync();
        set({
          user: null,
          data: {},
          isInitialized: false,
          isLoading: false,
          lastSyncAt: 0,
          error: null,
        });
        try {
          localStorage.removeItem(STORE_NAME);
        } catch {}
      },
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => {
        // Safe storage wrapper for SSR
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      // Only persist essential data — no timers, no loading states
      partialize: (state) => ({
        user: state.user,
        data: state.data,
        isInitialized: state.isInitialized,
        lastSyncAt: state.lastSyncAt,
      }),
    }
  )
);

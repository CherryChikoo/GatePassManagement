"use client";

import { create } from "zustand";

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

// Background sync while the tab is visible. Data is also refreshed immediately
// after every action and whenever the user returns to the tab, so a longer
// interval keeps serverless/database usage within free-tier limits without
// making the UI feel stale.
const SYNC_INTERVAL_MS = 45_000;
const LEGACY_STORE_NAME = "gatepass-store";
const STALE_THRESHOLD_MS = 5 * 60_000; // 5 minutes — force re-fetch if older
const THROTTLE_MS = 10_000; // 10 seconds — prevent tab-switch spam but allow frequent syncs

// Data is kept in memory only. Older versions persisted every dashboard's
// data (names, phones, QR tokens) to localStorage; wipe any leftover copy.
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem(LEGACY_STORE_NAME);
  } catch {}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

class SessionExpiredError extends Error {}

async function fetchPreload(): Promise<StoreData> {
  const res = await fetch("/api/data/preload", {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new SessionExpiredError("Session expired");
  if (!res.ok) {
    throw new Error(res.status >= 500 ? "Server error while loading data. Retrying…" : `Failed to load data (${res.status})`);
  }
  return res.json();
}

/**
 * Full-page navigation that REPLACES the current history entry. Used whenever
 * the session ends or changes, so the in-app router cache and the back/forward
 * history of the old session are discarded (swiping back cannot reveal it).
 */
export function hardNavigate(path: string) {
  if (typeof window === "undefined") return;
  window.location.replace(path);
}

function handleSessionExpired() {
  stopBackgroundSync();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    hardNavigate("/login");
  }
}

// ─── Cross-tab session sync ─────────────────────────────────────────────────
// One browser = one signed-in user. Tabs tell each other when someone logs in
// or out, so a tab never keeps showing a previous user's screens.

const SESSION_CHANNEL = "gatepass-session";
const SESSION_EVENT_KEY = "gatepass:session-event";

export type SessionEvent = { type: "login" | "logout"; at: number };

export function broadcastSessionEvent(type: SessionEvent["type"]) {
  if (typeof window === "undefined") return;
  const event: SessionEvent = { type, at: Date.now() };
  try {
    const ch = new BroadcastChannel(SESSION_CHANNEL);
    ch.postMessage(event);
    ch.close();
  } catch {}
  // Fallback for browsers without BroadcastChannel (fires `storage` in other tabs)
  try {
    window.localStorage.setItem(SESSION_EVENT_KEY, JSON.stringify(event));
  } catch {}
}

export function subscribeSessionEvents(onEvent: (e: SessionEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(SESSION_CHANNEL);
    ch.onmessage = (m) => onEvent(m.data as SessionEvent);
  } catch {}
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SESSION_EVENT_KEY || !e.newValue) return;
    try {
      onEvent(JSON.parse(e.newValue));
    } catch {}
  };
  window.addEventListener("storage", onStorage);
  return () => {
    ch?.close();
    window.removeEventListener("storage", onStorage);
  };
}

/** The server says the cookie now belongs to someone else → load that user's home. */
function handleSessionChanged() {
  stopBackgroundSync();
  hardNavigate("/");
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
          // Another tab signed in as a different user → this tab must not show the old screens
          if (preloadData.__profileId && preloadData.__profileId !== get().user?.profileId) {
            handleSessionChanged();
            return;
          }
          set({
            data: preloadData,
            isInitialized: true,
            isLoading: false,
            lastSyncAt: Date.now(),
            error: null,
          });
          startBackgroundSync(get().refresh);
        } catch (err: any) {
          if (err instanceof SessionExpiredError) {
            set({ isLoading: false });
            handleSessionExpired();
            return;
          }
          set({ error: err.message, isLoading: false });
          // Even on error, start sync so it retries
          startBackgroundSync(get().refresh);
        }
      },

      refresh: async (force = false) => {
        const state = get();
        if (!state.user) return;

        // Throttle rapid refreshes (e.g. tab spam) unless explicitly forced
        if (!force && Date.now() - state.lastSyncAt < THROTTLE_MS) {
          return;
        }

        try {
          const preloadData = await fetchPreload();
          // Another tab signed in as a different user → this tab must not show the old screens
          if (preloadData.__profileId && preloadData.__profileId !== get().user?.profileId) {
            handleSessionChanged();
            return;
          }
          set({
            data: preloadData,
            isInitialized: true,
            lastSyncAt: Date.now(),
            error: null,
          });
        } catch (err: any) {
          if (err instanceof SessionExpiredError) {
            handleSessionExpired();
            return;
          }
          // Keep showing existing data; surface the error if we have nothing yet
          if (!get().isInitialized) set({ error: err.message });
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
          localStorage.removeItem(LEGACY_STORE_NAME);
        } catch {}
      },
    })
);

/**
 * Logs the user out: clears all cached client data first (so nothing from this
 * session remains in memory or storage), then ends the server session.
 */
export async function logoutAndClear(logout: () => Promise<unknown>) {
  useAppStore.getState().reset();
  await logout(); // throws on failure → caller re-enables the button
  broadcastSessionEvent("logout");
  // Replace (not push) so Back/swipe cannot return to the signed-in screens
  hardNavigate("/login");
}

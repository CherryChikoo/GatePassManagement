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
  /**
   * Background refresh — silent, no loading state. force=true bypasses the
   * throttle (after a save). full=true also reloads the people directories
   * (after adding / changing users); otherwise they come at most every 30 min.
   */
  refresh: (force?: boolean, full?: boolean) => Promise<void>;
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
// after every action and whenever the user returns to the tab, and the screens
// that wait on something (pass approval, gate scan, gate registers) get live
// pings — so this slow sync is only a safety net. Every request counts against
// Vercel Hobby's monthly function allowance (1M): at 45 s, 500 open tabs alone
// would use it up in under a month.
const SYNC_INTERVAL_MS = 5 * 60_000;
const LEGACY_STORE_NAME = "gatepass-store";
const STALE_THRESHOLD_MS = 5 * 60_000; // 5 minutes — force re-fetch if older
/**
 * People directories (department students, hostellers, faculty lists) are the
 * bulk of each role's data and rarely change, so the regular refresh skips
 * them (?light=1) and they are reloaded in full at most this often. Keeps the
 * repeated downloads small (Supabase free plan: 5 GB of data out a month).
 */
const FULL_RELOAD_MS = 30 * 60_000;
/** When the last full (with directories) load arrived */
let lastFullAt = 0;
const THROTTLE_MS = 30_000; // 30 seconds — switching tabs back and forth reloads at most this often

// Data is kept in memory only. Older versions persisted every dashboard's
// data (names, phones, QR tokens) to localStorage; wipe any leftover copy.
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem(LEGACY_STORE_NAME);
  } catch {}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

class SessionExpiredError extends Error {}

async function fetchPreload(light = false): Promise<StoreData> {
  let res: Response;
  try {
    res = await fetch(light ? "/api/data/preload?light=1" : "/api/data/preload", {
      credentials: "include",
      cache: "no-store",
      // Never waits forever (e.g. after the portal sat idle): the screen offers Retry
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err: any) {
    throw new Error(
      err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "Taking too long to load. Check the connection and retry."
        : "No internet connection. Check the network and retry."
    );
  }
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
/** The preload request currently running, shared by concurrent refresh() calls */
let refreshInFlight: Promise<void> | null = null;
/** A forced refresh asked for while another was running: runs right after it */
let forcedFollowUp: Promise<void> | null = null;
/**
 * Bumped on every local change (setData / updateData, e.g. a row removed right
 * after a delete). A preload answer whose request started before a local change
 * holds the data from before it, so it must not overwrite the screen — the
 * forced refresh the screen asks for after its save brings the new data.
 */
let localChangeNo = 0;
let visibilityHandler: (() => void) | null = null;

function startBackgroundSync(refresh: (force?: boolean) => Promise<void>) {
  stopBackgroundSync();

  // Periodic sync (every SYNC_INTERVAL_MS, only while the tab is visible)
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

        // Already loaded for this user: show it at once. An older copy (over 5 min,
        // e.g. back from Settings or a hidden tab) is refreshed in the background
        // instead of hiding every screen behind a loading skeleton.
        if (state.isInitialized && state.user?.profileId === user.profileId) {
          startBackgroundSync(get().refresh);
          if (Date.now() - state.lastSyncAt >= STALE_THRESHOLD_MS) void get().refresh(true);
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
          lastFullAt = Date.now();
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

      refresh: async (force = false, full = false) => {
        const state = get();
        if (!state.user) return;

        // Throttle rapid refreshes (e.g. tab spam) unless explicitly forced
        if (!force && Date.now() - state.lastSyncAt < THROTTLE_MS) {
          return;
        }
        if (refreshInFlight) {
          // Not forced (poll, tab return): share the running request.
          if (!force) return refreshInFlight;
          // Forced (after a save): the running request may have left before the
          // save reached the database, so ask again once it is done (one follow-up
          // for any number of saves meanwhile).
          forcedFollowUp ??= refreshInFlight.then(() => {
            forcedFollowUp = null;
            return get().refresh(true, full);
          });
          return forcedFollowUp;
        }

        const startedAt = localChangeNo;
        // Light unless asked for, or the directories are due (or never loaded)
        const light = !full && state.isInitialized && Date.now() - lastFullAt < FULL_RELOAD_MS;
        refreshInFlight = (async () => {
        try {
          const preloadData = await fetchPreload(light);
          // Another tab signed in as a different user → this tab must not show the old screens
          if (preloadData.__profileId && preloadData.__profileId !== get().user?.profileId) {
            handleSessionChanged();
            return;
          }
          // Changed on screen while this was loading: this answer is older than
          // that change (the follow-up refresh brings the up-to-date data)
          if (localChangeNo !== startedAt) return;
          if (!light) lastFullAt = Date.now();
          set({
            // Light answer: everything except the directories — keep those from the last full load
            data: light ? { ...get().data, ...preloadData } : preloadData,
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
        })().finally(() => {
          refreshInFlight = null;
        });
        return refreshInFlight;
      },

      setData: (key, value) => {
        localChangeNo++;
        set((state) => ({
          data: { ...state.data, [key]: value },
        }));
      },

      updateData: (key, updater) => {
        localChangeNo++;
        set((state) => ({
          data: { ...state.data, [key]: updater(state.data[key]) },
        }));
      },

      reset: () => {
        stopBackgroundSync();
        lastFullAt = 0;
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
  // Sign out through POST /api/auth/logout: a plain request that never waits
  // behind another server action and whose cookie clearing can't be undone by
  // a session refresh. The server action `logout` is only the fallback.
  let ok = false;
  try {
    const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include", signal: AbortSignal.timeout(10_000) });
    ok = res.ok;
  } catch {}
  if (!ok) await logout(); // throws on failure → caller re-enables the button
  broadcastSessionEvent("logout");
  // Replace (not push) so Back/swipe cannot return to the signed-in screens
  hardNavigate("/login");
}

"use client";

/**
 * Live updates (browser side).
 *
 * One Supabase Realtime connection per tab, carrying the private channels that
 * the open screens need:
 * - "gatepass-live": gate staff screens (registers, visitors, attendance…)
 * - "user:<id>": this user's own pass changes (approved, scanned…)
 *
 * A channel is joined only while a screen listening to it is showing, and
 * everything is closed when the tab has been in the background for a minute
 * (Supabase's free plan allows 200 connections at once); coming back
 * reconnects and refreshes once, in case something changed meanwhile.
 *
 * The server sends topic names only (see src/lib/realtime/notify.ts); each
 * screen reloads its own data when one of its topics arrives.
 */
import { useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { LIVE_CHANNEL, LIVE_EVENT, personalTopic } from "./topics";

type Listener = (topics: string[]) => void;

type Chan = {
  listeners: Set<Listener>;
  /** Told whether the channel is currently connected (screens poll less while it is) */
  statusListeners: Set<(live: boolean) => void>;
  channel: RealtimeChannel | null;
  connecting: boolean;
  live: boolean;
  /** Not allowed, or no free connection: stop trying until the page reloads */
  refused: boolean;
  /** Closed while the tab was hidden: refresh once when it comes back */
  dropped: boolean;
};

const HIDDEN_DISCONNECT_MS = 60_000;

const chans = new Map<string, Chan>();
let client: SupabaseClient | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
let signedOut = false;
type Session = { token: string; expiresAt: number; userId: string };
let session: Session | null = null;
let sessionRequest: Promise<Session | null> | null = null;

/** Access token + user id from the server (the browser never refreshes tokens itself). */
function getSession(): Promise<Session | null> {
  if (session && session.expiresAt - Date.now() > 2 * 60_000) return Promise.resolve(session);
  sessionRequest ??= fetch("/api/realtime/token", { credentials: "include", cache: "no-store" })
    .then(async (res): Promise<Session | null> => {
      if (!res.ok) {
        if (res.status === 401) signedOut = true;
        return null;
      }
      const body = await res.json();
      session = {
        token: String(body.token),
        expiresAt: Number(body.expiresAt) || Date.now() + 30 * 60_000,
        userId: String(body.userId),
      };
      return session;
    })
    .catch(() => null)
    .finally(() => {
      sessionRequest = null;
    });
  return sessionRequest;
}

const getToken = async () => (await getSession())?.token ?? null;

function emit(c: Chan, topics: string[]) {
  for (const l of c.listeners) l(topics);
}

function setLive(c: Chan, live: boolean) {
  if (c.live === live) return;
  c.live = live;
  for (const s of c.statusListeners) s(live);
}

async function connect(name: string) {
  const c = chans.get(name);
  if (!c || c.channel || c.connecting || c.refused || signedOut || !c.listeners.size) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  c.connecting = true;
  try {
    if (!(await getToken())) return;
    client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      // Realtime only: the token comes from our server, never from browser storage
      accessToken: getToken as () => Promise<string>,
    });
    // Load the token through the callback (not a fixed value), so it is renewed later
    await client.realtime.setAuth();
    if (c.channel || !c.listeners.size || chans.get(name) !== c) return;
    let joined = false;
    const ch = client.channel(name, { config: { private: true } });
    c.channel = ch;
    ch.on("broadcast", { event: LIVE_EVENT }, (msg) => {
      const raw = (msg.payload as { topics?: unknown })?.topics;
      const topics = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
      if (topics.length) emit(c, topics);
    }).subscribe((status) => {
      if (c.channel !== ch) return;
      if (status === "SUBSCRIBED") {
        // Joined again after a drop: changes may have been missed meanwhile
        if (joined) emit(c, ["*"]);
        joined = true;
        setLive(c, true);
      } else {
        setLive(c, false);
        if (status === "CHANNEL_ERROR" && !joined) {
          // Not allowed / no free connection: screens keep working without live updates
          c.refused = true;
          console.info(`[live] live updates are off (${name.startsWith("user:") ? "own passes" : name})`);
          disconnect(c);
        }
      }
    });
  } finally {
    c.connecting = false;
  }
}

function disconnect(c: Chan) {
  const ch = c.channel;
  c.channel = null;
  setLive(c, false);
  if (ch && client) void client.removeChannel(ch);
}

function onVisibility() {
  if (document.visibilityState === "visible") {
    if (hiddenTimer) {
      clearTimeout(hiddenTimer);
      hiddenTimer = null;
    }
    for (const [name, c] of chans) {
      if (c.channel || c.refused || !c.listeners.size) continue;
      void connect(name);
      if (c.dropped) {
        c.dropped = false;
        emit(c, ["*"]);
      }
    }
  } else if (!hiddenTimer && [...chans.values()].some((c) => c.channel)) {
    hiddenTimer = setTimeout(() => {
      hiddenTimer = null;
      for (const c of chans.values()) {
        if (!c.channel) continue;
        disconnect(c);
        c.dropped = true;
      }
    }, HIDDEN_DISCONNECT_MS);
  }
}

function listen(name: string, listener: Listener, onStatus?: (live: boolean) => void) {
  let c = chans.get(name);
  if (!c) {
    c = { listeners: new Set(), statusListeners: new Set(), channel: null, connecting: false, live: false, refused: false, dropped: false };
    chans.set(name, c);
  }
  if (chans.size === 1 && !c.listeners.size && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  const chan = c;
  chan.listeners.add(listener);
  if (onStatus) {
    chan.statusListeners.add(onStatus);
    onStatus(chan.live);
  }
  void connect(name);
  return () => {
    chan.listeners.delete(listener);
    if (onStatus) chan.statusListeners.delete(onStatus);
    if (chan.listeners.size) return;
    disconnect(chan);
    chans.delete(name);
    if (!chans.size && typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** Topic matching: "reg:" (ending in a colon) matches every "reg:<KEY>"; "*" = reconnected. */
function matcher(wanted: string[]) {
  return (t: string) => t === "*" || wanted.some((w) => (w.endsWith(":") ? t.startsWith(w) : t === w));
}

/** Debounces bursts of pings into one call with every changed topic. */
function batcher(onFire: (topics: string[]) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Set<string>();
  return {
    push(topics: string[]) {
      topics.forEach((t) => pending.add(t));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const list = [...pending];
        pending.clear();
        onFire(list);
      }, ms);
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Gate screens: calls `onChange` with the changed topics when the server
 * reports a change in one of `topics`, or with ["*"] after a reconnect.
 * Pings close together cause one call.
 */
export function useLiveTopics(topics: string[], onChange: (changed: string[]) => void, enabled = true) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const key = topics.join("|");
  useEffect(() => {
    if (!enabled || !key) return;
    const matches = matcher(key.split("|"));
    const batch = batcher((list) => cb.current(list), 600);
    const remove = listen(LIVE_CHANNEL, (changed) => {
      const hit = changed.filter(matches);
      if (hit.length) batch.push(hit);
    });
    return () => {
      batch.cancel();
      remove();
    };
  }, [key, enabled]);
}

/**
 * The signed-in user's own changes (e.g. "pass:<id>" when their pass is
 * approved or scanned). Returns whether the live connection is up, so the
 * screen can check less often while it is.
 */
export function useOwnLive(onChange: (changed: string[]) => void, enabled = true): boolean {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let remove: (() => void) | null = null;
    let cancelled = false;
    getSession().then((s) => {
      if (cancelled || !s?.userId) return;
      remove = listen(personalTopic(s.userId), (changed) => cb.current(changed), setLive);
    });
    return () => {
      cancelled = true;
      remove?.();
      setLive(false);
    };
  }, [enabled]);
  return enabled && live;
}

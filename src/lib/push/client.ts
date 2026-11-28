"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Phone / desktop notifications on this device (browser side): registers the
 * service worker (public/sw.js), asks permission once (only after a tap), and
 * keeps this device's subscription saved for the signed-in person.
 * iPhone: only works for the portal added to the Home Screen (Apple's rule).
 */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID;
}

export function isIOS(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isInstalled(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;
export function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
  return registration;
}

async function save(sub: PushSubscription) {
  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
  });
}

/** Already allowed on this device: make sure it is saved for whoever is signed in now */
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await registerWorker();
  if (!reg) return;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }).catch(() => null));
  if (sub) await save(sub).catch(() => {});
}

/** Turned off on purpose in Settings: never asked again automatically on this device */
const OFF_KEY = "gatepass_push_off";
function turnedOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}
function setTurnedOff(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, "1");
    else localStorage.removeItem(OFF_KEY);
  } catch {}
}

let autoAskArmed = false;
/**
 * Alerts on by default: browsers show "Allow notifications?" only right after a tap, so the
 * first tap anywhere in the portal (after sign-in) asks once. Allowed → this device is signed up.
 * Not asked again after "Block", or when turned off in Settings.
 */
export function autoAskOnFirstTap() {
  if (autoAskArmed || !pushSupported() || Notification.permission !== "default" || turnedOff()) return;
  if (isIOS() && !isInstalled()) return;
  autoAskArmed = true;
  const ask = (e: Event) => {
    // The scanner asks for the camera: not both questions at once (next tap instead)
    const target = e.target as Element | null;
    if (window.location.pathname.startsWith("/security/scan") || target?.closest?.('a[href^="/security/scan"]')) return;
    document.removeEventListener("click", ask, true);
    // Inside the tap: the browser allows the question here
    let asking: Promise<NotificationPermission>;
    try {
      asking = Promise.resolve(Notification.requestPermission());
    } catch {
      return;
    }
    void asking
      .then(async (permission) => {
        if (permission !== "granted") return;
        const reg = await registerWorker();
        if (!reg) return;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
        await save(sub);
        window.dispatchEvent(new Event("gatepass:push-changed"));
      })
      .catch(() => {});
  };
  document.addEventListener("click", ask, true);
}

export type PushState = "unsupported" | "needs-install" | "off" | "on" | "blocked";

/** The device's notification state, with turn on / off / test */
export function usePush() {
  const [state, setState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (isIOS() && !isInstalled()) return setState("needs-install");
    if (!pushSupported()) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    const reg = await registerWorker();
    const sub = await reg?.pushManager.getSubscription();
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, []);

  useEffect(() => {
    void refresh();
    const again = () => void refresh();
    window.addEventListener("gatepass:push-changed", again);
    return () => window.removeEventListener("gatepass:push-changed", again);
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!pushSupported()) return;
    setBusy(true);
    try {
      setTurnedOff(false);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await registerWorker();
      if (!reg) return;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
      await save(sub);
      setState("on");
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await registerWorker();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      // Off on purpose: not asked again automatically
      setTurnedOff(true);
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    await fetch("/api/push/test", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delay: 5 }),
    }).catch(() => {});
  }, []);

  return { state, busy, enable, disable, test };
}

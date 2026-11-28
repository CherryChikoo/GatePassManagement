"use client";

/**
 * Calls a gate function through POST /api/gate (src/app/api/gate/route.ts)
 * instead of as a server action: it runs side by side with other calls, and
 * after `timeoutMs` the request is really cancelled (a server action can only
 * be stopped being waited for, while it keeps blocking the page's next ones).
 *
 *   const res = await callGate("registerExit", [permissionId, gateId, photo, notes]);
 *
 * Throws an Error named "TimeoutError" (message for the guard) when it takes
 * too long, and a plain Error when there is no network.
 */
import type { GateFunctions } from "@/app/api/gate/route";
import type { ListFunctions } from "@/app/api/lists/route";
import { encodeGateArgs } from "@/lib/gate-wire";
import { goToSignIn } from "@/lib/signed-out";
import { timeoutSignal } from "@/lib/timeout-signal";

type Fn = keyof GateFunctions;
type Result<K extends Fn> = Awaited<ReturnType<GateFunctions[K]>>;

async function post(url: string, fn: string, args: readonly unknown[], timeoutMs: number, again = true): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // Optional arguments left out stay "left out" on the server (see gate-wire.ts)
      body: JSON.stringify({ fn, args: encodeGateArgs(args) }),
      signal: timeoutSignal(timeoutMs),
    });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw Object.assign(new Error("Taking too long. Check the connection and try again."), { name: "TimeoutError" });
    }
    throw new Error("No internet connection. Check the network and try again.");
  }
  // Read the whole answer: a body cut off mid-way, or a Wi-Fi login page answering 200,
  // must never count as "saved" (a real JSON null still reads as null)
  let data: unknown;
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : null;
    if (!text && res.ok) throw new Error("empty");
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw Object.assign(new Error("Taking too long. Check the connection and try again."), { name: "TimeoutError" });
    }
    if (res.status === 401) data = null;
    else throw new Error("Something went wrong. Please try again.");
  }
  if (res.status === 401) {
    // Often a login renewed by another request a moment ago: once more, then the sign-in page
    if (again) {
      await new Promise((r) => setTimeout(r, 1500));
      return post(url, fn, args, timeoutMs, false);
    }
    goToSignIn();
    throw new Error("Please sign in again.");
  }
  // Server failure (500 and up): thrown, so a safe call is sent once more (same one-time token)
  if (res.status >= 500 || (!res.ok && (!data || typeof data !== "object" || !("error" in data)))) throw new Error("Something went wrong. Please try again.");
  return data;
}

/**
 * Calls that are safe to send twice: reads, and register saves that carry the
 * form's one-time token (the server stores such a save once, however often it
 * arrives). Photo uploads too (a second copy is only an unused file).
 */
const RETRY_SAFE = /^(get|list|search|count|lookup|fetch)[A-Z]|^(createRegisterEntry|completeRegisterEntry|updateRegisterField|uploadRegisterPhoto|uploadOutsiderPhoto|verifyQrScan)$/;

/** A slow or dropped connection, or the server busy for a moment (not a real "no") */
function isPassing(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  return e?.name === "TimeoutError" || /^No internet|^Something went wrong/.test(e?.message ?? "");
}

export async function callGate<K extends Fn>(fn: K, args: Parameters<GateFunctions[K]>, timeoutMs = 20_000): Promise<Result<K>> {
  try {
    return (await post("/api/gate", fn, args, timeoutMs)) as Result<K>;
  } catch (err) {
    // Busy gate (weak mobile data in a crowd, many saves at once): once more after a short pause
    if (!RETRY_SAFE.test(fn) || !isPassing(err)) throw err;
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
    return (await post("/api/gate", fn, args, timeoutMs)) as Result<K>;
  }
}

type ListFn = keyof ListFunctions;

/** Same as callGate, for the approvers' paged lists (POST /api/lists, src/app/api/lists/route.ts). */
export async function callList<K extends ListFn>(
  fn: K,
  args: Parameters<ListFunctions[K]>,
  timeoutMs = 20_000
): Promise<Awaited<ReturnType<ListFunctions[K]>>> {
  return (await post("/api/lists", fn, args, timeoutMs)) as Awaited<ReturnType<ListFunctions[K]>>;
}

let lastWarm = 0;
/** A form opened: wake the server so its Save is quick. Never waits and never shows an error. */
export function warmGate() {
  if (Date.now() - lastWarm < 60_000) return;
  lastWarm = Date.now();
  callGate("warmUp", [], 10_000).catch(() => {});
}

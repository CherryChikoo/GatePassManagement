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

type Fn = keyof GateFunctions;
type Result<K extends Fn> = Awaited<ReturnType<GateFunctions[K]>>;

async function post(url: string, fn: string, args: readonly unknown[], timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // Optional arguments left out stay "left out" on the server (see gate-wire.ts)
      body: JSON.stringify({ fn, args: encodeGateArgs(args) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw Object.assign(new Error("Taking too long. Check the connection and try again."), { name: "TimeoutError" });
    }
    throw new Error("No internet connection. Check the network and try again.");
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new Error((data && data.error) || "Please sign in again.");
  if (!res.ok && (!data || typeof data !== "object" || !("error" in data))) throw new Error("Something went wrong. Please try again.");
  return data;
}

/**
 * Calls that are safe to send twice: reads, and register saves that carry the
 * form's one-time token (the server stores such a save once, however often it
 * arrives). Photo uploads too (a second copy is only an unused file).
 */
const RETRY_SAFE = /^(get|list|search|count|lookup|fetch)[A-Z]|^(createRegisterEntry|completeRegisterEntry|updateRegisterField|uploadRegisterPhoto|uploadOutsiderPhoto)$/;

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

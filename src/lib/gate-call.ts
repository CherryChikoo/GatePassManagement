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
import { encodeGateArgs } from "@/lib/gate-wire";

type Fn = keyof GateFunctions;
type Result<K extends Fn> = Awaited<ReturnType<GateFunctions[K]>>;

export async function callGate<K extends Fn>(fn: K, args: Parameters<GateFunctions[K]>, timeoutMs = 20_000): Promise<Result<K>> {
  let res: Response;
  try {
    res = await fetch("/api/gate", {
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
  return data as Result<K>;
}

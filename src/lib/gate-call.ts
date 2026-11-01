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

export async function callGate<K extends Fn>(fn: K, args: Parameters<GateFunctions[K]>, timeoutMs = 20_000): Promise<Result<K>> {
  return (await post("/api/gate", fn, args, timeoutMs)) as Result<K>;
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

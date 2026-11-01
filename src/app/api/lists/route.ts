import { NextResponse } from "next/server";
import { decodeGateArgs } from "@/lib/gate-wire";
import { getAuthUser } from "@/lib/auth/helpers";
import { getWardenRequests } from "@/server/actions/approvals";

/**
 * Paged lists for approver screens, called like the gate functions
 * (POST /api/gate, see src/app/api/gate/route.ts) through callList
 * (src/lib/gate-call.ts): each call is its own request that runs side by side
 * with others and is really cancelled after its time limit — never a server
 * action, which the browser runs one at a time.
 *
 * Only the functions listed here can be called; each still checks the
 * signed-in user's role itself.
 *
 * POST { fn: "<name>", args: [...] }  ->  the function's result (JSON)
 */
export const dynamic = "force-dynamic";

const LIST_FUNCTIONS = {
  // Warden → Student Requests (one page at a time, tab counts from the server)
  getWardenRequests,
} as const;

export type ListFunctions = typeof LIST_FUNCTIONS;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  if (!(await getAuthUser())) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as { fn?: unknown; args?: unknown } | null;
  const name = typeof body?.fn === "string" ? body.fn : "";
  const fn = Object.prototype.hasOwnProperty.call(LIST_FUNCTIONS, name) ? (LIST_FUNCTIONS as Record<string, (...a: unknown[]) => Promise<unknown>>)[name] : null;
  if (!fn) return NextResponse.json({ error: "Unknown request" }, { status: 400, headers: NO_STORE });
  const args = Array.isArray(body?.args) ? decodeGateArgs(body.args) : [];

  try {
    const result = await fn(...args);
    return NextResponse.json(result ?? null, { headers: NO_STORE });
  } catch (err: any) {
    // requireRole sends a signed-out / wrong-role user away with a redirect
    if (String(err?.digest ?? err?.message ?? "").includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: NO_STORE });
    }
    console.error(`[lists] ${name} failed:`, err?.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers: NO_STORE });
  }
}

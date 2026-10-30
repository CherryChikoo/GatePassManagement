import { NextResponse } from "next/server";
import { signIn } from "@/server/auth/sign-in";

/**
 * POST /api/auth/login { email, password } → { redirectUrl } or { error }.
 * Sets the session cookies. See src/server/auth/sign-in.ts.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400, headers: NO_STORE });
  }
  const result = await signIn(body);
  return NextResponse.json(result, { headers: NO_STORE });
}

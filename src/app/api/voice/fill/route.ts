import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { staffNamesFor, voiceSpecForUser } from "@/lib/voice/access";
import { buildFillRequest, cleanFill } from "@/lib/voice/prompt";
import { fillWithGemini, VoiceServiceError } from "@/lib/voice/providers";

/**
 * Voice filling, step 2: what the guard said -> the form's field values.
 * POST JSON: { form: register key, transcript }.
 *
 * Returns { fields, groups, direction? } in the form's own value format.
 * Values that were not said, or do not fit the field, are left out — the
 * guard checks and corrects everything before saving, and saving runs the
 * register's normal validation.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_TRANSCRIPT = 4000;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return fail("Please sign in again.", 401);

  const body: any = await req.json().catch(() => null);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim().slice(0, MAX_TRANSCRIPT) : "";
  if (!transcript) return fail("Nothing was heard.", 400);

  const spec = await voiceSpecForUser(user, body?.form);
  if (!spec) return fail("You cannot fill this form.", 403);

  try {
    const staff = await staffNamesFor(spec);
    const answer = await fillWithGemini(buildFillRequest(spec, transcript, staff));
    return NextResponse.json(cleanFill(spec, answer, staff), { headers: NO_STORE });
  } catch (err) {
    if (err instanceof VoiceServiceError) {
      if (err.kind === "setup") console.error("[voice] fill:", err.message);
      return fail(err.kind === "busy" ? "The form-filling service is busy. Please try again." : err.kind === "setup" ? "Voice filling is not available right now." : "Could not fill the form from that. Please type it.", err.kind === "busy" ? 503 : 502);
    }
    console.error("[voice] fill failed:", (err as Error)?.message);
    return fail("Could not fill the form from that. Please type it.", 500);
  }
}

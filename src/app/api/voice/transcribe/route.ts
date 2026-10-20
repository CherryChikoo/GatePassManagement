import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { voiceSpecForUser } from "@/lib/voice/access";
import { keytermsFor } from "@/lib/voice/spec";
import { transcribeClip, VoiceServiceError } from "@/lib/voice/providers";

/**
 * Voice filling, step 1: one short clip of the guard's speech -> text.
 * POST multipart: audio (WAV clip), form (register key), lang ("te" | "en").
 *
 * The phone sends a clip at each pause while the guard is still speaking, so
 * the text is ready almost as soon as they stop. Nothing is stored.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
/** A clip is at most ~25 s of 16 kHz mono speech (~0.8 MB); leave headroom */
const MAX_CLIP_BYTES = 3 * 1024 * 1024;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return fail("Please sign in again.", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Could not read the recording.", 400);
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return fail("No recording received.", 400);
  if (audio.size > MAX_CLIP_BYTES) return fail("Recording is too long.", 413);

  const spec = await voiceSpecForUser(user, form.get("form"));
  if (!spec) return fail("You cannot fill this form.", 403);

  // Telugu screen: Telugu (it also handles English words said in between); English screen: auto-detect
  const language = form.get("lang") === "te" ? "te-IN" : "unknown";
  try {
    const transcript = await transcribeClip(audio, language, keytermsFor(spec));
    return NextResponse.json({ transcript }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof VoiceServiceError) {
      if (err.kind === "setup") console.error("[voice] transcribe:", err.message);
      return fail(err.kind === "busy" ? "Speech service is busy. Please try again." : err.kind === "setup" ? "Voice filling is not available right now." : "Could not hear that clearly. Please try again.", err.kind === "busy" ? 503 : 502);
    }
    console.error("[voice] transcribe failed:", (err as Error)?.message);
    return fail("Could not hear that clearly. Please try again.", 500);
  }
}

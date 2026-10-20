/**
 * Voice filling: the two outside services (server only — the keys never reach
 * the browser).
 *
 * - Sarvam Saaras v4: speech -> text (Telugu, English, mixed). One short clip
 *   per call through its REST endpoint; the phone sends a clip at each pause,
 *   so text arrives while the guard is still speaking. (Sarvam's streaming
 *   socket needs the key as a connection header, which a browser cannot send
 *   without exposing it, and serverless hosting cannot hold the socket open.)
 * - Gemini Flash: text -> form fields, as JSON matching the form's schema.
 *   The free tier is shared and sometimes busy, so a busy or used-up model
 *   hands over to the next free Flash model.
 *
 * Env: SARVAM_API_KEY, GEMINI_API_KEY; optional GEMINI_MODELS (comma-separated).
 */

export class VoiceServiceError extends Error {
  constructor(
    message: string,
    /** "setup": keys missing / rejected; "busy": rate-limited or overloaded; "failed": anything else */
    readonly kind: "setup" | "busy" | "failed"
  ) {
    super(message);
    this.name = "VoiceServiceError";
  }
}

const SARVAM_URL = "https://api.sarvam.ai/speech-to-text";

/** Speech -> text for one clip. `language`: "te-IN", "en-IN" or "unknown" (auto-detect). */
export async function transcribeClip(audio: Blob, language: string, keyterms: string[] = []): Promise<string> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new VoiceServiceError("Speech service is not set up", "setup");

  const form = new FormData();
  form.append("file", audio, "clip.wav");
  form.append("model", "saaras:v4");
  form.append("language_code", language);
  if (keyterms.length) form.append("keyterms", JSON.stringify(keyterms));

  let res: Response;
  try {
    res = await fetch(SARVAM_URL, {
      method: "POST",
      headers: { "api-subscription-key": key },
      body: form,
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err: any) {
    throw new VoiceServiceError(err?.name === "TimeoutError" ? "Speech service took too long" : "Could not reach the speech service", "failed");
  }
  const body: any = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new VoiceServiceError("Speech service key was rejected", "setup");
    if (res.status === 429) throw new VoiceServiceError("Speech service is busy", "busy");
    // A rejected keyterms list should not cost the guard their words: retry once without it
    if (res.status === 400 && keyterms.length) return transcribeClip(audio, language, []);
    console.warn("[voice] sarvam", res.status, JSON.stringify(body)?.slice(0, 200));
    throw new VoiceServiceError("Speech could not be converted", "failed");
  }
  return typeof body?.transcript === "string" ? body.transcript.trim() : "";
}

// Measured 2026-10-21 (scripts/voice-model-speed.ts): 3.6-flash answers in ~2 s and
// correctly; 3.5-flash-lite took 14-17 s on the free tier. Later ones are fallbacks.
const DEFAULT_GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

function geminiModels(): string[] {
  const fromEnv = (process.env.GEMINI_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_GEMINI_MODELS;
}

/** Text -> JSON matching `schema`. Tries each free model in turn when one is busy. */
export async function fillWithGemini(req: { system: string; user: string; schema: object }): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new VoiceServiceError("Form-filling service is not set up", "setup");

  let lastKind: VoiceServiceError["kind"] = "failed";
  for (const model of geminiModels()) {
    // Thinking adds delay and is not needed for filling in fields; models that
    // do not accept the setting get the request again without it
    for (const thinking of [{ thinkingLevel: "minimal" }, null]) {
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: "user", parts: [{ text: req.user }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: req.schema,
              temperature: 0,
              maxOutputTokens: 4096,
              ...(thinking ? { thinkingConfig: thinking } : {}),
            },
          }),
          // A slow model hands over to the next sooner; 3 x 12 s stays inside the 60 s API limit (vercel.json)
          signal: AbortSignal.timeout(12_000),
        });
      } catch {
        lastKind = "busy";
        break; // timed out / unreachable: next model
      }
      const body: any = await res.json().catch(() => null);
      if (res.ok) {
        const text = (body?.candidates?.[0]?.content?.parts ?? [])
          .filter((p: any) => typeof p?.text === "string" && !p.thought)
          .map((p: any) => p.text)
          .join("");
        try {
          return JSON.parse(text);
        } catch {
          lastKind = "failed";
          break; // unreadable answer: next model
        }
      }
      if (res.status === 400 && thinking && /think/i.test(body?.error?.message ?? "")) continue;
      if (res.status === 401 || res.status === 403) throw new VoiceServiceError("Form-filling key was rejected", "setup");
      lastKind = res.status === 429 || res.status === 503 || res.status >= 500 ? "busy" : "failed";
      if (lastKind === "failed") console.warn("[voice] gemini", model, res.status, (body?.error?.message ?? "").slice(0, 160));
      break; // busy / not available: next model
    }
  }
  throw new VoiceServiceError(lastKind === "busy" ? "Form-filling service is busy" : "Could not fill the form", lastKind);
}

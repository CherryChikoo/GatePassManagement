import { clientIp, isPhoneSecret, overLimit, readJsonBody, TOO_MANY, unlockExitWithCode, VISIT_LIMITS, visitJson } from "@/lib/visits/requests";

/**
 * POST /api/visit/code { s, code } (public: the visitor's phone)
 * The meeting code the visitor got from the person they met unlocks their Exit QR.
 * -> the status (as /api/visit/status) | { ok:false, error, locked?, triesLeft? }
 * See src/lib/visits/requests.ts.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJsonBody(req, 2_000);
  if (!body || !isPhoneSecret(body.s)) return visitJson({ ok: false, error: "not_found" }, 400);
  if (overLimit([[`code:${clientIp(req)}`, VISIT_LIMITS.codeIp], [`code-s:${body.s}`, VISIT_LIMITS.codeSecret]])) {
    return visitJson({ ok: false, error: TOO_MANY }, 429);
  }
  try {
    return visitJson(await unlockExitWithCode(body.s, body.code));
  } catch (err: any) {
    console.error("[visit] code failed:", err?.message);
    return visitJson({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}

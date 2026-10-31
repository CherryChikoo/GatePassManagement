import { clientIp, overLimit, readJsonBody, submitVisitRequest, TOO_MANY, VISIT_LIMITS, visitJson } from "@/lib/visits/requests";

/**
 * POST /api/visit/submit { t, data, hostProfileId?, officeId? } (public: the visitor's phone)
 * -> { ok:true, secret } | { ok:false, error }
 * The phone keeps `secret` to follow its visit. See src/lib/visits/requests.ts.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJsonBody(req);
  if (!body) return visitJson({ ok: false, error: "Please check the details" }, 400);
  const token = typeof body.t === "string" ? body.t.slice(0, 200) : "";
  if (overLimit([[`submit:${clientIp(req)}`, VISIT_LIMITS.submitIp], [`submit-t:${token}`, VISIT_LIMITS.submitToken]])) {
    return visitJson({ ok: false, error: TOO_MANY }, 429);
  }
  try {
    return visitJson(await submitVisitRequest(body));
  } catch (err: any) {
    console.error("[visit] submit failed:", err?.message);
    return visitJson({ ok: false, error: "Could not send. Please try again." }, 500);
  }
}

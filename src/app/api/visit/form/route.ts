import { clientIp, overLimit, TOO_MANY, VISIT_LIMITS, visitForm, visitJson } from "@/lib/visits/requests";

/**
 * GET /api/visit/form?t=<check-in token> (public: the visitor's phone, no login)
 * -> { ok:true, register, gate, hosts, offices, expiresAt, submitBy } | { ok:false, error:"expired"|"invalid" }
 * See src/lib/visits/requests.ts.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (overLimit([[`form:${clientIp(req)}`, VISIT_LIMITS.formIp]])) {
    return visitJson({ ok: false, error: TOO_MANY }, 429);
  }
  const t = new URL(req.url).searchParams.get("t");
  try {
    return visitJson(await visitForm(t));
  } catch (err: any) {
    console.error("[visit] form failed:", err?.message);
    return visitJson({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}

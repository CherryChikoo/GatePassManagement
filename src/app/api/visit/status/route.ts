import { clientIp, isPhoneSecret, overLimit, readJsonBody, TOO_MANY, VISIT_LIMITS, visitJson, visitStatusBySecret } from "@/lib/visits/requests";

/**
 * POST /api/visit/status { s: <phone secret> } (public: the visitor's phone
 * checks now and then, slower over time and only while the page is open)
 * -> { ok:true, status, register, name, rejectReason, insideSince, exit, exitQr?, exitQrExpiresAt? } | { ok:false, error }
 * A POST so the secret never appears in request logs (it would on every check).
 * See src/lib/visits/requests.ts.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJsonBody(req);
  const s = body?.s;
  if (!isPhoneSecret(s)) return visitJson({ ok: false, error: "not_found" }, 400);
  if (overLimit([[`status:${clientIp(req)}`, VISIT_LIMITS.statusIp], [`status-s:${s}`, VISIT_LIMITS.statusSecret]])) {
    return visitJson({ ok: false, error: TOO_MANY }, 429);
  }
  try {
    return visitJson(await visitStatusBySecret(s));
  } catch (err: any) {
    console.error("[visit] status failed:", err?.message);
    return visitJson({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}

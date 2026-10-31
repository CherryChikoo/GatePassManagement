import {
  clientIp,
  isPhoneSecret,
  officeByPosterKey,
  overLimit,
  readJsonBody,
  recordOfficeVisit,
  TOO_MANY,
  VISIT_LIMITS,
  visitJson,
} from "@/lib/visits/requests";

/**
 * An office's QR poster (public: the visitor's phone). See src/lib/visits/requests.ts.
 * GET  /api/visit/office?k=<poster key>  -> { ok:true, id, name } | { ok:false, error:"invalid" }
 * POST /api/visit/office { s, k }         -> the status (as /api/visit/status) | { ok:false, error }
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (overLimit([[`office:${clientIp(req)}`, VISIT_LIMITS.officeIp]])) return visitJson({ ok: false, error: TOO_MANY }, 429);
  try {
    return visitJson(await officeByPosterKey(new URL(req.url).searchParams.get("k")));
  } catch (err: any) {
    console.error("[visit] office lookup failed:", err?.message);
    return visitJson({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}

export async function POST(req: Request) {
  const body = await readJsonBody(req, 2_000);
  if (!body || !isPhoneSecret(body.s)) return visitJson({ ok: false, error: "not_found" }, 400);
  if (overLimit([[`office:${clientIp(req)}`, VISIT_LIMITS.officeIp], [`office-s:${body.s}`, VISIT_LIMITS.officeSecret]])) {
    return visitJson({ ok: false, error: TOO_MANY }, 429);
  }
  try {
    return visitJson(await recordOfficeVisit(body.s, body.k));
  } catch (err: any) {
    console.error("[visit] office visit failed:", err?.message);
    return visitJson({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}

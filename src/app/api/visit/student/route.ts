import { clientIp, lookupVisitStudent, overLimit, TOO_MANY, VISIT_LIMITS, visitJson } from "@/lib/visits/requests";

/**
 * GET /api/visit/student?t=<check-in token>&roll=<roll number> (public: a
 * parent's phone, no login; asked once per tap of Find)
 * -> { ok:true, studentName, department, year, has: { father, mother, guardian } }
 *  | { ok:false, error }
 * Never the parents' names, mobiles or address: the server fills them in when
 * the form is sent. See src/lib/visits/requests.ts.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const token = (params.get("t") ?? "").slice(0, 200);
  if (overLimit([[`student:${clientIp(req)}`, VISIT_LIMITS.studentIp], [`student-t:${token}`, VISIT_LIMITS.studentToken]])) {
    return visitJson({ ok: false, error: TOO_MANY }, 429);
  }
  try {
    return visitJson(await lookupVisitStudent(token, (params.get("roll") ?? "").slice(0, 40)));
  } catch (err: any) {
    console.error("[visit] student lookup failed:", err?.message);
    return visitJson({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}

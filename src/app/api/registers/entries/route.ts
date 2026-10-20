import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/helpers";
import { REGISTER_VIEW_ROLES, queryRegisterEntries } from "@/lib/registers/list-entries";

/**
 * One page of an entry register's records:
 * GET /api/registers/entries?register=KEY&date=YYYY-MM-DD|all&q=&page=1&shift=
 *
 * Same data and access rules as the `listRegisterEntries` server action, but
 * as a plain GET so it runs in parallel with other requests (server actions
 * are queued) and can be prefetched before the register is opened.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  if (!(REGISTER_VIEW_ROLES as readonly string[]).includes(user.role)) {
    return NextResponse.json({ error: "You do not have access to this register" }, { status: 403, headers: NO_STORE });
  }

  const sp = new URL(req.url).searchParams;
  try {
    const res = await queryRegisterEntries(user, {
      register: sp.get("register") ?? "",
      date: sp.get("date") ?? undefined,
      q: sp.get("q") ?? undefined,
      page: Number(sp.get("page")) || 1,
      shift: sp.get("shift") ?? undefined,
    });
    return NextResponse.json(res, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[registers/entries]", err?.message);
    return NextResponse.json({ error: "Could not load the register." }, { status: 500, headers: NO_STORE });
  }
}

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUTH_GRACE_HEADER } from "@/lib/supabase/middleware";

/**
 * Security tablets stay signed in until a guard taps Log out. When Supabase no
 * longer accepts a tablet's login (its renewal was lost — e.g. "Refresh Token
 * Not Found"), the tablet is let in on its genuinely signed token (see
 * AUTH_GRACE_HEADER) and a fresh login is made for it here, without a password:
 * a one-time sign-in link is created server-side (no email is sent) and used at
 * once. The new login is written to the tablet's cookies with this response,
 * so live updates and renewals work again. Once a minute per account at most.
 *
 * Called from API routes only (they can write cookies).
 */
const lastTry = new Map<string, number>();
const RETRY_MS = 60_000;

/** API routes: a Security tablet let in on its old login gets a fresh one with this response */
export async function reviveIfNeeded(user: { role: string; userId: string; email: string } | null) {
  if (!user || user.role !== "SECURITY") return;
  if ((await headers()).get(AUTH_GRACE_HEADER) !== "1") return;
  await reviveSecuritySession(user.userId, user.email);
}

export async function reviveSecuritySession(userId: string, email: string): Promise<boolean> {
  if (!email) return false;
  const last = lastTry.get(userId) ?? 0;
  if (Date.now() - last < RETRY_MS) return false;
  lastTry.set(userId, Date.now());
  if (lastTry.size > 500) lastTry.delete(lastTry.keys().next().value!);
  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) return false;
    // Writes the new login to this response's cookies (only called from API routes)
    const supabase = await createServerSupabaseClient();
    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (verifyError || !verified.session) return false;
    console.warn("[auth] Security login renewed for a tablet whose renewal was lost");
    return true;
  } catch {
    return false;
  }
}

"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { invalidateProfileCache } from "@/lib/auth/helpers";

export async function logoutAction() {
  let userId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getClaims();
    userId = (data?.claims?.sub as string) || null;
    await supabase.auth.signOut();
  } catch {}
  try {
    const cookieStore = await cookies();
    for (const c of cookieStore.getAll()) {
      if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
        cookieStore.delete(c.name);
      }
    }
  } catch {}
  if (userId) invalidateProfileCache(userId);
  // No server redirect: the client performs a full-page replace to /login so the
  // router cache and browser history entries of the old session are discarded.
  return { success: true };
}

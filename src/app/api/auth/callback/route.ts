import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Only allow same-site relative paths (blocks "//evil.com", "@evil.com", "https://…"). */
function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth", origin));
}

import { NextResponse } from "next/server";

/**
 * Lightweight deployment version (no database access). Open tabs compare it with
 * the version they were built with and reload after a new deployment, so they
 * never call server actions that no longer exist.
 */
export function GET() {
  return NextResponse.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export const dynamic = "force-dynamic";

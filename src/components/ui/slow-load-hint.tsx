"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Shown on a loading screen that has been waiting unusually long (after the
 * portal sat idle, or on a bad network): says so and offers a reload, instead
 * of a skeleton that never ends.
 */
export function SlowLoadHint({ afterMs = 12_000 }: { afterMs?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(timer);
  }, [afterMs]);
  if (!slow) return null;
  return (
    <div role="status" className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm text-amber-700">This is taking longer than usual. Check the connection, or reload the page.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700"
      >
        <RotateCcw className="h-4 w-4" /> Reload
      </button>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /** Fetches the page again and re-renders it (a dropped network request recovers) */
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError]", error.digest || error.message);
  }, [error]);

  return (
    <div role="alert" className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl border border-zinc-800/80 bg-zinc-900 p-6 sm:p-8 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-medium tracking-tight text-zinc-100">Something went wrong</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          An unexpected error occurred while loading this page. You can try again, or reload if the problem persists.
        </p>
        {error.digest && <p className="mt-3 text-[11px] text-zinc-600">Reference: {error.digest}</p>}
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
          >
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 px-5 text-sm font-medium text-zinc-200 hover:bg-zinc-950 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError]", error.digest || error.message);
  }, [error]);

  return (
    <div role="alert" className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full p-8 bg-zinc-900 rounded-2xl border border-zinc-800 text-center space-y-4">
        <h2 className="text-xl font-bold text-red-400">Something went wrong</h2>
        <p className="text-sm text-zinc-400">
          An unexpected error occurred while loading this page. You can try again, or reload if the problem persists.
        </p>
        {error.digest && <p className="text-[11px] text-zinc-600">Reference: {error.digest}</p>}
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-semibold text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-semibold text-zinc-100"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

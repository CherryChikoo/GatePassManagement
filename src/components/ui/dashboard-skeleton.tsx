"use client";

import { useAppStore } from "@/stores/app-store";

/**
 * Full-page loading skeleton shown while the store preloads data.
 * If the initial load failed, shows the error with a retry button instead of
 * spinning forever.
 */
export function DashboardSkeleton() {
  const error = useAppStore((s) => s.error);
  const isInitialized = useAppStore((s) => s.isInitialized);

  if (error && !isInitialized) {
    return (
      <div role="alert" className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center max-w-sm space-y-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <p className="text-sm font-semibold text-red-300">We couldn&apos;t load your dashboard</p>
          <p className="text-xs text-red-200/80">{error}</p>
          <button
            type="button"
            onClick={() => useAppStore.getState().refresh(true)}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in" aria-busy="true" aria-label="Loading">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 bg-zinc-800/60 rounded-lg animate-pulse" />
        <div className="h-4 w-64 bg-zinc-800/40 rounded-md animate-pulse" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 bg-zinc-800/60 rounded animate-pulse" />
              <div className="h-8 w-8 bg-zinc-800/40 rounded-lg animate-pulse" />
            </div>
            <div className="h-8 w-16 bg-zinc-800/60 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>

      {/* Content card skeleton */}
      <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800/50">
          <div className="h-5 w-32 bg-zinc-800/60 rounded animate-pulse" />
        </div>
        <div className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl bg-zinc-800/20 px-4 py-3"
            >
              <div className="space-y-2 flex-1">
                <div className="h-4 w-40 bg-zinc-800/50 rounded animate-pulse" />
                <div className="h-3 w-56 bg-zinc-800/30 rounded animate-pulse" />
              </div>
              <div className="h-6 w-16 bg-zinc-800/50 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

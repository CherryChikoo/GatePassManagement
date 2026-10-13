"use client";

/**
 * Full-page loading skeleton shown while the store preloads data.
 * Matches the dashboard layout aesthetic with animated pulse placeholders.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-fade-in">
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

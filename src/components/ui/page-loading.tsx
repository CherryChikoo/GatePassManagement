import { SlowLoadHint } from "@/components/ui/slow-load-hint";

/**
 * Instant navigation placeholder used by route-level loading.tsx files.
 * Rendered immediately on click while the next page's server work completes.
 */
export function PageLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <SlowLoadHint />
      <div className="space-y-2">
        <div className="h-7 w-48 bg-zinc-800/60 rounded-lg animate-pulse" />
        <div className="h-4 w-64 bg-zinc-800/40 rounded-md animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 animate-pulse" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 animate-pulse" />
    </div>
  );
}

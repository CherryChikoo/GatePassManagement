export default function WardenRequestsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="h-4 w-32 rounded-full bg-zinc-800/60 animate-pulse" />
        <div className="h-8 w-56 rounded-full bg-zinc-800/60 animate-pulse" />
        <div className="h-4 w-72 max-w-full rounded-full bg-zinc-800/40 animate-pulse" />
      </div>
      <div className="h-10 w-80 max-w-full rounded-full border border-zinc-800 bg-zinc-950 animate-pulse" />
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card divide-y divide-zinc-800/70">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 rounded-2xl bg-zinc-800/60 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 max-w-full rounded-full bg-zinc-800/60 animate-pulse" />
                <div className="h-3 w-56 max-w-full rounded-full bg-zinc-800/40 animate-pulse" />
              </div>
              <div className="hidden sm:block h-9 w-28 rounded-full bg-zinc-800/40 animate-pulse" />
            </div>
            <div className="h-14 rounded-2xl bg-zinc-950 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

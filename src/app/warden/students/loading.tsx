export default function WardenStudentsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-3">
          <div className="h-8 w-48 rounded-full bg-zinc-800/60 animate-pulse" />
          <div className="h-4 w-72 max-w-full rounded-full bg-zinc-800/40 animate-pulse" />
        </div>
        <div className="h-10 w-full sm:w-72 rounded-full border border-zinc-800 bg-zinc-900 animate-pulse" />
      </div>
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card overflow-hidden">
        <div className="hidden sm:block h-10 bg-zinc-950/70" />
        <div className="divide-y divide-zinc-800/70">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3">
              <div className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 rounded-2xl bg-zinc-800/60 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded-full bg-zinc-800/60 animate-pulse" />
                <div className="h-3 w-1/4 rounded-full bg-zinc-800/40 animate-pulse" />
              </div>
              <div className="hidden md:block h-3 w-40 rounded-full bg-zinc-800/40 animate-pulse" />
              <div className="h-6 w-16 rounded-full bg-zinc-800/40 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

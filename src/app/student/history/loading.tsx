export default function StudentHistoryLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 sm:space-y-6" aria-busy="true" aria-label="Loading history">
      <div className="space-y-3">
        <div className="h-9 w-40 rounded-full bg-zinc-800/60 animate-pulse" />
        <div className="h-8 w-56 rounded-full bg-zinc-800/60 animate-pulse" />
        <div className="h-4 w-32 rounded-full bg-zinc-800/60 animate-pulse" />
      </div>
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card">
        <ul className="divide-y divide-zinc-800/70">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-start gap-3 sm:gap-4 px-4 sm:px-6 py-4">
              <div className="h-11 w-11 shrink-0 rounded-2xl bg-zinc-800/60 animate-pulse" />
              <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="h-4 w-1/2 rounded-full bg-zinc-800/60 animate-pulse" />
                  <div className="h-5 w-16 shrink-0 rounded-full bg-zinc-800/60 animate-pulse" />
                </div>
                <div className="h-3 w-3/4 rounded-full bg-zinc-800/60 animate-pulse" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Shown the moment a person's details page is opened, while their history loads. */
export function UserDetailSkeleton() {
  const bar = "animate-pulse rounded-full bg-zinc-800/70";
  return (
    <div className="mx-auto max-w-7xl space-y-6" aria-busy="true" aria-label="Loading details">
      <div className={`${bar} h-4 w-40`} />
      {/* Profile card */}
      <div className="flex items-center gap-4 rounded-3xl border border-zinc-800/80 bg-zinc-900 p-5 sm:p-6 shadow-card">
        <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-orange-500/10" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className={`${bar} h-6 w-48 max-w-full`} />
          <div className={`${bar} h-4 w-72 max-w-full`} />
          <div className="flex gap-2">
            <div className={`${bar} h-6 w-20`} />
            <div className={`${bar} h-6 w-24`} />
          </div>
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-3xl border border-zinc-800/80 bg-zinc-900 p-5 shadow-card space-y-5">
            <div className={`${bar} h-4 w-24`} />
            <div className={`${bar} h-9 w-16`} />
          </div>
        ))}
      </div>
      {/* History list */}
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 p-2 shadow-card">
        <div className="h-10 animate-pulse rounded-2xl bg-zinc-950" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3.5 border-b border-zinc-800/60 last:border-b-0">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-2xl bg-zinc-950" />
            <div className="flex-1 space-y-2">
              <div className={`${bar} h-4 w-1/3`} />
              <div className={`${bar} h-3 w-1/2`} />
            </div>
            <div className={`${bar} h-6 w-20`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HodActivityLoading() {
  const block = "animate-pulse bg-zinc-800/60";
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className={`${block} h-4 w-32 rounded-full`} />
          <div className={`${block} h-8 w-64 max-w-full rounded-full`} />
          <div className={`${block} h-4 w-48 rounded-full`} />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className={`${block} h-10 w-full sm:w-64 rounded-full`} />
          <div className={`${block} h-10 w-full sm:w-40 rounded-full`} />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="inline-flex w-fit gap-1 rounded-full border border-zinc-800 bg-zinc-950 p-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${block} h-7 w-20 rounded-full`} />
          ))}
        </div>
        <div className="inline-flex w-fit gap-1 rounded-full border border-zinc-800 bg-zinc-950 p-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`${block} h-7 w-16 sm:w-20 rounded-full`} />
          ))}
        </div>
      </div>

      {/* List skeleton */}
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card divide-y divide-zinc-800/70">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4">
            <div className={`${block} h-11 w-11 shrink-0 rounded-2xl`} />
            <div className="flex-1 space-y-2 min-w-0">
              <div className={`${block} h-4 w-1/3 rounded-full`} />
              <div className={`${block} h-3 w-1/2 rounded-full`} />
            </div>
            <div className={`${block} h-6 w-20 shrink-0 rounded-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}

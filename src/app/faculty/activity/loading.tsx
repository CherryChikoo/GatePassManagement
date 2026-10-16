import { Skeleton } from "@/components/ui/skeleton";

export default function FacultyActivityLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="h-4 w-64 max-w-full rounded-full" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Skeleton className="h-10 w-full sm:flex-1 lg:w-64 rounded-full" />
          <Skeleton className="h-10 w-full sm:w-44 rounded-full" />
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-44 rounded-full" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <Skeleton className="h-4 w-2/3 rounded-full" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Skeleton className="h-5 w-36 rounded-full" />
          <div className="inline-flex self-start gap-1 rounded-full bg-zinc-950 p-1 border border-zinc-800">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card p-2 sm:p-3">
          <div className="divide-y divide-zinc-800/70">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 sm:gap-4 px-3 py-3.5">
                <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-4 w-1/2 rounded-full" />
                  <Skeleton className="h-3 w-3/4 rounded-full" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

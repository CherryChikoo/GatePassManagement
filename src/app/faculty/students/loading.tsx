import { Skeleton } from "@/components/ui/skeleton";

export default function FacultyStudentsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="h-4 w-72 max-w-full rounded-full" />
        </div>
        <Skeleton className="h-10 w-full sm:w-72 rounded-full" />
      </div>
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card overflow-hidden">
        <div className="hidden sm:block h-11 bg-zinc-950/70" />
        <div className="divide-y divide-zinc-800/70">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4 px-4 lg:px-6 py-4">
              <Skeleton className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 rounded-2xl" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-1/2 sm:w-1/3 rounded-full" />
                <Skeleton className="h-3 w-3/4 sm:w-1/4 rounded-full" />
              </div>
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
              <Skeleton className="hidden sm:block h-9 w-40 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

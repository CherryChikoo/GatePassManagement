import { Skeleton } from "@/components/ui/skeleton";

export default function AdminUsersLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-9 w-40 rounded-full" />
          <Skeleton className="h-8 w-56 rounded-full" />
          <Skeleton className="h-4 w-32 rounded-full" />
        </div>
        <Skeleton className="h-11 w-full sm:w-40 rounded-full" />
      </div>

      {/* Role tabs + search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <Skeleton className="h-10 w-full lg:w-[560px] rounded-full" />
        <Skeleton className="h-10 w-full lg:w-80 rounded-full" />
      </div>

      {/* User list card */}
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card p-5 sm:p-6">
        <Skeleton className="h-3 w-28 rounded-full mb-5" />
        <div className="divide-y divide-zinc-800/70">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4 py-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-2/5 rounded-full" />
                <Skeleton className="h-3 w-3/5 rounded-full" />
              </div>
              <Skeleton className="hidden sm:block h-6 w-16 rounded-full" />
              <Skeleton className="h-9 w-9 sm:w-28 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

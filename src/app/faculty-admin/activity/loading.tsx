import { TableSkeleton } from "@/components/ui/skeleton";

export default function HodActivityLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-zinc-800/50 rounded animate-pulse" />
          <div className="h-8 w-56 bg-zinc-800/50 rounded animate-pulse" />
          <div className="h-4 w-40 bg-zinc-800/50 rounded animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-48 bg-zinc-800/50 rounded animate-pulse" />
          <div className="h-9 w-32 bg-zinc-800/50 rounded animate-pulse" />
        </div>
      </div>
      {/* Primary tabs skeleton */}
      <div className="flex gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 bg-zinc-800/50 rounded animate-pulse" />
        ))}
      </div>
      {/* Sub-tabs skeleton */}
      <div className="flex gap-2 p-1 bg-zinc-900/50 border border-zinc-800/50 rounded-lg w-fit">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-20 bg-zinc-800/50 rounded animate-pulse" />
        ))}
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}

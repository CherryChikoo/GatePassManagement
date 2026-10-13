import { CardSkeleton } from "@/components/ui/skeleton";

export default function WardenRequestsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-zinc-800/50 rounded animate-pulse" />
          <div className="h-4 w-56 bg-zinc-800/50 rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 w-24 bg-zinc-800/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

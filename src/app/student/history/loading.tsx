import { TableSkeleton } from "@/components/ui/skeleton";

export default function StudentHistoryLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-40 bg-zinc-800/50 rounded animate-pulse" />
        <div className="h-4 w-56 bg-zinc-800/50 rounded animate-pulse" />
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}

import { TableSkeleton } from "@/components/ui/skeleton";

export default function FacultyStudentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 bg-zinc-800/50 rounded animate-pulse" />
          <div className="h-4 w-48 bg-zinc-800/50 rounded animate-pulse" />
        </div>
        <div className="h-9 w-48 bg-zinc-800/50 rounded animate-pulse" />
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}

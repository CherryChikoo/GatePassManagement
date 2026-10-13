"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cancelPermissionRequest } from "@/server/actions/permissions";
import { formatDateTime, formatDate } from "@/lib/utils";
import { History, FileText, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";
import { useAppStore } from "@/stores/app-store";

interface Props {
  user: { name: string; email: string; role: string };
  initialData: { permissions: any[]; total: number };
  currentPage: number;
}

export function HistoryClient({ user, initialData, currentPage }: Props) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function handleCancel(id: string) {
    if (!window.confirm("Cancel this request? This cannot be undone.")) return;
    setCancelling(id);
    try {
      const res = await cancelPermissionRequest(id);
      if (res?.error) window.alert(res.error);
    } catch {
      window.alert("Failed to cancel the request. Please try again.");
    }
    setCancelling(null);
    useAppStore.getState().refresh(true);
    router.refresh();
  }

  const totalPages = Math.ceil(initialData.total / 25) || 1;

  return (
    <div className="space-y-6">
      <div>
        <BackButton href="/student" label="Back to Dashboard" />
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 mt-2">
          My Request History
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          {initialData.total} total requests
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {initialData.permissions.length === 0 ? (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="No Requests Yet"
              description="You haven't submitted any permission requests."
              action={
                <Link href="/student/request">
                  <Button>Create Request</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {initialData.permissions.map((perm: any) => (
                <div
                  key={perm.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 table-row-hover transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {perm.purpose}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-400 pl-6">
                      {perm.destination && `${perm.destination} • `}
                      {formatDate(perm.exitDate)}
                      {perm.expectedExit && ` • ${formatDateTime(perm.expectedExit)}`}
                      {perm.expectedReturn && ` → ${formatDateTime(perm.expectedReturn)}`}
                    </p>
                    {perm.rejectionReason && (
                      <p className="text-xs text-red-400 pl-6">
                        Reason: {perm.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/40">
                    <StatusBadge status={perm.status} />
                    {perm.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(perm.id)}
                        loading={cancelling === perm.id}
                        className="text-red-400 hover:text-red-300 h-8 px-2.5"
                      >
                        <XCircle className="h-4 w-4 mr-1.5" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {initialData.total > 25 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 py-4 px-4 sm:px-6 border-t border-zinc-800/50">
          <p className="text-xs sm:text-sm text-zinc-400 text-center sm:text-left">
            Showing {(currentPage - 1) * 25 + 1} to {Math.min(currentPage * 25, initialData.total)} of {initialData.total} requests
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => router.push(`/student/history?page=${currentPage - 1}`)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => router.push(`/student/history?page=${currentPage + 1}`)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

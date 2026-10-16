"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PagerBar } from "@/components/ui/pager-bar";
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 sm:space-y-6">
      <div className="min-w-0">
        <BackButton href="/student" label="Back to Dashboard" className="-ml-2 h-10 sm:h-9 hover:bg-zinc-950" />
        <h1 className="mt-3 text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
          My Request History
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {initialData.total} total requests
        </p>
      </div>

      <Card className="overflow-hidden">
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
            <ul className="divide-y divide-zinc-800/70">
              {initialData.permissions.map((perm: any) => (
                <li
                  key={perm.id}
                  className="flex items-start gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-zinc-950/70 transition-colors"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="pt-0.5 text-sm font-medium text-zinc-100 truncate">
                        {perm.purpose}
                      </p>
                      <span className="shrink-0">
                        <StatusBadge status={perm.status} />
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed break-words">
                      {perm.destination && `${perm.destination} • `}
                      {formatDate(perm.exitDate)}
                      {perm.expectedExit && ` • ${formatDateTime(perm.expectedExit)}`}
                      {perm.expectedReturn && ` → ${formatDateTime(perm.expectedReturn)}`}
                    </p>
                    {perm.rejectionReason && (
                      <p className="mt-2 rounded-2xl bg-red-500/10 px-3 py-2 text-xs text-red-400 break-words">
                        Reason: {perm.rejectionReason}
                      </p>
                    )}
                    {perm.status === "PENDING" && (
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(perm.id)}
                          loading={cancelling === perm.id}
                          className="h-10 sm:h-9 px-4 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
                        >
                          {cancelling !== perm.id && <XCircle className="h-4 w-4" />}
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>

      </Card>

      {/* Pagination (docked at the bottom of the screen; page lives in the URL) */}
      <PagerBar
        page={currentPage}
        pageSize={25}
        total={initialData.total}
        hrefForPage={(p) => `/student/history?page=${p}`}
        itemLabel="requests"
      />
    </div>
  );
}

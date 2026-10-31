"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useAppStore } from "@/stores/app-store";
import { RequestCard } from "../request-card";
import { PagerBar } from "@/components/ui/pager-bar";
import type { getSupervisorRequests } from "@/server/actions/executive";
import { callGate } from "@/lib/gate-call";
import { useDebounced, usePagedList } from "@/hooks/use-paged-list";

type StatusTab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
type WhoTab = "ALL" | "STUDENTS" | "FACULTY";

const PAGE_SIZE = 20;

type RequestsPage = Awaited<ReturnType<typeof getSupervisorRequests>>;

export function SupervisorRequestsClient() {
  const [statusTab, setStatusTab] = useState<StatusTab>("PENDING");
  const [whoTab, setWhoTab] = useState<WhoTab>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // One page at a time from the server (filters and search run in the database);
  // a page seen before shows at once, the last one stays on screen while the next loads
  const q = useDebounced(search);
  const params = { page, pageSize: PAGE_SIZE, status: statusTab, who: whoTab, q };
  const list = usePagedList<RequestsPage>("sup-requests", params, () => callGate("getSupervisorRequests", [params], 20_000));

  // Kept as current as before: when the dashboard data refreshes (every few
  // minutes while visible, on returning to the tab), the page on screen does too.
  // No extra timer: it follows the refresh that already runs.
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const seenSync = useRef(lastSyncAt);
  const reloadAll = list.reloadAll;
  useEffect(() => {
    if (lastSyncAt === seenSync.current) return;
    seenSync.current = lastSyncAt;
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncAt]);

  const counts = list.data?.counts ?? { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: 0 };
  const pageItems: any[] = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  if (!list.data && !list.error) return <DashboardSkeleton />;

  const tabBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
      active ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
    }`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">Pass Requests</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Today&apos;s student and faculty requests, plus any still pending. Past requests are in the Activity tab.
          </p>
        </div>
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search requests"
            placeholder="Search name, roll, employee ID…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-10 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <div
          className="inline-flex w-fit max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="Status"
        >
          {(
            [
              ["PENDING", "Pending"],
              ["APPROVED", "Approved"],
              ["REJECTED", "Rejected / Expired"],
              ["ALL", "All"],
            ] as [StatusTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={statusTab === id}
              onClick={() => {
                setStatusTab(id);
                setPage(1);
              }}
              className={tabBtn(statusTab === id)}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  statusTab === id ? "bg-orange-500/10 text-orange-400" : "bg-zinc-900 text-zinc-500"
                }`}
              >
                {counts[id]}
              </span>
            </button>
          ))}
        </div>
        <div
          className="inline-flex w-fit max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="Requester"
        >
          {(
            [
              ["ALL", "Everyone"],
              ["STUDENTS", "Students"],
              ["FACULTY", "Faculty"],
            ] as [WhoTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={whoTab === id}
              onClick={() => {
                setWhoTab(id);
                setPage(1);
              }}
              className={tabBtn(whoTab === id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.error && (
        <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {list.error}
        </div>
      )}

      <Card className={list.busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <CardContent className="p-3 sm:p-4">
          {pageItems.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="No requests"
              description="Nothing matches these filters right now."
            />
          ) : (
            <div className="space-y-3">
              {pageItems.map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PagerBar
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        itemLabel="requests"
      />
    </div>
  );
}

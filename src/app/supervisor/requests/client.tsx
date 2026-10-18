"use client";

import { useMemo, useState } from "react";
import { Search, ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { useAppStore } from "@/stores/app-store";
import { RequestCard, statusGroup } from "../request-card";
import { PagerBar } from "@/components/ui/pager-bar";

type StatusTab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
type WhoTab = "ALL" | "STUDENTS" | "FACULTY";

const PAGE_SIZE = 20;

export function SupervisorRequestsClient() {
  const isReady = useStoreReady();
  const requests = useAppStore((s) => s.data.requests) as any[] | undefined;

  const [statusTab, setStatusTab] = useState<StatusTab>("PENDING");
  const [whoTab, setWhoTab] = useState<WhoTab>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const list = useMemo(() => requests ?? [], [requests]);

  const byWho = useMemo(
    () =>
      list.filter((r) =>
        whoTab === "ALL" ? true : whoTab === "FACULTY" ? !!r.facultyId : !!r.studentId
      ),
    [list, whoTab]
  );

  const counts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: byWho.length };
    byWho.forEach((r) => c[statusGroup(r.status)]++);
    return c;
  }, [byWho]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return byWho.filter((r) => {
      if (statusTab !== "ALL" && statusGroup(r.status) !== statusTab) return false;
      if (!q) return true;
      const p = r.facultyId ? r.faculty : r.student;
      return [p?.profile?.name, p?.studentRoll, p?.employeeId, p?.department, r.purpose, r.destination]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q));
    });
  }, [byWho, statusTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!isReady || requests === undefined) return <DashboardSkeleton />;

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

      <Card>
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
        total={filtered.length}
        onPageChange={setPage}
        itemLabel="requests"
      />
    </div>
  );
}

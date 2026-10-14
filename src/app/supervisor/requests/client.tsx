"use client";

import { useMemo, useState } from "react";
import { Eye, Search, ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { useAppStore } from "@/stores/app-store";
import { RequestCard, statusGroup } from "../request-card";

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
    `px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
      active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5 flex-wrap">
            Pass Requests
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-teal-500/15 text-teal-300 border-teal-500/30">
              <Eye className="h-3 w-3" aria-hidden="true" /> View only
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Today&apos;s student and faculty requests, plus any still pending. Past requests are in the Activity tab.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search requests"
            placeholder="Search name, roll, employee ID…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-wrap gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit" role="tablist" aria-label="Status">
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
              {label} <span className="ml-1 text-zinc-500">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit" role="tablist" aria-label="Requester">
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>
            Page {currentPage} of {totalPages} · {filtered.length} requests
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-md border border-zinc-800 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-md border border-zinc-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

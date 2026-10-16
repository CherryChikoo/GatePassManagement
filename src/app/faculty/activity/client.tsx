"use client";
import { scheduledNote } from "@/lib/pass-dates";

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, Modal } from "@/components/ui/primitives";
import { PagerBar } from "@/components/ui/pager-bar";
import { formatDateTime } from "@/lib/utils";
import { DoorOpen, DoorClosed, ArrowLeft, MapPin, Calendar, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/server/actions/auth";
import { BackButton } from "@/components/ui/back-button";
import { istDateString } from "@/lib/time/ist";

const approverLabel = (p: any) =>
  p.approvalMode === "BOTH" ? "HOD + Dean" : p.approverType === "DEAN" ? "Dean" : p.approverType === "FACULTY_ADMIN" ? "HOD" : p.approverType || "—";

export function FacultyActivityClient({
  user,
  permissions = [],
  ownPasses = [],
  total = 0,
  currentPage,
  pageSize = 25,
  selectedDate,
  search: initialSearch = "",
  tab = "ALL",
}: {
  user: any;
  permissions: any[];
  ownPasses?: any[];
  total: number;
  currentPage: number;
  pageSize?: number;
  selectedDate: string;
  search?: string;
  tab?: "ALL" | "ENTRIES" | "EXITS";
}) {
  const router = useRouter();
  const [selectedPermission, setSelectedPermission] = useState<any>(null);
  const [search, setSearch] = useState(initialSearch);
  const activeTab = tab;

  // Date, search, tab and page live in the URL; the server filters and pages
  const buildUrl = (patch: { date?: string; q?: string; tab?: string; page?: number }) => {
    const p = new URLSearchParams();
    p.set("date", patch.date ?? selectedDate);
    const q = patch.q ?? search.trim();
    if (q) p.set("q", q);
    const t = patch.tab ?? activeTab;
    if (t !== "ALL") p.set("tab", t);
    const pg = patch.page ?? 1;
    if (pg > 1) p.set("page", String(pg));
    return `/faculty/activity?${p.toString()}`;
  };
  const setActiveTab = (t: "ALL" | "ENTRIES" | "EXITS") => router.push(buildUrl({ tab: t }));

  // Search after the guard stops typing
  useEffect(() => {
    if (search.trim() === initialSearch) return;
    const t = setTimeout(() => router.replace(buildUrl({ q: search.trim() })), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filteredPermissions = permissions;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    router.push(buildUrl({ date: e.target.value }));
  };

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8">

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <BackButton href="/faculty" label="Back to Dashboard" className="-ml-3 mb-2" />
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">Activity Log</h1>
            <p className="mt-1 text-sm text-zinc-500">Your passes and your students&apos; passes for the selected date</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto">
            {/* Search */}
            <div className="relative w-full sm:flex-1 lg:w-64 lg:flex-none group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-zinc-500 group-focus-within:text-orange-500 transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <input
                type="text"
                placeholder="Search name or roll..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
              />
            </div>
            {/* Date Picker */}
            <div className="relative flex items-center group w-full sm:w-auto">
              <Calendar className="absolute left-3.5 h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors pointer-events-none z-10" />
              <input
                type="date"
                value={selectedDate}
                max={istDateString()}
                onChange={handleDateChange}
                aria-label="Select date"
                className="relative w-full sm:w-44 min-w-0 h-10 appearance-none rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-left text-base sm:text-sm text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:light] cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* The faculty member's own passes on the selected date */}
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium text-zinc-100">My Passes on this date</h2>
              <span className="shrink-0 text-xs text-zinc-500">{ownPasses.length} pass{ownPasses.length === 1 ? "" : "es"}</span>
            </div>
            {ownPasses.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">You had no gate passes on this date.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-800/70">
                {ownPasses.map((p: any) => (
                  <li key={p.id} className="py-3.5 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${p.type === "EXIT" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        {p.type === "EXIT" ? <DoorOpen className="h-3 w-3" /> : <DoorClosed className="h-3 w-3" />}
                        {p.type}
                      </span>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="text-sm font-medium text-zinc-100 break-words">{p.purpose}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      {p.destination && (
                        <span className="flex items-center gap-1.5 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="break-words">{p.destination}</span></span>
                      )}
                      <span className="flex items-center gap-1.5"><Clock className="h-3 w-3 shrink-0" />Requested {formatDateTime(p.createdAt)}{scheduledNote(p)}</span>
                      <span>Approver: {approverLabel(p)}</span>
                      {p.approvedAt && <span className="text-emerald-400">Approved {formatDateTime(p.approvedAt)}</span>}
                      {p.rejectedAt && (
                        <span className="text-red-400 break-words">Rejected{p.rejectionReason ? `: ${p.rejectionReason}` : ""}</span>
                      )}
                    </div>
                    {p.movements?.length > 0 && (
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-4 gap-y-1 rounded-2xl bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-500">
                        {p.movements.map((m: any, i: number) => (
                          <span key={i} className="flex items-center gap-1.5">
                            {m.type === "EXIT" ? <DoorOpen className="h-3 w-3 shrink-0 text-blue-400" /> : <DoorClosed className="h-3 w-3 shrink-0 text-emerald-400" />}
                            <span>
                              {m.type === "EXIT" ? "Exited" : "Entered"} {formatDateTime(m.createdAt)}
                              {m.gate?.name ? ` • ${m.gate.name}` : ""}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-medium text-zinc-100">Students&apos; Passes</h2>

            {/* Tabs */}
            <div className="inline-flex max-w-full self-start sm:self-auto rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none" role="tablist" aria-label="Filter students' passes">
              {([
                { id: "ALL", label: "All Data" },
                { id: "ENTRIES", label: "Entries" },
                { id: "EXITS", label: "Exits" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={activeTab === t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`whitespace-nowrap text-xs font-medium px-4 py-2 sm:px-3.5 sm:py-1.5 rounded-full transition-colors ${
                    activeTab === t.id ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="p-2 sm:p-3">
              {filteredPermissions.length === 0 ? (
                <p className="text-center text-sm text-zinc-500 py-12 px-4">
                  {initialSearch || activeTab !== "ALL"
                    ? "No passes match this search or filter on the selected date."
                    : "No activity found for the selected date."}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-800/70">
                  {filteredPermissions.map((perm) => {
                    const exitMove = perm.movements?.find((m: any) => m.type === "EXIT");
                    const entryMove = perm.movements?.find((m: any) => m.type === "ENTRY");

                    return (
                      <li key={perm.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedPermission(perm)}
                          className="w-full flex items-start sm:items-center gap-3 sm:gap-4 px-3 py-3.5 text-left rounded-2xl hover:bg-zinc-950 transition-colors cursor-pointer"
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 font-semibold">
                            {(perm.student?.profile?.name || "S").charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-start justify-between gap-2">
                              <span className="min-w-0 text-sm font-medium text-zinc-100 truncate">
                                {perm.student?.profile?.name}
                                <span className="font-normal text-zinc-500"> — {perm.student?.studentRoll}</span>
                              </span>
                              <span className="shrink-0"><StatusBadge status={perm.status} /></span>
                            </span>
                            <span className="mt-0.5 block text-xs text-zinc-500 break-words">
                              {perm.purpose} {perm.destination ? `→ ${perm.destination}` : ""}
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              {perm.type === 'ENTRY' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                                  <DoorClosed className="h-3 w-3" /> Entry Pass
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full">
                                  <DoorOpen className="h-3 w-3" /> Exit Pass
                                </span>
                              )}
                              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" /> Requested: {formatDateTime(perm.createdAt)}{scheduledNote(perm)}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Pagination (docked at the bottom of the screen; page lives in the URL) */}
          <PagerBar
            page={currentPage}
            pageSize={pageSize}
            total={total}
            hrefForPage={(p) => buildUrl({ page: p })}
            itemLabel="records"
          />
        </div>
      </div>

      <Modal
        open={!!selectedPermission}
        onClose={() => setSelectedPermission(null)}
        title="Permission Details"
      >
        {selectedPermission && (
          <div className="space-y-5 pt-2">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Student</dt>
                <dd className="text-sm text-zinc-200 break-words">{selectedPermission.student?.profile?.name}</dd>
                <dd className="text-xs text-zinc-500">{selectedPermission.student?.studentRoll}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Pass Status</dt>
                <dd><StatusBadge status={selectedPermission.status} /></dd>
                <dd className="text-xs text-zinc-500 mt-1">Requested: {formatDateTime(selectedPermission.createdAt)}{scheduledNote(selectedPermission)}</dd>
              </div>

              <div className="sm:col-span-2 min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Purpose</dt>
                <dd className="text-sm text-zinc-200 break-words">{selectedPermission.purpose}</dd>
              </div>
              {selectedPermission.destination && (
                <div className="sm:col-span-2 min-w-0">
                  <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Destination</dt>
                  <dd className="text-sm text-zinc-200 break-words">{selectedPermission.destination}</dd>
                </div>
              )}
              <div className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Expected Exit</dt>
                <dd className="text-sm text-zinc-200">
                  {selectedPermission.expectedExit ? formatDateTime(selectedPermission.expectedExit) : "None"}
                </dd>
              </div>
              {selectedPermission.type !== 'EXIT' && (
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Expected Return</dt>
                  <dd className="text-sm text-zinc-200">
                    {selectedPermission.expectedReturn ? formatDateTime(selectedPermission.expectedReturn) : "None"}
                  </dd>
                </div>
              )}
            </dl>

            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Gate Scans</p>
              {selectedPermission.movements?.length > 0 ? (
                selectedPermission.movements.map((mov: any, idx: number) => (
                  <div key={idx} className="p-3.5 bg-zinc-950 rounded-2xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
                        {mov.type === "EXIT" ? <DoorOpen className="h-4 w-4 text-blue-400" /> : <DoorClosed className="h-4 w-4 text-emerald-400" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-200 font-medium break-words">{mov.type === "EXIT" ? "Exited" : "Returned"} via {mov.gate?.name}</p>
                        <p className="text-xs text-zinc-500">{formatDateTime(mov.createdAt)}</p>
                      </div>
                    </div>
                    <span className="shrink-0"><StatusBadge status={mov.type} /></span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No gate scans recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

    </>
  );
}

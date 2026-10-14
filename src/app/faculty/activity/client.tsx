"use client";
import { scheduledNote } from "@/lib/pass-dates";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Modal } from "@/components/ui/primitives";
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    router.push(buildUrl({ date: e.target.value }));
  };

  return (
    <>
      <div className="space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <BackButton href="/faculty" label="Back to Dashboard" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Activity Log</h1>
            <p className="text-sm text-zinc-500 mt-1">Your passes and your students&apos; passes for the selected date</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative w-full sm:w-64 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-zinc-400 group-focus-within:text-orange-500 transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <input
                type="text"
                placeholder="Search name or roll..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-colors"
              />
            </div>
            {/* Date Picker */}
            <div className="relative flex items-center group w-full sm:w-auto">
              <Calendar className="absolute left-3 h-4 w-4 text-zinc-400 group-hover:text-zinc-200 transition-colors pointer-events-none z-10" />
              <input
                type="date"
                value={selectedDate}
                max={istDateString()}
                onChange={handleDateChange}
                className="relative w-full sm:w-auto h-9 pl-9 pr-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500/50 [color-scheme:dark] cursor-pointer hover:border-zinc-700 hover:bg-zinc-800 transition-colors [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* The faculty member's own passes on the selected date */}
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">My Passes on this date</h2>
              <span className="text-xs text-zinc-500">{ownPasses.length} pass{ownPasses.length === 1 ? "" : "es"}</span>
            </div>
            {ownPasses.length === 0 ? (
              <p className="text-xs text-zinc-500">You had no gate passes on this date.</p>
            ) : (
              <div className="space-y-2">
                {ownPasses.map((p: any) => (
                  <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${p.type === "EXIT" ? "bg-orange-500/20 text-orange-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                        {p.type}
                      </span>
                      <span className="text-sm font-semibold text-zinc-100 break-words">{p.purpose}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                      {p.destination && (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.destination}</span>
                      )}
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Requested {formatDateTime(p.createdAt)}{scheduledNote(p)}</span>
                      <span>Approver: {approverLabel(p)}</span>
                      {p.approvedAt && <span className="text-emerald-400">Approved {formatDateTime(p.approvedAt)}</span>}
                      {p.rejectedAt && (
                        <span className="text-red-400">Rejected{p.rejectionReason ? `: ${p.rejectionReason}` : ""}</span>
                      )}
                    </div>
                    {p.movements?.length > 0 && (
                      <div className="flex flex-wrap gap-x-4 text-xs text-zinc-500">
                        {p.movements.map((m: any, i: number) => (
                          <span key={i}>
                            {m.type === "EXIT" ? "Exited" : "Entered"} {formatDateTime(m.createdAt)}
                            {m.gate?.name ? ` • ${m.gate.name}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <h2 className="text-sm font-semibold text-zinc-100 pt-2">Students&apos; Passes</h2>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit">
          <button onClick={() => setActiveTab("ALL")} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === "ALL" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"}`}>All Data</button>
          <button onClick={() => setActiveTab("ENTRIES")} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === "ENTRIES" ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"}`}>Entries</button>
          <button onClick={() => setActiveTab("EXITS")} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === "EXITS" ? "bg-orange-500/20 text-orange-300" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"}`}>Exits</button>
        </div>

        <Card>
          <CardContent className="p-0">
            {filteredPermissions.length === 0 ? (
              <p className="text-center text-sm text-zinc-500 py-8">
                {initialSearch || activeTab !== "ALL"
                  ? "No passes match this search or filter on the selected date."
                  : "No activity found for the selected date."}
              </p>
            ) : (
              <div className="divide-y divide-zinc-800/30">
                {filteredPermissions.map((perm) => {
                  const exitMove = perm.movements?.find((m: any) => m.type === "EXIT");
                  const entryMove = perm.movements?.find((m: any) => m.type === "ENTRY");
                  
                  return (
                    <div 
                      key={perm.id} 
                      onClick={() => setSelectedPermission(perm)}
                      className="flex items-center justify-between px-6 py-4 table-row-hover transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="flex flex-col gap-1 items-center justify-center p-2 rounded-lg bg-zinc-900/50 border border-zinc-800 min-w-16">
                           <StatusBadge status={perm.status} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {perm.student?.profile?.name} — {perm.student?.studentRoll}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {perm.purpose} {perm.destination ? `→ ${perm.destination}` : ""}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            {perm.type === 'ENTRY' ? (
                               <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                 <DoorClosed className="h-3 w-3" /> Entry Pass
                               </div>
                            ) : (
                               <div className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                 <DoorOpen className="h-3 w-3" /> Exit Pass
                               </div>
                            )}
                            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                               <Clock className="h-3 w-3" /> Requested: {formatDateTime(perm.createdAt)}{scheduledNote(perm)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 py-4 px-1 sm:px-6 border-t border-zinc-800/50">
            <p className="text-sm text-zinc-400">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} records
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
                  onClick={() => router.push(buildUrl({ page: currentPage - 1 }))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => router.push(buildUrl({ page: currentPage + 1 }))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!selectedPermission}
        onClose={() => setSelectedPermission(null)}
        title="Permission Details"
      >
        {selectedPermission && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Student</p>
                <p className="text-sm text-zinc-200">{selectedPermission.student?.profile?.name}</p>
                <p className="text-xs text-zinc-400">{selectedPermission.student?.studentRoll}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Pass Status</p>
                <StatusBadge status={selectedPermission.status} />
                <p className="text-xs text-zinc-500 mt-1">Requested: {formatDateTime(selectedPermission.createdAt)}{scheduledNote(selectedPermission)}</p>
              </div>

              <div className="col-span-2">
                <p className="text-xs text-zinc-500 mb-1">Purpose</p>
                <p className="text-sm text-zinc-200">{selectedPermission.purpose}</p>
              </div>
              {selectedPermission.destination && (
                <div className="col-span-2">
                  <p className="text-xs text-zinc-500 mb-1">Destination</p>
                  <p className="text-sm text-zinc-200">{selectedPermission.destination}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-zinc-500 mb-1">Expected Exit</p>
                <p className="text-sm text-zinc-200">
                  {selectedPermission.expectedExit ? formatDateTime(selectedPermission.expectedExit) : "None"}
                </p>
              </div>
              {selectedPermission.type !== 'EXIT' && (
              <div>
                <p className="text-xs text-zinc-500 mb-1">Expected Return</p>
                <p className="text-sm text-zinc-200">
                  {selectedPermission.expectedReturn ? formatDateTime(selectedPermission.expectedReturn) : "None"}
                </p>
              </div>
  )}
              
              <div className="col-span-2 space-y-2 mt-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Gate Scans</p>
                {selectedPermission.movements?.length > 0 ? (
                  selectedPermission.movements.map((mov: any, idx: number) => (
                    <div key={idx} className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {mov.type === "EXIT" ? <DoorOpen className="h-4 w-4 text-orange-400" /> : <DoorClosed className="h-4 w-4 text-emerald-400" />}
                        <div>
                          <p className="text-sm text-zinc-200 font-medium">{mov.type === "EXIT" ? "Exited" : "Returned"} via {mov.gate?.name}</p>
                          <p className="text-xs text-zinc-500">{formatDateTime(mov.createdAt)}</p>
                        </div>
                      </div>
                      <StatusBadge status={mov.type} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No gate scans recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    
    </>
  );
}

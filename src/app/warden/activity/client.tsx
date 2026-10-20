"use client";
import { PassFullDetails, prefetchPassDetails } from "@/components/passes/pass-full-details";
import { DateField } from "@/components/ui/date-field";
import { usePendingNavigation } from "@/hooks/use-pending-navigation";
import { LoadingPill } from "@/components/ui/loading-pill";
import { istDateString } from "@/lib/time/ist";
import { scheduledNote } from "@/lib/pass-dates";

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, Modal } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { DoorOpen, DoorClosed, ArrowLeft, MapPin, Calendar, Clock, ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/server/actions/auth";
import { BackButton } from "@/components/ui/back-button";
import { PagerBar } from "@/components/ui/pager-bar";

export function WardenActivityClient({ 
  user, 
  permissions = [], 
  total = 0, 
  currentPage,
  selectedDate
}: { 
  user: any; 
  permissions: any[]; 
  total: number;
  currentPage: number;
  selectedDate: string;
}) {
  const router = useRouter();
  // Date / tab changes reload the list from the server: show progress meanwhile
  const { push: navigate, isPending: navigating } = usePendingNavigation();
  const [selectedPermission, setSelectedPermission] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "ENTRIES" | "EXITS">("ALL");
  
  // Filter locally
  const filteredPermissions = permissions.filter(p => {
    // Tab filtering
    if (activeTab === "ENTRIES" && p.type !== "ENTRY") return false;
    if (activeTab === "EXITS" && p.type !== "EXIT") return false;
    
    // Search filtering
    if (search) {
      const q = search.toLowerCase();
      if (!p.student?.profile?.name?.toLowerCase().includes(q) && 
          !p.student?.studentRoll?.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });
  
  const displayTotal = search || activeTab !== "ALL" ? filteredPermissions.length : total;
  

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    navigate(`/warden/activity?date=${e.target.value}`);
  };

  return (
    <>
      <LoadingPill active={navigating} />
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <BackButton href="/warden" label="Back to Dashboard" className="-ml-3 mb-2" />
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">Student Activity Log</h1>
            <p className="mt-1 text-sm text-zinc-500">{displayTotal} records found for your students</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
            {/* Search */}
            <div className="relative w-full sm:flex-1 lg:w-72 lg:flex-none">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search name or roll..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search name or roll"
                className="w-full h-10 rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
              />
            </div>
            {/* Date Picker */}
            <div className="relative flex items-center w-full sm:w-auto">
              <Calendar className="absolute left-3.5 h-4 w-4 text-zinc-500 pointer-events-none z-10" />
              <DateField
                value={selectedDate}
                max={istDateString()}
                onChange={handleDateChange}
                aria-label="Activity date"
                className="relative w-full sm:w-auto h-10 rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm font-medium text-zinc-100 outline-none [color-scheme:light] cursor-pointer transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
 showIcon={false}
/>
            </div>
          </div>
        </div>

        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-6 pb-3 sm:pb-4">
            <h2 className="text-base sm:text-lg font-medium text-zinc-100">Passes</h2>
            {/* Tabs */}
            <div
              className="inline-flex max-w-full self-start sm:self-auto rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
              role="tablist"
              aria-label="Filter activity"
            >
              {([
                ["ALL", "All Data"],
                ["ENTRIES", "Entries"],
                ["EXITS", "Exits"],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                    activeTab === tab ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <CardContent className="p-0 sm:p-0">
            {filteredPermissions.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-sm text-zinc-500 border-t border-zinc-800/70">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
                  <Calendar className="h-5 w-5" />
                </span>
                No activity found for the selected date.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
                {filteredPermissions.map((perm) => {
                  const exitMove = perm.movements?.find((m: any) => m.type === "EXIT");
                  const entryMove = perm.movements?.find((m: any) => m.type === "ENTRY");

                  return (
                    <li key={perm.id}>
                      <button
                        type="button"
                        onPointerDown={() => prefetchPassDetails(perm.id)} onClick={() => setSelectedPermission(perm)}
                        className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 text-left hover:bg-zinc-950/70 transition-colors cursor-pointer"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 font-semibold">
                          {(perm.student?.profile?.name || "S").charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-zinc-100 truncate">
                            {perm.student?.profile?.name}
                            <span className="text-zinc-500 font-normal"> · {perm.student?.studentRoll}</span>
                          </span>
                          <span className="block text-xs text-zinc-500 truncate">
                            {perm.purpose} {perm.destination ? `→ ${perm.destination}` : ""}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {perm.type === 'ENTRY' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                                <DoorClosed className="h-3 w-3" /> Entry Pass
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                                <DoorOpen className="h-3 w-3" /> Exit Pass
                              </span>
                            )}
                            <span className="text-[11px] text-zinc-500 flex items-center gap-1 min-w-0">
                              <Clock className="h-3 w-3 shrink-0" /> Requested: {formatDateTime(perm.createdAt)}{scheduledNote(perm)}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 self-start sm:self-center">
                          <StatusBadge status={perm.status} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <PagerBar
          page={currentPage}
          pageSize={25}
          total={displayTotal}
          hrefForPage={(p) => `/warden/activity?date=${selectedDate}&page=${p}`}
          itemLabel="records"
        />
      </div>

      <Modal
        open={!!selectedPermission}
        onClose={() => setSelectedPermission(null)}
        className="max-w-2xl"
        title="Permission Details"
      >
        {selectedPermission && <PassFullDetails permissionId={selectedPermission.id} preview={selectedPermission} />}
      </Modal>
    </>
  );
}

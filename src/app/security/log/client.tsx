"use client";
import { MovementDetails, VisitorDetails } from "@/components/registers/derived-views";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/primitives";
import { formatDateTime, formatTime } from "@/lib/utils";
import { DoorOpen, DoorClosed, Users, Search, Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { BackButton } from "@/components/ui/back-button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/primitives";

export function SecurityLogClient({ 
  user, 
  studentEntries,
  studentExits,
  outsiderVisits,
  selectedDate
}: { 
  user: any; 
  studentEntries: any[]; 
  studentExits: any[];
  outsiderVisits: any[];
  selectedDate: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"ENTRIES" | "EXITS" | "OUTSIDERS">("ENTRIES");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  
  const ITEMS_PER_PAGE = 10;

  const renderPagination = (totalItems: number) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const startItem = totalItems === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(page * ITEMS_PER_PAGE, totalItems);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800/40 px-4 sm:px-6 py-3.5 bg-zinc-950/40 rounded-b-xl">
        <p className="text-xs sm:text-sm text-zinc-400">
          Showing <span className="font-semibold text-zinc-200">{startItem}</span> to{" "}
          <span className="font-semibold text-zinc-200">{endItem}</span> of{" "}
          <span className="font-semibold text-zinc-200">{totalItems}</span> results
        </p>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          {totalPages > 1 ? (
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((pNum) => {
                  if (totalPages <= 5) return true;
                  if (pNum === 1 || pNum === totalPages) return true;
                  return Math.abs(pNum - page) <= 1;
                })
                .map((pNum, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && pNum - prev > 1;
                  return (
                    <span key={pNum} className="flex items-center">
                      {showEllipsis && <span className="px-1 text-zinc-600 text-xs">...</span>}
                      <button
                        type="button"
                        onClick={() => setPage(pNum)}
                        className={`h-8 min-w-[2rem] px-2 rounded-md text-xs font-medium transition-colors ${
                          page === pNum
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                        }`}
                      >
                        {pNum}
                      </button>
                    </span>
                  );
                })}
            </div>
          ) : (
            <span className="text-xs text-zinc-500 px-2">Page 1 of 1</span>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || totalPages === 0}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4 sm:ml-1" />
          </Button>
        </div>
      </div>
    );
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) {
      router.push(`/security/log?date=${newDate}`);
    }
  };

  const renderMovementList = (movements: any[], type: "ENTRY" | "EXIT") => {
    const filtered = movements.filter(m => 
      m.student?.profile?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.student?.studentRoll?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    return (
      <div>
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 py-12">
            No {type.toLowerCase()} records found for this date.
          </p>
        ) : (
          <div className="divide-y divide-zinc-800/30">
            {paginated.map((mov) => (
              <div key={mov.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 p-3 sm:px-6 sm:py-4 table-row-hover transition-colors cursor-pointer" onClick={() => setSelectedRecord(mov)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`rounded-lg p-1.5 shrink-0 ${type === "EXIT" ? "bg-orange-500/15 text-orange-400" : "bg-blue-500/15 text-blue-400"}`}>
                    {type === "EXIT" ? <DoorOpen className="h-4 w-4" /> : <DoorClosed className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {mov.student?.profile?.name} — {mov.student?.studentRoll}
                    </p>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">
                      {mov.gate?.name} • {mov.permission?.purpose} {mov.permission?.destination ? `→ ${mov.permission.destination}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                  <p className="text-xs sm:text-sm text-zinc-300 font-medium">
                    {formatTime(mov.createdAt)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {mov.student?.profile?.phone}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {renderPagination(filtered.length)}
      </div>
    );
  };

  const renderOutsidersList = () => {
    const filtered = outsiderVisits.filter(o => 
      o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.phone.includes(searchQuery) ||
      o.vehicleNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    return (
      <div>
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 py-12">
            No visitor visits found for this date.
          </p>
        ) : (
          <div className="divide-y divide-zinc-800/30">
            {paginated.map((outsider) => (
              <div key={outsider.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 p-3 sm:px-6 sm:py-4 table-row-hover transition-colors cursor-pointer" onClick={() => setSelectedRecord(outsider)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="rounded-lg p-1.5 bg-zinc-800 text-zinc-400 shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {outsider.name}
                      </p>
                      <StatusBadge status={outsider.status} />
                    </div>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">
                      {outsider.category} • {outsider.purpose} {outsider.visitingStudent ? `(Visiting: ${outsider.visitingStudent})` : ""}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {outsider.phone} {outsider.vehicleNumber ? `• Vehicle: ${outsider.vehicleNumber}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm text-zinc-300 font-medium">
                    <DoorClosed className="h-3.5 w-3.5 text-blue-400" />
                    {formatTime(outsider.entryTime)}
                  </div>
                  {outsider.exitTime && (
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-zinc-400">
                      <DoorOpen className="h-3.5 w-3.5 text-orange-400" />
                      {formatTime(outsider.exitTime)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {renderPagination(filtered.length)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <BackButton href="/security" label="Back to Dashboard" />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Entries & Exits</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {studentEntries.length} entries, {studentExits.length} exits, {outsiderVisits.length} visitor visits
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input 
              placeholder="Search by name, roll no..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 w-full sm:w-[250px] bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="relative flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-md px-3 h-10 shrink-0">
            <input 
              type="date" 
              value={selectedDate}
              onChange={handleDateChange}
              className="bg-transparent text-sm text-zinc-200 focus:outline-none [color-scheme:dark] cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-zinc-800 pb-px overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("ENTRIES")}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === "ENTRIES" ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Student Entries
          {activeTab === "ENTRIES" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("EXITS")}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === "EXITS" ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Student Exits
          {activeTab === "EXITS" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("OUTSIDERS")}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === "OUTSIDERS" ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Visitor Visits
          {activeTab === "OUTSIDERS" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-400" />
          )}
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          {activeTab === "ENTRIES" && renderMovementList(studentEntries, "ENTRY")}
          {activeTab === "EXITS" && renderMovementList(studentExits, "EXIT")}
          {activeTab === "OUTSIDERS" && renderOutsidersList()}
        </CardContent>
      </Card>


      {/* Details Modal */}
      <Modal
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord && !selectedRecord.entryTime ? "Gate Movement Details" : "Visitor Details"}
        className="max-w-xl"
      >
        {selectedRecord &&
          (selectedRecord.entryTime ? (
            <VisitorDetails id={selectedRecord.id} />
          ) : (
            <MovementDetails id={selectedRecord.id} />
          ))}
      </Modal>

    </div>
  );
}

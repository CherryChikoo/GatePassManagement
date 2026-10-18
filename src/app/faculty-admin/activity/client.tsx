"use client";
import { DateField } from "@/components/ui/date-field";
import { usePendingNavigation } from "@/hooks/use-pending-navigation";
import { LoadingPill } from "@/components/ui/loading-pill";
import { istDateString } from "@/lib/time/ist";
import { scheduledNote } from "@/lib/pass-dates";

import { Card, CardContent } from "@/components/ui/card";
import { PagerBar } from "@/components/ui/pager-bar";
import { StatusBadge, Modal } from "@/components/ui/primitives";
import { formatDateTime, formatDate } from "@/lib/utils";
import { getDepartmentCode, getDepartmentFullName } from "@/lib/constants";
import {
  DoorOpen,
  DoorClosed,
  Calendar,
  Clock,
  LogIn,
  LogOut,
  GraduationCap,
  Briefcase,
  AlertCircle,
  MapPin,
  Phone,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackButton } from "@/components/ui/back-button";

type Tab = "STUDENTS" | "FACULTY" | "ALL";
type SubTab = "ALL" | "PENDING" | "ENTRIES" | "EXITS";

interface HodActivityClientProps {
  user: any;
  permissions?: any[];
  facultyPermissions?: any[];
  facultyMovements?: any[];
  selectedDate: string;
  department: string;
}

export function HodActivityClient({
  user,
  permissions = [],
  facultyPermissions = [],
  facultyMovements = [],
  selectedDate,
  department,
}: HodActivityClientProps) {
  const router = useRouter();
  // Date / tab changes reload the list from the server: show progress meanwhile
  const { push: navigate, isPending: navigating } = usePendingNavigation();
  const [selectedPermission, setSelectedPermission] = useState<any>(null);
  const [selectedMovement, setSelectedMovement] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("STUDENTS");
  const [subTab, setSubTab] = useState<SubTab>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Search filter predicate
  const q = search.toLowerCase().trim();

  const studentMatchesSearch = (p: any) => {
    if (!q) return true;
    return (
      p.student?.profile?.name?.toLowerCase().includes(q) ||
      p.student?.studentRoll?.toLowerCase().includes(q) ||
      p.student?.department?.toLowerCase().includes(q) ||
      p.purpose?.toLowerCase().includes(q) ||
      p.destination?.toLowerCase().includes(q)
    );
  };

  const facultyPermMatchesSearch = (p: any) => {
    if (!q) return true;
    return (
      p.faculty?.profile?.name?.toLowerCase().includes(q) ||
      p.faculty?.employeeId?.toLowerCase().includes(q) ||
      p.faculty?.department?.toLowerCase().includes(q) ||
      p.faculty?.designation?.toLowerCase().includes(q) ||
      p.purpose?.toLowerCase().includes(q) ||
      p.destination?.toLowerCase().includes(q)
    );
  };

  const facultyMovMatchesSearch = (m: any) => {
    if (!q) return true;
    return (
      m.faculty?.profile?.name?.toLowerCase().includes(q) ||
      m.faculty?.employeeId?.toLowerCase().includes(q) ||
      m.faculty?.department?.toLowerCase().includes(q) ||
      m.faculty?.designation?.toLowerCase().includes(q) ||
      m.gate?.name?.toLowerCase().includes(q)
    );
  };

  // Base search-filtered lists
  const searchStudents = permissions.filter(studentMatchesSearch);
  const searchFacultyPerms = facultyPermissions.filter(facultyPermMatchesSearch);
  const searchFacultyMovements = facultyMovements.filter(facultyMovMatchesSearch);

  // Sub-tab counts calculation
  const studentCounts = {
    all: searchStudents.length,
    pending: searchStudents.filter((p) => p.status === "PENDING").length,
    entries: searchStudents.filter((p) => p.type === "ENTRY").length,
    exits: searchStudents.filter((p) => p.type === "EXIT").length,
  };

  const facultyCounts = {
    all: searchFacultyPerms.length + searchFacultyMovements.length,
    pending: searchFacultyPerms.filter((p) => p.status === "PENDING").length,
    entries:
      searchFacultyPerms.filter((p) => p.type === "ENTRY").length +
      searchFacultyMovements.filter((m) => m.type === "ENTRY").length,
    exits:
      searchFacultyPerms.filter((p) => p.type === "EXIT").length +
      searchFacultyMovements.filter((m) => m.type === "EXIT").length,
  };

  const combinedCounts = {
    all: studentCounts.all + facultyCounts.all,
    pending: studentCounts.pending + facultyCounts.pending,
    entries: studentCounts.entries + facultyCounts.entries,
    exits: studentCounts.exits + facultyCounts.exits,
  };

  const activeSubCounts =
    activeTab === "STUDENTS"
      ? studentCounts
      : activeTab === "FACULTY"
      ? facultyCounts
      : combinedCounts;

  // Filter students by subTab
  const filteredStudents = searchStudents.filter((p) => {
    if (subTab === "PENDING") return p.status === "PENDING";
    if (subTab === "ENTRIES") return p.type === "ENTRY";
    if (subTab === "EXITS") return p.type === "EXIT";
    return true;
  });

  // Filter faculty permissions by subTab
  const filteredFacultyPerms = searchFacultyPerms.filter((p) => {
    if (subTab === "PENDING") return p.status === "PENDING";
    if (subTab === "ENTRIES") return p.type === "ENTRY";
    if (subTab === "EXITS") return p.type === "EXIT";
    return true;
  });

  // Filter faculty movements by subTab (movements are executed scans, so never PENDING)
  const filteredFacultyMovements = searchFacultyMovements.filter((m) => {
    if (subTab === "PENDING") return false;
    if (subTab === "ENTRIES") return m.type === "ENTRY";
    if (subTab === "EXITS") return m.type === "EXIT";
    return true;
  });

  // Build combined items list
  type ActivityItem =
    | { kind: "student-permission"; data: any; sortKey: number }
    | { kind: "faculty-permission"; data: any; sortKey: number }
    | { kind: "faculty-movement"; data: any; sortKey: number };

  const visibleItems: ActivityItem[] = [];

  if (activeTab === "ALL" || activeTab === "STUDENTS") {
    filteredStudents.forEach((p) =>
      visibleItems.push({
        kind: "student-permission",
        data: p,
        sortKey: p.createdAt ? new Date(p.createdAt).getTime() : 0,
      })
    );
  }

  if (activeTab === "ALL" || activeTab === "FACULTY") {
    filteredFacultyPerms.forEach((p) =>
      visibleItems.push({
        kind: "faculty-permission",
        data: p,
        sortKey: p.createdAt ? new Date(p.createdAt).getTime() : 0,
      })
    );
    filteredFacultyMovements.forEach((m) =>
      visibleItems.push({
        kind: "faculty-movement",
        data: m,
        sortKey: m.createdAt ? new Date(m.createdAt).getTime() : 0,
      })
    );
  }

  visibleItems.sort((a, b) => b.sortKey - a.sortKey);

  const displayTotal = visibleItems.length;
  const paginatedItems = visibleItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    navigate(`/faculty-admin/activity?date=${e.target.value}`);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSubTabChange = (sub: SubTab) => {
    setSubTab(sub);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const segTrack =
    "inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none";
  const segItem = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
      active ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
    }`;
  const countChip = "text-[10px] font-semibold text-zinc-500";
  const idChip =
    "rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-500";
  const kindChip =
    "rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 shrink-0";
  const pendingChip =
    "inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400";
  const rowBase =
    "w-full flex items-start gap-3 sm:gap-4 px-4 sm:px-6 py-4 text-left hover:bg-zinc-950/70 transition-colors cursor-pointer";

  const passTypeChip = (type: string) =>
    type === "ENTRY" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
        <DoorClosed className="h-3 w-3" /> Entry Pass
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400">
        <DoorOpen className="h-3 w-3" /> Exit Pass
      </span>
    );

  return (
    <>
      <LoadingPill active={navigating} />
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <BackButton href="/faculty-admin" label="Back to Dashboard" />
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 flex items-center gap-3 flex-wrap">
              Department Activity Log
              {department && (
                <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
                  {getDepartmentCode(department)}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {displayTotal} records found
              {department ? ` · Department of ${getDepartmentFullName(department)}` : ""}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
            {/* Search */}
            <div className="relative w-full sm:flex-1 lg:w-64 lg:flex-none group">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                <svg
                  className="h-4 w-4 text-zinc-500 group-focus-within:text-orange-500 transition-colors"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search name, roll, purpose..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full h-10 rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 transition-colors"
              />
            </div>

            {/* Date picker */}
            <div className="relative flex items-center group w-full sm:w-auto">
              <Calendar className="absolute left-3.5 h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors pointer-events-none z-10" />
              <DateField
                value={selectedDate}
                max={istDateString()}
                onChange={handleDateChange}
                className="relative w-full sm:w-auto h-10 rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm font-medium text-zinc-200 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:light] cursor-pointer hover:border-zinc-700 transition-colors [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
 showIcon={false}
/>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          {/* Primary tabs: Students / Faculty / All */}
          <div className={`${segTrack} self-start`} role="tablist" aria-label="Applicant type">
            <button type="button" role="tab" aria-selected={activeTab === "STUDENTS"} onClick={() => handleTabChange("STUDENTS")} className={segItem(activeTab === "STUDENTS")}>
              <GraduationCap className="h-3.5 w-3.5" />
              Students
              <span className={countChip}>({studentCounts.all})</span>
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "FACULTY"} onClick={() => handleTabChange("FACULTY")} className={segItem(activeTab === "FACULTY")}>
              <Briefcase className="h-3.5 w-3.5" />
              Faculty
              <span className={countChip}>({facultyCounts.all})</span>
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "ALL"} onClick={() => handleTabChange("ALL")} className={segItem(activeTab === "ALL")}>
              All
              <span className={countChip}>({combinedCounts.all})</span>
            </button>
          </div>

          {/* Sub-tabs: All Data / Pending / Entries / Exits */}
          <div className={`${segTrack} self-start`} role="tablist" aria-label="Activity type">
            <button type="button" role="tab" aria-selected={subTab === "ALL"} onClick={() => handleSubTabChange("ALL")} className={segItem(subTab === "ALL")}>
              All Data
              <span className={countChip}>({activeSubCounts.all})</span>
            </button>
            <button type="button" role="tab" aria-selected={subTab === "PENDING"} onClick={() => handleSubTabChange("PENDING")} className={segItem(subTab === "PENDING")}>
              <AlertCircle className={`h-3.5 w-3.5 ${activeSubCounts.pending > 0 ? "text-amber-400" : ""}`} />
              Pending
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold ${
                  activeSubCounts.pending > 0 ? "bg-amber-500/10 text-amber-400" : "text-zinc-500"
                }`}
              >
                {activeSubCounts.pending}
              </span>
            </button>
            <button type="button" role="tab" aria-selected={subTab === "ENTRIES"} onClick={() => handleSubTabChange("ENTRIES")} className={segItem(subTab === "ENTRIES")}>
              <DoorClosed className="h-3.5 w-3.5" />
              Entries
              <span className={countChip}>({activeSubCounts.entries})</span>
            </button>
            <button type="button" role="tab" aria-selected={subTab === "EXITS"} onClick={() => handleSubTabChange("EXITS")} className={segItem(subTab === "EXITS")}>
              <DoorOpen className="h-3.5 w-3.5" />
              Exits
              <span className={countChip}>({activeSubCounts.exits})</span>
            </button>
          </div>
        </div>

        {/* Activity list */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {paginatedItems.length === 0 ? (
              <div className="flex flex-col items-center py-12 px-4 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
                  <Clock className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-zinc-300">
                  {subTab === "PENDING"
                    ? "No pending pass requests found for the selected date."
                    : subTab === "ENTRIES"
                    ? "No entry activity recorded for the selected date."
                    : subTab === "EXITS"
                    ? "No exit activity recorded for the selected date."
                    : "No activity records found for the selected date."}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {search
                    ? "Try adjusting your search query or switching tabs."
                    : "Pass requests and gate scan logs will appear here."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-800/70">
                {paginatedItems.map((item) => {
                  if (item.kind === "student-permission") {
                    const perm = item.data;
                    const isPending = perm.status === "PENDING";
                    const name = perm.student?.profile?.name || "Student";
                    return (
                      <li key={`s-${perm.id}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedPermission(perm)}
                          className={`${rowBase} ${isPending ? "bg-amber-500/[0.04]" : ""}`}
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 font-semibold">
                            {name.charAt(0).toUpperCase()}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                              <span className="text-sm font-medium text-zinc-100 truncate max-w-full">{name}</span>
                              {perm.student?.studentRoll && <span className={idChip}>{perm.student.studentRoll}</span>}
                              <span className={kindChip}>Student</span>
                              {isPending && (
                                <span className={pendingChip}>
                                  <AlertCircle className="h-3 w-3" />
                                  Pending HOD Approval
                                </span>
                              )}
                            </span>

                            <span className="mt-1 block text-xs text-zinc-300 break-words">
                              {perm.purpose}{" "}
                              {perm.destination && (
                                <span className="text-zinc-500">→ {perm.destination}</span>
                              )}
                            </span>

                            <span className="mt-2 flex items-center gap-x-3 gap-y-1.5 flex-wrap">
                              {passTypeChip(perm.type)}
                              {perm.createdAt && (
                                <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  Requested: {formatDateTime(perm.createdAt)}{scheduledNote(perm)}
                                </span>
                              )}
                              {perm.movements && perm.movements.length > 0 && (
                                <span className="rounded-full bg-zinc-950 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                                  {perm.movements.length} gate scan
                                  {perm.movements.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </span>
                          </span>

                          <span className="shrink-0">
                            <StatusBadge status={perm.status} />
                          </span>
                        </button>
                      </li>
                    );
                  } else if (item.kind === "faculty-permission") {
                    const perm = item.data;
                    const isPending = perm.status === "PENDING";
                    const name = perm.faculty?.profile?.name || "Faculty Member";
                    return (
                      <li key={`fp-${perm.id}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedPermission(perm)}
                          className={`${rowBase} ${isPending ? "bg-amber-500/[0.04]" : ""}`}
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 font-semibold">
                            {name.charAt(0).toUpperCase()}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                              <span className="text-sm font-medium text-zinc-100 truncate max-w-full">{name}</span>
                              {perm.faculty?.employeeId && <span className={idChip}>{perm.faculty.employeeId}</span>}
                              <span className={kindChip}>Faculty</span>
                              {perm.faculty?.designation && (
                                <span className="rounded-full bg-zinc-950 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                  {perm.faculty.designation}
                                </span>
                              )}
                              {isPending && (
                                <span className={pendingChip}>
                                  <AlertCircle className="h-3 w-3" />
                                  Pending HOD Approval
                                </span>
                              )}
                            </span>

                            <span className="mt-1 block text-xs text-zinc-300 break-words">
                              {perm.purpose}{" "}
                              {perm.destination && (
                                <span className="text-zinc-500">→ {perm.destination}</span>
                              )}
                            </span>

                            <span className="mt-2 flex items-center gap-x-3 gap-y-1.5 flex-wrap">
                              {passTypeChip(perm.type)}
                              {perm.createdAt && (
                                <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  Requested: {formatDateTime(perm.createdAt)}{scheduledNote(perm)}
                                </span>
                              )}
                              {perm.movements && perm.movements.length > 0 && (
                                <span className="rounded-full bg-zinc-950 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                                  {perm.movements.length} gate scan
                                  {perm.movements.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </span>
                          </span>

                          <span className="shrink-0">
                            <StatusBadge status={perm.status} />
                          </span>
                        </button>
                      </li>
                    );
                  } else {
                    const mov = item.data;
                    const isExit = mov.type === "EXIT";
                    return (
                      <li key={`fm-${mov.id}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedMovement(mov)}
                          className={rowBase}
                        >
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                              isExit ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400"
                            }`}
                          >
                            {isExit ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                              <span className="text-sm font-medium text-zinc-100 truncate max-w-full">
                                {mov.faculty?.profile?.name || "Unknown Faculty"}
                              </span>
                              {mov.faculty?.employeeId && <span className={idChip}>{mov.faculty.employeeId}</span>}
                              <span className={kindChip}>Faculty</span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                                  isExit ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400"
                                }`}
                              >
                                {mov.type} GATE SCAN
                              </span>
                            </span>

                            <span className="mt-1.5 flex items-center gap-x-3 gap-y-1 text-xs text-zinc-500 flex-wrap">
                              {mov.faculty?.designation && (
                                <span className="text-zinc-400">{mov.faculty.designation}</span>
                              )}
                              <span className="flex items-center gap-1">
                                <DoorOpen className="h-3 w-3 shrink-0" />
                                {mov.gate?.name || "Gate"}
                                {mov.gate?.location ? ` (${mov.gate.location})` : ""}
                              </span>
                              <span aria-hidden>•</span>
                              <span>{mov.createdAt ? formatDateTime(mov.createdAt) : "—"}</span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  }
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pagination (docks at the bottom of the screen) */}
        <PagerBar
          page={currentPage}
          pageSize={pageSize}
          total={displayTotal}
          onPageChange={setCurrentPage}
          itemLabel="records"
        />
      </div>

      {/* Permission detail modal (student & faculty) */}
      <Modal
        open={!!selectedPermission}
        onClose={() => setSelectedPermission(null)}
        title={
          selectedPermission?.student
            ? "Student Permission Details"
            : selectedPermission?.faculty
            ? "Faculty Pass Details"
            : "Pass Details"
        }
      >
        {selectedPermission && (
          <div className="space-y-4">
            {/* Applicant */}
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 p-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                  {selectedPermission.student ? "Student Applicant" : "Faculty Member"}
                </p>
                <p className="mt-0.5 text-sm font-medium text-zinc-100 break-words">
                  {selectedPermission.student?.profile?.name ||
                    selectedPermission.faculty?.profile?.name ||
                    "Applicant"}
                </p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  {selectedPermission.student?.studentRoll ||
                    selectedPermission.faculty?.employeeId ||
                    selectedPermission.faculty?.designation ||
                    "—"}
                </p>
              </div>
              <div className="shrink-0 text-right space-y-1">
                <StatusBadge status={selectedPermission.status} />
                <p className="text-[11px] text-zinc-500">{selectedPermission.type} PASS</p>
              </div>
            </div>

            {/* Purpose & destination */}
            <div className="space-y-2">
              <div className="rounded-2xl bg-zinc-950 p-3">
                <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Purpose of Leave</span>
                <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedPermission.purpose}</p>
              </div>

              {selectedPermission.destination && (
                <div className="rounded-2xl bg-zinc-950 p-3">
                  <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Destination</span>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-200 break-words">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    {selectedPermission.destination}
                  </p>
                </div>
              )}
            </div>

            {/* Date & timing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-2xl bg-zinc-950 p-3">
                <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Pass Date / Requested</span>
                <p className="mt-0.5 text-sm font-medium text-zinc-200">
                  {selectedPermission.exitDate
                    ? formatDate(selectedPermission.exitDate)
                    : selectedPermission.createdAt
                    ? formatDate(selectedPermission.createdAt)
                    : "—"}
                </p>
              </div>

              <div className="rounded-2xl bg-zinc-950 p-3">
                <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Expected Timing</span>
                <p className="mt-0.5 text-sm font-medium text-zinc-200">
                  {selectedPermission.expectedExit
                    ? formatDateTime(selectedPermission.expectedExit).split(", ")[1]
                    : "Anytime"}
                  {selectedPermission.expectedReturn
                    ? ` → ${formatDateTime(selectedPermission.expectedReturn).split(", ")[1]}`
                    : ""}
                </p>
              </div>
            </div>

            {/* Contact / remarks */}
            {(selectedPermission.contactNumber || selectedPermission.remarks) && (
              <div className="rounded-2xl bg-zinc-950 p-3 space-y-1 text-xs">
                {selectedPermission.contactNumber && (
                  <p className="flex items-center gap-1.5 text-zinc-500">
                    <Phone className="h-3.5 w-3.5" /> Contact:{" "}
                    <span className="font-mono text-zinc-200">{selectedPermission.contactNumber}</span>
                  </p>
                )}
                {selectedPermission.remarks && (
                  <p className="text-zinc-300 break-words">
                    <span className="text-zinc-500">Remarks:</span> {selectedPermission.remarks}
                  </p>
                )}
              </div>
            )}

            {/* Gate scans */}
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Recorded Gate Scans</p>
              {selectedPermission.movements && selectedPermission.movements.length > 0 ? (
                <div className="grid gap-2">
                  {selectedPermission.movements.map((mov: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 p-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            mov.type === "EXIT" ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          {mov.type === "EXIT" ? <DoorOpen className="h-4 w-4" /> : <DoorClosed className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-200 break-words">
                            {mov.type === "EXIT" ? "Exited" : "Returned"} via{" "}
                            {mov.gate?.name || "Main Gate"}
                          </p>
                          <p className="text-[11px] text-zinc-500">{formatDateTime(mov.createdAt)}</p>
                        </div>
                      </div>
                      <StatusBadge status={mov.type} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-zinc-950 p-3 text-xs text-zinc-500">
                  No gate scans registered for this pass yet.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Standalone faculty movement detail modal */}
      <Modal
        open={!!selectedMovement}
        onClose={() => setSelectedMovement(null)}
        title="Faculty Gate Scan Details"
      >
        {selectedMovement && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="min-w-0">
              <dt className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Faculty</dt>
              <dd className="text-sm font-medium text-zinc-200 break-words">
                {selectedMovement.faculty?.profile?.name}
              </dd>
              {selectedMovement.faculty?.employeeId && (
                <dd className="font-mono text-xs text-zinc-500">{selectedMovement.faculty.employeeId}</dd>
              )}
              {selectedMovement.faculty?.designation && (
                <dd className="text-xs text-zinc-500">{selectedMovement.faculty.designation}</dd>
              )}
            </div>
            <div className="min-w-0">
              <dt className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Movement Type</dt>
              <dd>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                    selectedMovement.type === "EXIT"
                      ? "bg-sky-500/10 text-sky-400"
                      : "bg-emerald-500/10 text-emerald-400"
                  }`}
                >
                  {selectedMovement.type}
                </span>
              </dd>
            </div>

            {selectedMovement.faculty?.department && (
              <div className="min-w-0">
                <dt className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Department</dt>
                <dd className="text-sm text-zinc-200 break-words">{selectedMovement.faculty.department}</dd>
              </div>
            )}

            <div className="min-w-0">
              <dt className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Gate</dt>
              <dd className="text-sm text-zinc-200 break-words">
                {selectedMovement.gate?.name || "Gate"}
                {selectedMovement.gate?.location ? ` (${selectedMovement.gate.location})` : ""}
              </dd>
            </div>

            <div className="sm:col-span-2 min-w-0">
              <dt className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Timestamp</dt>
              <dd className="text-sm font-medium text-zinc-200">
                {selectedMovement.createdAt ? formatDateTime(selectedMovement.createdAt) : "—"}
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </>
  );
}

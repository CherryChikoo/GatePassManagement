"use client";
import { istDateString } from "@/lib/time/ist";
import { scheduledNote } from "@/lib/pass-dates";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  User,
  GraduationCap,
  Briefcase,
  AlertCircle,
  MapPin,
  Phone,
  FileText,
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
  const totalPages = Math.max(1, Math.ceil(displayTotal / pageSize));
  const paginatedItems = visibleItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    router.push(`/faculty-admin/activity?date=${e.target.value}`);
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

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <BackButton href="/faculty-admin" label="Back to Dashboard" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2 flex-wrap">
              Department Activity Log
              {department && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  {getDepartmentCode(department)}
                </span>
              )}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {displayTotal} records found
              {department ? ` · Department of ${getDepartmentFullName(department)}` : ""}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative w-full sm:w-64 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-4 w-4 text-zinc-400 group-focus-within:text-orange-500 transition-colors"
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
                className="relative w-full sm:w-auto h-9 pl-9 pr-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500/50 [color-scheme:light] cursor-pointer hover:border-zinc-700 hover:bg-zinc-800 transition-colors [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Primary Tabs: Students / Faculty / All */}
        <div className="flex gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit">
          <button
            onClick={() => handleTabChange("STUDENTS")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "STUDENTS"
                ? "bg-blue-500/20 text-blue-300 shadow-none"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <GraduationCap className="h-3.5 w-3.5" />
            Students
            <span className="text-[10px] opacity-70">({studentCounts.all})</span>
          </button>

          <button
            onClick={() => handleTabChange("FACULTY")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "FACULTY"
                ? "bg-indigo-500/20 text-indigo-300 shadow-none"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            Faculty
            <span className="text-[10px] opacity-70">({facultyCounts.all})</span>
          </button>

          <button
            onClick={() => handleTabChange("ALL")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "ALL"
                ? "bg-zinc-900 text-zinc-100 shadow-card shadow-none"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            All
            <span className="text-[10px] opacity-70">({combinedCounts.all})</span>
          </button>
        </div>

        {/* Sub-tabs: All Data / Pending / Entries / Exits */}
        <div className="flex flex-wrap gap-2 p-1 bg-zinc-900/60 border border-zinc-800/80 rounded-lg w-fit">
          <button
            onClick={() => handleSubTabChange("ALL")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              subTab === "ALL"
                ? "bg-zinc-900 text-zinc-100 shadow-card shadow-none"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            All Data
            <span className="text-[10px] opacity-70">({activeSubCounts.all})</span>
          </button>

          <button
            onClick={() => handleSubTabChange("PENDING")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              subTab === "PENDING"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-none"
                : activeSubCounts.pending > 0
                ? "text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Pending
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeSubCounts.pending > 0
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "opacity-70"
              }`}
            >
              {activeSubCounts.pending}
            </span>
          </button>

          <button
            onClick={() => handleSubTabChange("ENTRIES")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              subTab === "ENTRIES"
                ? "bg-emerald-500/20 text-emerald-300 shadow-none"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <DoorClosed className="h-3.5 w-3.5" />
            Entries
            <span className="text-[10px] opacity-70">({activeSubCounts.entries})</span>
          </button>

          <button
            onClick={() => handleSubTabChange("EXITS")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              subTab === "EXITS"
                ? "bg-orange-500/20 text-orange-300 shadow-none"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <DoorOpen className="h-3.5 w-3.5" />
            Exits
            <span className="text-[10px] opacity-70">({activeSubCounts.exits})</span>
          </button>
        </div>

        {/* Activity List */}
        <Card className="border border-zinc-800 bg-zinc-900/40 shadow-none overflow-hidden rounded-2xl">
          <CardContent className="p-0">
            {paginatedItems.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-2">
                <p className="text-sm font-medium text-zinc-400">
                  {subTab === "PENDING"
                    ? "No pending pass requests found for the selected date."
                    : subTab === "ENTRIES"
                    ? "No entry activity recorded for the selected date."
                    : subTab === "EXITS"
                    ? "No exit activity recorded for the selected date."
                    : "No activity records found for the selected date."}
                </p>
                <p className="text-xs text-zinc-500">
                  {search
                    ? "Try adjusting your search query or switching tabs."
                    : "Pass requests and gate scan logs will appear here."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/40">
                {paginatedItems.map((item) => {
                  if (item.kind === "student-permission") {
                    const perm = item.data;
                    const isPending = perm.status === "PENDING";
                    return (
                      <div
                        key={`s-${perm.id}`}
                        onClick={() => setSelectedPermission(perm)}
                        className={`flex items-center justify-between px-6 py-4.5 hover:bg-zinc-800/30 transition-colors cursor-pointer ${
                          isPending ? "bg-amber-500/[0.03]" : ""
                        }`}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex flex-col gap-1 items-center justify-center p-2 rounded-xl bg-zinc-900 border border-zinc-800 min-w-20 shrink-0">
                            <StatusBadge status={perm.status} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="text-sm font-semibold text-zinc-100 truncate">
                                {perm.student?.profile?.name || "Student"}
                              </p>
                              {perm.student?.studentRoll && (
                                <span className="font-mono text-xs text-zinc-400 font-bold px-1.5 py-0.5 rounded bg-zinc-800/70 border border-zinc-700/60">
                                  {perm.student.studentRoll}
                                </span>
                              )}
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
                                Student
                              </span>
                              {isPending && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Pending HOD Approval
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-zinc-300 font-medium">
                              {perm.purpose}{" "}
                              {perm.destination && (
                                <span className="text-zinc-500 font-normal">
                                  → {perm.destination}
                                </span>
                              )}
                            </p>

                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              {perm.type === "ENTRY" ? (
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                  <DoorClosed className="h-3 w-3" /> Entry Pass
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">
                                  <DoorOpen className="h-3 w-3" /> Exit Pass
                                </div>
                              )}

                              {perm.createdAt && (
                                <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-zinc-400" />
                                  Requested: {formatDateTime(perm.createdAt)}{scheduledNote(perm)}
                                </span>
                              )}

                              {perm.movements && perm.movements.length > 0 && (
                                <span className="text-[11px] text-zinc-400 font-medium bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/50">
                                  {perm.movements.length} gate scan
                                  {perm.movements.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  } else if (item.kind === "faculty-permission") {
                    const perm = item.data;
                    const isPending = perm.status === "PENDING";
                    return (
                      <div
                        key={`fp-${perm.id}`}
                        onClick={() => setSelectedPermission(perm)}
                        className={`flex items-center justify-between px-6 py-4.5 hover:bg-zinc-800/30 transition-colors cursor-pointer ${
                          isPending ? "bg-amber-500/[0.03]" : ""
                        }`}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex flex-col gap-1 items-center justify-center p-2 rounded-xl bg-zinc-900 border border-zinc-800 min-w-20 shrink-0">
                            <StatusBadge status={perm.status} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="text-sm font-semibold text-zinc-100 truncate">
                                {perm.faculty?.profile?.name || "Faculty Member"}
                              </p>
                              {perm.faculty?.employeeId && (
                                <span className="font-mono text-xs text-zinc-400 font-bold px-1.5 py-0.5 rounded bg-zinc-800/70 border border-zinc-700/60">
                                  {perm.faculty.employeeId}
                                </span>
                              )}
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0">
                                Faculty
                              </span>
                              {perm.faculty?.designation && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                                  {perm.faculty.designation}
                                </span>
                              )}
                              {isPending && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Pending HOD Approval
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-zinc-300 font-medium">
                              {perm.purpose}{" "}
                              {perm.destination && (
                                <span className="text-zinc-500 font-normal">
                                  → {perm.destination}
                                </span>
                              )}
                            </p>

                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              {perm.type === "ENTRY" ? (
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                  <DoorClosed className="h-3 w-3" /> Entry Pass
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">
                                  <DoorOpen className="h-3 w-3" /> Exit Pass
                                </div>
                              )}

                              {perm.createdAt && (
                                <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-zinc-400" />
                                  Requested: {formatDateTime(perm.createdAt)}{scheduledNote(perm)}
                                </span>
                              )}

                              {perm.movements && perm.movements.length > 0 && (
                                <span className="text-[11px] text-zinc-400 font-medium bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/50">
                                  {perm.movements.length} gate scan
                                  {perm.movements.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    const mov = item.data;
                    const isExit = mov.type === "EXIT";
                    return (
                      <div
                        key={`fm-${mov.id}`}
                        onClick={() => setSelectedMovement(mov)}
                        className="flex items-center justify-between px-6 py-4.5 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div
                            className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center border ${
                              isExit
                                ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            }`}
                          >
                            {isExit ? (
                              <LogOut className="h-5 w-5" />
                            ) : (
                              <LogIn className="h-5 w-5" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="text-sm font-semibold text-zinc-100 truncate">
                                {mov.faculty?.profile?.name || "Unknown Faculty"}
                              </p>
                              {mov.faculty?.employeeId && (
                                <span className="font-mono text-xs text-zinc-400 font-bold px-1.5 py-0.5 rounded bg-zinc-800/70 border border-zinc-700/60">
                                  {mov.faculty.employeeId}
                                </span>
                              )}
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0">
                                Faculty
                              </span>
                              <span
                                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                                  isExit
                                    ? "bg-orange-500/20 text-orange-400"
                                    : "bg-emerald-500/20 text-emerald-400"
                                }`}
                              >
                                {mov.type} GATE SCAN
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                              {mov.faculty?.designation && (
                                <span className="text-zinc-400 font-medium">
                                  {mov.faculty.designation}
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-zinc-400">
                                <DoorOpen className="h-3 w-3 text-zinc-500" />
                                {mov.gate?.name || "Gate"}
                                {mov.gate?.location ? ` (${mov.gate.location})` : ""}
                              </span>
                              <span>•</span>
                              <span className="text-zinc-500">
                                {mov.createdAt ? formatDateTime(mov.createdAt) : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination Controls */}
        {displayTotal > pageSize && (
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 py-4 px-6 rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-none">
            <p className="text-xs text-zinc-400 font-medium">
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, displayTotal)} of {displayTotal}{" "}
              records
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-3 text-xs shadow-none border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-3 text-xs shadow-none border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Permission Detail Modal (Both Student & Faculty) */}
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
          <div className="space-y-4 pt-2 text-xs">
            {/* Applicant Profile Box */}
            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] text-zinc-500 uppercase font-semibold tracking-wider">
                  {selectedPermission.student ? "Student Applicant" : "Faculty Member"}
                </p>
                <p className="text-sm font-bold text-zinc-100 mt-0.5">
                  {selectedPermission.student?.profile?.name ||
                    selectedPermission.faculty?.profile?.name ||
                    "Applicant"}
                </p>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  {selectedPermission.student?.studentRoll ||
                    selectedPermission.faculty?.employeeId ||
                    selectedPermission.faculty?.designation ||
                    "—"}
                </p>
              </div>
              <div className="text-right space-y-1">
                <StatusBadge status={selectedPermission.status} />
                <p className="text-[11px] text-zinc-500">
                  {selectedPermission.type} PASS
                </p>
              </div>
            </div>

            {/* Purpose & Destination */}
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-500 font-medium block text-[11px] uppercase">
                  Purpose of Leave
                </span>
                <p className="text-sm text-zinc-200 font-medium mt-0.5">
                  {selectedPermission.purpose}
                </p>
              </div>

              {selectedPermission.destination && (
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                  <span className="text-zinc-500 font-medium block text-[11px] uppercase">
                    Destination
                  </span>
                  <p className="text-sm text-zinc-200 font-medium mt-0.5 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                    {selectedPermission.destination}
                  </p>
                </div>
              )}
            </div>

            {/* Date & Timing Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-500 font-medium block text-[11px]">
                  Pass Date / Requested
                </span>
                <p className="text-zinc-200 font-semibold mt-0.5">
                  {selectedPermission.exitDate
                    ? formatDate(selectedPermission.exitDate)
                    : selectedPermission.createdAt
                    ? formatDate(selectedPermission.createdAt)
                    : "—"}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <span className="text-zinc-500 font-medium block text-[11px]">
                  Expected Timing
                </span>
                <p className="text-zinc-200 font-semibold mt-0.5">
                  {selectedPermission.expectedExit
                    ? formatDateTime(selectedPermission.expectedExit).split(", ")[1]
                    : "Anytime"}
                  {selectedPermission.expectedReturn
                    ? ` → ${formatDateTime(selectedPermission.expectedReturn).split(", ")[1]}`
                    : ""}
                </p>
              </div>
            </div>

            {/* Contact / Remarks */}
            {(selectedPermission.contactNumber || selectedPermission.remarks) && (
              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                {selectedPermission.contactNumber && (
                  <p className="text-zinc-400 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-zinc-500" /> Contact:{" "}
                    <span className="text-zinc-200 font-mono">
                      {selectedPermission.contactNumber}
                    </span>
                  </p>
                )}
                {selectedPermission.remarks && (
                  <p className="text-zinc-400">
                    <span className="text-zinc-500">Remarks:</span>{" "}
                    {selectedPermission.remarks}
                  </p>
                )}
              </div>
            )}

            {/* Gate Scans */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/60">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Recorded Gate Scans
              </p>
              {selectedPermission.movements && selectedPermission.movements.length > 0 ? (
                <div className="grid gap-2">
                  {selectedPermission.movements.map((mov: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-zinc-950/60 rounded-lg border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {mov.type === "EXIT" ? (
                          <DoorOpen className="h-4 w-4 text-orange-400" />
                        ) : (
                          <DoorClosed className="h-4 w-4 text-emerald-400" />
                        )}
                        <div>
                          <p className="text-zinc-200 font-medium">
                            {mov.type === "EXIT" ? "Exited" : "Returned"} via{" "}
                            {mov.gate?.name || "Main Gate"}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {formatDateTime(mov.createdAt)}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={mov.type} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic p-2 rounded bg-zinc-950/40">
                  No gate scans registered for this pass yet.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Standalone Faculty Movement Detail Modal */}
      <Modal
        open={!!selectedMovement}
        onClose={() => setSelectedMovement(null)}
        title="Faculty Gate Scan Details"
      >
        {selectedMovement && (
          <div className="space-y-4 pt-2 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-zinc-500 mb-1">Faculty</p>
                <p className="text-sm font-semibold text-zinc-200">
                  {selectedMovement.faculty?.profile?.name}
                </p>
                {selectedMovement.faculty?.employeeId && (
                  <p className="text-xs font-mono text-zinc-400">
                    {selectedMovement.faculty.employeeId}
                  </p>
                )}
                {selectedMovement.faculty?.designation && (
                  <p className="text-xs text-zinc-400">
                    {selectedMovement.faculty.designation}
                  </p>
                )}
              </div>
              <div>
                <p className="text-zinc-500 mb-1">Movement Type</p>
                <span
                  className={`text-xs uppercase font-bold tracking-wider px-2.5 py-1 rounded-full ${
                    selectedMovement.type === "EXIT"
                      ? "bg-orange-500/20 text-orange-400"
                      : "bg-emerald-500/20 text-emerald-400"
                  }`}
                >
                  {selectedMovement.type}
                </span>
              </div>

              {selectedMovement.faculty?.department && (
                <div>
                  <p className="text-zinc-500 mb-1">Department</p>
                  <p className="text-sm text-zinc-200">
                    {selectedMovement.faculty.department}
                  </p>
                </div>
              )}

              <div>
                <p className="text-zinc-500 mb-1">Gate</p>
                <p className="text-sm text-zinc-200">
                  {selectedMovement.gate?.name || "Gate"}
                  {selectedMovement.gate?.location
                    ? ` (${selectedMovement.gate.location})`
                    : ""}
                </p>
              </div>

              <div className="col-span-2">
                <p className="text-zinc-500 mb-1">Timestamp</p>
                <p className="text-sm text-zinc-200 font-medium">
                  {selectedMovement.createdAt
                    ? formatDateTime(selectedMovement.createdAt)
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

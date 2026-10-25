"use client";
import { PassFullDetails } from "@/components/passes/pass-full-details";
import { DateField } from "@/components/ui/date-field";
import { callGate } from "@/lib/gate-call";
import { useGateData } from "@/lib/gate-cache";
import { LoadingPill } from "@/components/ui/loading-pill";
import { istDateString } from "@/lib/time/ist";
import { scheduledNote } from "@/lib/pass-dates";
import { oversightRoleMeta, type OversightRole } from "@/components/dashboard/oversight-role";

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
  GraduationCap,
  Briefcase,
  AlertCircle,
  MapPin,
  Phone,
  Search,
  History,
  Shield,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { BackButton } from "@/components/ui/back-button";
import { PagerBar } from "@/components/ui/pager-bar";

type Tab = "STUDENTS" | "FACULTY" | "ALL";
type SubTab = "ALL" | "PENDING" | "ENTRIES" | "EXITS";

interface ExecutiveActivityClientProps {
  role: OversightRole;
  user: any;
  /** Day from the address (?date=), else today */
  initialDate?: string;
}

const NO_ROWS: any[] = [];

export function ExecutiveActivityClient({ role, user, initialDate }: ExecutiveActivityClientProps) {
  const router = useRouter();
  // The page opens at once; the chosen day's activity loads here (cached per
  // day: a day seen before shows at once, refreshed quietly when older than 15 s)
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : istDateString()
  );
  const day = useGateData<any>(`campus-activity|${selectedDate}`, () => callGate("getCampusActivity", [selectedDate], 20_000), ["gate"]);
  const permissions: any[] = day.data?.permissions ?? NO_ROWS; // student permissions
  const facultyPermissions: any[] = day.data?.facultyPermissions ?? NO_ROWS;
  const facultyMovements: any[] = day.data?.facultyMovements ?? NO_ROWS; // standalone faculty movements
  const studentMovements: any[] = day.data?.studentMovements ?? NO_ROWS; // standalone student movements
  const navigating = day.loading || day.refreshing;
  const [selectedPermission, setSelectedPermission] = useState<any>(null);
  const [selectedMovement, setSelectedMovement] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("STUDENTS");
  const [subTab, setSubTab] = useState<SubTab>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

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

  const studentMovMatchesSearch = (m: any) => {
    if (!q) return true;
    return (
      m.student?.profile?.name?.toLowerCase().includes(q) ||
      m.student?.studentRoll?.toLowerCase().includes(q) ||
      m.student?.department?.toLowerCase().includes(q) ||
      m.gate?.name?.toLowerCase().includes(q)
    );
  };

  // Base search-filtered lists
  const searchStudents = useMemo(() => permissions.filter(studentMatchesSearch), [permissions, q]);
  const searchFacultyPerms = useMemo(() => facultyPermissions.filter(facultyPermMatchesSearch), [facultyPermissions, q]);
  const searchFacultyMovements = useMemo(() => facultyMovements.filter(facultyMovMatchesSearch), [facultyMovements, q]);
  const searchStudentMovements = useMemo(() => studentMovements.filter(studentMovMatchesSearch), [studentMovements, q]);

  // Sub-tab counts calculation
  const studentCounts = useMemo(() => ({
    all: searchStudents.length + searchStudentMovements.length,
    pending: searchStudents.filter((p) => p.status === "PENDING").length,
    entries:
      searchStudents.filter((p) => p.type === "ENTRY").length +
      searchStudentMovements.filter((m) => m.type === "ENTRY").length,
    exits:
      searchStudents.filter((p) => p.type === "EXIT").length +
      searchStudentMovements.filter((m) => m.type === "EXIT").length,
  }), [searchStudents, searchStudentMovements]);

  const facultyCounts = useMemo(() => ({
    all: searchFacultyPerms.length + searchFacultyMovements.length,
    pending: searchFacultyPerms.filter((p) => p.status === "PENDING").length,
    entries:
      searchFacultyPerms.filter((p) => p.type === "ENTRY").length +
      searchFacultyMovements.filter((m) => m.type === "ENTRY").length,
    exits:
      searchFacultyPerms.filter((p) => p.type === "EXIT").length +
      searchFacultyMovements.filter((m) => m.type === "EXIT").length,
  }), [searchFacultyPerms, searchFacultyMovements]);

  const combinedCounts = useMemo(() => ({
    all: studentCounts.all + facultyCounts.all,
    pending: studentCounts.pending + facultyCounts.pending,
    entries: studentCounts.entries + facultyCounts.entries,
    exits: studentCounts.exits + facultyCounts.exits,
  }), [studentCounts, facultyCounts]);

  const activeSubCounts =
    activeTab === "STUDENTS"
      ? studentCounts
      : activeTab === "FACULTY"
      ? facultyCounts
      : combinedCounts;

  // Filter students by subTab
  const filteredStudents = useMemo(() => searchStudents.filter((p) => {
    if (subTab === "PENDING") return p.status === "PENDING";
    if (subTab === "ENTRIES") return p.type === "ENTRY";
    if (subTab === "EXITS") return p.type === "EXIT";
    return true;
  }), [searchStudents, subTab]);

  const filteredStudentMovements = useMemo(() => searchStudentMovements.filter((m) => {
    if (subTab === "PENDING") return false;
    if (subTab === "ENTRIES") return m.type === "ENTRY";
    if (subTab === "EXITS") return m.type === "EXIT";
    return true;
  }), [searchStudentMovements, subTab]);

  // Filter faculty permissions by subTab
  const filteredFacultyPerms = useMemo(() => searchFacultyPerms.filter((p) => {
    if (subTab === "PENDING") return p.status === "PENDING";
    if (subTab === "ENTRIES") return p.type === "ENTRY";
    if (subTab === "EXITS") return p.type === "EXIT";
    return true;
  }), [searchFacultyPerms, subTab]);

  // Filter faculty movements by subTab
  const filteredFacultyMovements = useMemo(() => searchFacultyMovements.filter((m) => {
    if (subTab === "PENDING") return false;
    if (subTab === "ENTRIES") return m.type === "ENTRY";
    if (subTab === "EXITS") return m.type === "EXIT";
    return true;
  }), [searchFacultyMovements, subTab]);

  // Build combined items list
  type ActivityItem =
    | { kind: "student-permission"; data: any; sortKey: number }
    | { kind: "student-movement"; data: any; sortKey: number }
    | { kind: "faculty-permission"; data: any; sortKey: number }
    | { kind: "faculty-movement"; data: any; sortKey: number };

  const visibleItems: ActivityItem[] = useMemo(() => {
    const list: ActivityItem[] = [];

    if (activeTab === "ALL" || activeTab === "STUDENTS") {
      filteredStudents.forEach((p) =>
        list.push({
          kind: "student-permission",
          data: p,
          sortKey: p.createdAt ? new Date(p.createdAt).getTime() : 0,
        })
      );
      filteredStudentMovements.forEach((m) =>
        list.push({
          kind: "student-movement",
          data: m,
          sortKey: m.createdAt ? new Date(m.createdAt).getTime() : 0,
        })
      );
    }

    if (activeTab === "ALL" || activeTab === "FACULTY") {
      filteredFacultyPerms.forEach((p) =>
        list.push({
          kind: "faculty-permission",
          data: p,
          sortKey: p.createdAt ? new Date(p.createdAt).getTime() : 0,
        })
      );
      filteredFacultyMovements.forEach((m) =>
        list.push({
          kind: "faculty-movement",
          data: m,
          sortKey: m.createdAt ? new Date(m.createdAt).getTime() : 0,
        })
      );
    }

    list.sort((a, b) => b.sortKey - a.sortKey);
    return list;
  }, [
    activeTab,
    filteredStudents,
    filteredStudentMovements,
    filteredFacultyPerms,
    filteredFacultyMovements,
  ]);

  const displayTotal = visibleItems.length;
  const totalPages = Math.max(1, Math.ceil(displayTotal / pageSize));
  const paginatedItems = useMemo(() => {
    return visibleItems.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [visibleItems, currentPage, pageSize]);

  const { path: rolePath, title: roleTitle, accent: roleAccent } = oversightRoleMeta(role);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    setSelectedDate(e.target.value);
    setCurrentPage(1);
    // Kept in the address, so a reload shows the same day
    window.history.replaceState(null, "", `/${rolePath}/activity?date=${e.target.value}`);
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
      <LoadingPill active={navigating} />
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <BackButton href={`/${rolePath}`} label="Back to Dashboard" className="-ml-3" />
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                  {roleTitle}
                </span>
                <span className="inline-flex items-center rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
                  {displayTotal} Records
                </span>
              </div>
              <h1 className="mt-3 text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
                Campus Activity Log
              </h1>
              <p className="mt-1 text-sm text-zinc-500 max-w-2xl">
                Live gate entries, exits, and pass permissions across all campus departments.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
              {/* Search */}
              <div className="relative w-full sm:flex-1 lg:w-72 lg:flex-none">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name, roll, gate..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-10 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
                />
              </div>

              {/* Date Picker */}
              <div className="relative flex items-center w-full sm:w-auto">
                <Calendar className="absolute left-3.5 h-4 w-4 text-zinc-500 pointer-events-none z-10" />
                <DateField
                  aria-label="Activity date"
                  value={selectedDate}
                  max={istDateString()}
                  onChange={handleDateChange}
                  className="relative h-10 w-full sm:w-auto rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm font-medium text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:light] cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
 showIcon={false}
/>
              </div>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden">
          {/* Tabs */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-4 sm:p-5 border-b border-zinc-800">
            {/* Primary Tabs: Students / Faculty / All */}
            <div
              className="inline-flex w-fit max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
              role="tablist"
              aria-label="Who"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "STUDENTS"}
                onClick={() => handleTabChange("STUDENTS")}
                className={segmentClass(activeTab === "STUDENTS")}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                Students
                <span className="tabular-nums text-zinc-500">{studentCounts.all}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "FACULTY"}
                onClick={() => handleTabChange("FACULTY")}
                className={segmentClass(activeTab === "FACULTY")}
              >
                <Briefcase className="h-3.5 w-3.5" />
                Faculty
                <span className="tabular-nums text-zinc-500">{facultyCounts.all}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "ALL"}
                onClick={() => handleTabChange("ALL")}
                className={segmentClass(activeTab === "ALL")}
              >
                <History className="h-3.5 w-3.5" />
                All
                <span className="tabular-nums text-zinc-500">{combinedCounts.all}</span>
              </button>
            </div>

            {/* Sub-tabs: All Data / Pending / Entries / Exits */}
            <div
              className="inline-flex w-fit max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
              role="tablist"
              aria-label="Activity type"
            >
              <button
                type="button"
                role="tab"
                aria-selected={subTab === "ALL"}
                onClick={() => handleSubTabChange("ALL")}
                className={segmentClass(subTab === "ALL")}
              >
                All Data
                <span className="tabular-nums text-zinc-500">{activeSubCounts.all}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subTab === "PENDING"}
                onClick={() => handleSubTabChange("PENDING")}
                className={segmentClass(subTab === "PENDING")}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Pending
                <span
                  className={`tabular-nums ${
                    activeSubCounts.pending > 0
                      ? "rounded-full bg-amber-500/10 px-1.5 text-amber-400"
                      : "text-zinc-500"
                  }`}
                >
                  {activeSubCounts.pending}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subTab === "ENTRIES"}
                onClick={() => handleSubTabChange("ENTRIES")}
                className={segmentClass(subTab === "ENTRIES")}
              >
                <DoorClosed className="h-3.5 w-3.5" />
                Entries
                <span className="tabular-nums text-zinc-500">{activeSubCounts.entries}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subTab === "EXITS"}
                onClick={() => handleSubTabChange("EXITS")}
                className={segmentClass(subTab === "EXITS")}
              >
                <DoorOpen className="h-3.5 w-3.5" />
                Exits
                <span className="tabular-nums text-zinc-500">{activeSubCounts.exits}</span>
              </button>
            </div>
          </div>

          {/* Activity List */}
          {day.error ? (
            <div role="alert" className="flex flex-col items-center gap-3 py-14 px-4 text-center">
              <p className="text-sm font-medium text-red-400">{day.error}</p>
              <Button variant="outline" className="h-11" onClick={() => void day.reload()}>
                Try again
              </Button>
            </div>
          ) : day.loading ? (
            <p className="py-14 px-4 text-center text-sm text-zinc-500">Loading the day&apos;s activity…</p>
          ) : paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center text-center py-14 px-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
                <History className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-zinc-300">
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
                  return (
                    <PermissionRow
                      key={`s-${perm.id}`}
                      perm={perm}
                      name={perm.student?.profile?.name || "Student"}
                      idText={perm.student?.studentRoll}
                      kindLabel="Student"
                      dept={perm.student?.department}
                      onOpen={() => setSelectedPermission(perm)}
                    />
                  );
                } else if (item.kind === "faculty-permission") {
                  const perm = item.data;
                  const isHOD = perm.faculty?.profile?.role === "FACULTY_ADMIN";
                  return (
                    <PermissionRow
                      key={`fp-${perm.id}`}
                      perm={perm}
                      name={perm.faculty?.profile?.name || "Faculty Member"}
                      idText={perm.faculty?.employeeId}
                      kindLabel={isHOD ? "HOD" : "Faculty"}
                      kindAccent={isHOD}
                      dept={perm.faculty?.department}
                      onOpen={() => setSelectedPermission(perm)}
                    />
                  );
                } else if (item.kind === "faculty-movement") {
                  const mov = item.data;
                  return (
                    <MovementRow
                      key={`fm-${mov.id}`}
                      mov={mov}
                      name={mov.faculty?.profile?.name || "Faculty Member"}
                      idText={mov.faculty?.employeeId}
                      kindLabel="Faculty"
                      dept={mov.faculty?.department}
                      onOpen={() => setSelectedMovement(mov)}
                    />
                  );
                } else {
                  const mov = item.data;
                  return (
                    <MovementRow
                      key={`sm-${mov.id}`}
                      mov={mov}
                      name={mov.student?.profile?.name || "Student"}
                      idText={mov.student?.studentRoll}
                      kindLabel="Student"
                      dept={mov.student?.department}
                      onOpen={() => setSelectedMovement(mov)}
                    />
                  );
                }
              })}
            </ul>
          )}

        </Card>

        {/* Pagination (docked at the bottom of the screen) */}
        <PagerBar
          page={currentPage}
          pageSize={pageSize}
          total={displayTotal}
          onPageChange={(p) => setCurrentPage(Math.min(totalPages, Math.max(1, p)))}
          itemLabel="records"
        />
      </div>

      {/* Permission Detail Modal (Both Student & Faculty) */}
      {selectedPermission && (
        <Modal
          open={true}
          onClose={() => setSelectedPermission(null)}
          className="max-w-2xl"
          title={
            selectedPermission?.student
              ? "Student Permission Details"
              : selectedPermission?.faculty
              ? "Faculty Pass Details"
              : "Pass Details"
          }
        >
          {selectedPermission && <PassFullDetails permissionId={selectedPermission.id} preview={selectedPermission} />}
        </Modal>
      )}

      {/* Standalone Movement Detail Modal */}
      {selectedMovement && (
        <Modal
          open={true}
          onClose={() => setSelectedMovement(null)}
          title="Gate Movement Scan Record"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-zinc-950 p-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                  {selectedMovement.student ? "Student Scan" : "Faculty Scan"}
                </p>
                <p className="mt-0.5 text-base font-medium text-zinc-100 truncate">
                  {selectedMovement.student?.profile?.name ||
                    selectedMovement.faculty?.profile?.name ||
                    "Campus Member"}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 font-mono truncate">
                  {selectedMovement.student?.studentRoll ||
                    selectedMovement.faculty?.employeeId ||
                    "—"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                  selectedMovement.type === "EXIT"
                    ? "bg-sky-500/10 text-sky-400"
                    : "bg-emerald-500/10 text-emerald-400"
                }`}
              >
                {selectedMovement.type} SCAN
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailItem label="Campus Gate" icon={<DoorOpen className="h-3.5 w-3.5" />}>
                {selectedMovement.gate?.name || "Main Gate"}
                {selectedMovement.gate?.location ? ` (${selectedMovement.gate.location})` : ""}
              </DetailItem>
              <DetailItem label="Recorded Timestamp" icon={<Clock className="h-3.5 w-3.5" />}>
                {selectedMovement.createdAt ? formatDateTime(selectedMovement.createdAt) : "—"}
              </DetailItem>
              {selectedMovement.notes && (
                <DetailItem label="Guard Notes" className="sm:col-span-2">
                  {selectedMovement.notes}
                </DetailItem>
              )}
            </dl>

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setSelectedMovement(null)} className="w-full sm:w-auto">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function segmentClass(active: boolean) {
  return `inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
    active ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
  }`;
}

const chipBase = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";
const chipNeutral = `${chipBase} border border-zinc-800 bg-zinc-950 text-zinc-400`;

function PermissionRow({
  perm,
  name,
  idText,
  kindLabel,
  kindAccent = false,
  dept,
  onOpen,
}: {
  perm: any;
  name: string;
  idText?: string;
  kindLabel: string;
  kindAccent?: boolean;
  dept?: string;
  onOpen: () => void;
}) {
  const isPending = perm.status === "PENDING";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full flex items-start sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 text-left transition-colors hover:bg-zinc-950 ${
          isPending ? "bg-amber-500/[0.04]" : ""
        }`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 font-semibold">
          {name.charAt(0).toUpperCase()}
        </span>

        <span className="flex-1 min-w-0">
          <span className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap min-w-0">
            <span className="text-sm font-medium text-zinc-100 truncate max-w-full">{name}</span>
            {idText && <span className="font-mono text-xs text-zinc-500">{idText}</span>}
          </span>

          <span className="mt-0.5 block text-xs text-zinc-400 break-words">
            {perm.purpose}{" "}
            {perm.destination && <span className="text-zinc-500">→ {perm.destination}</span>}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={kindAccent ? `${chipBase} bg-orange-500/10 text-orange-400` : chipNeutral}>
              {kindLabel}
            </span>
            {dept && <span className={chipNeutral}>{getDepartmentCode(dept)}</span>}
            {perm.type === "ENTRY" ? (
              <span className={`${chipBase} bg-emerald-500/10 text-emerald-400`}>
                <DoorClosed className="h-3 w-3" /> Entry Pass
              </span>
            ) : (
              <span className={`${chipBase} bg-sky-500/10 text-sky-400`}>
                <DoorOpen className="h-3 w-3" /> Exit Pass
              </span>
            )}
            {isPending && (
              <span className={`${chipBase} bg-amber-500/10 text-amber-400`}>
                <AlertCircle className="h-3 w-3" />
                Pending Approval
              </span>
            )}
            {perm.movements && perm.movements.length > 0 && (
              <span className={chipNeutral}>
                {perm.movements.length} gate scan
                {perm.movements.length > 1 ? "s" : ""}
              </span>
            )}
          </span>

          {perm.createdAt && (
            <span className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="min-w-0">
                Requested: {formatDateTime(perm.createdAt)}
                {scheduledNote(perm)}
              </span>
            </span>
          )}
        </span>

        <span className="shrink-0">
          <StatusBadge status={perm.status} />
        </span>
      </button>
    </li>
  );
}

function MovementRow({
  mov,
  name,
  idText,
  kindLabel,
  dept,
  onOpen,
}: {
  mov: any;
  name: string;
  idText?: string;
  kindLabel: string;
  dept?: string;
  onOpen: () => void;
}) {
  const isExit = mov.type === "EXIT";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-start sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 text-left transition-colors hover:bg-zinc-950"
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            isExit ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {isExit ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
        </span>

        <span className="flex-1 min-w-0">
          <span className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap min-w-0">
            <span className="text-sm font-medium text-zinc-100 truncate max-w-full">{name}</span>
            {idText && <span className="font-mono text-xs text-zinc-500">{idText}</span>}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={chipNeutral}>{kindLabel}</span>
            <span
              className={`${chipBase} ${
                isExit ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {isExit ? "Exit" : "Entry"} gate scan
            </span>
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
            {dept && <span>Dept: {dept}</span>}
            <span className="flex items-center gap-1">
              <DoorOpen className="h-3 w-3" />
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

function DetailItem({
  label,
  icon,
  className = "",
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border border-zinc-800 p-3.5 ${className}`}>
      <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-zinc-200">
        {icon && <span className="mt-[3px] shrink-0 text-zinc-500">{icon}</span>}
        <span className="min-w-0 break-words">{children}</span>
      </dd>
    </div>
  );
}

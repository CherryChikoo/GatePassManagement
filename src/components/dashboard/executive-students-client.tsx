"use client";
import { ThemedSelect } from "@/components/ui/themed-select";
import { PassHistoryPanel } from "@/components/passes/pass-history-panel";
import { oversightRoleMeta, type OversightRole } from "@/components/dashboard/oversight-role";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal, Badge, EmptyState, StatCard } from "@/components/ui/primitives";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import type { getExecutiveStudents } from "@/server/actions/executive";
import { callGate } from "@/lib/gate-call";
import { useGateData } from "@/lib/gate-cache";
import { DEPARTMENTS, getDepartmentCode, getDepartmentFullName } from "@/lib/constants";
import {
  GraduationCap,
  Search,
  Building2,
  Mail,
  Phone,
  Home,
  CheckCircle2,
  Eye,
  X,
  ChevronRight,
} from "lucide-react";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";

interface Props {
  role: OversightRole;
  roleTitle: string;
}

export function ExecutiveStudentsClient({ role, roleTitle }: Props) {
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Typing waits briefly before searching, so each keystroke isn't a request
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // One page at a time from the server (search and filters run in the database),
  // through the gate cache: a page seen before shows at once (refetched quietly
  // when older than 15 s), and requests run side by side instead of queuing
  type DirectoryPage = Awaited<ReturnType<typeof getExecutiveStudents>>;
  const params = {
    page: currentPage,
    pageSize,
    q: debouncedSearch,
    department: selectedDept,
    year: selectedYear,
    studentType: selectedType,
  };
  const dir = useGateData<DirectoryPage>(
    `exec-students|${JSON.stringify(params)}`,
    () => callGate("getExecutiveStudents", [params], 15_000),
    []
  );
  // The last page shown stays on screen while the next one loads
  const [shown, setShown] = useState<DirectoryPage | null>(null);
  useEffect(() => {
    if (dir.data) setShown(dir.data);
  }, [dir.data]);
  const data = dir.data ?? shown;
  const loading = dir.loading || dir.refreshing;
  const loadError = data ? null : dir.error;

  const paginatedStudents: any[] = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const metrics = data?.metrics ?? { total: 0, active: 0, hostelers: 0, dayScholars: 0 };
  const departments: string[] =
    data && data.departments.length > 0 ? data.departments : DEPARTMENTS.map((d) => d.name);

  if (!data && !loadError) {
    return <DashboardSkeleton />;
  }

  const hasFilters = !!(search || selectedDept !== "ALL" || selectedYear !== "ALL" || selectedType !== "ALL");
  const selectClass =
    "h-10 w-full sm:w-auto min-w-0 rounded-full border border-zinc-800 bg-zinc-900 pl-4 pr-8 text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 cursor-pointer";

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            {roleTitle}
          </span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
            All Students Directory
          </h1>
          <p className="mt-1 text-sm text-zinc-500 max-w-2xl">
            Campus-wide registry of enrolled students across all academic departments, hostel blocks, and years.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-orange-500/10 px-3.5 py-1.5 text-xs font-medium text-orange-400">
          {metrics.total} Enrolled
        </span>
      </div>

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Enrolled" value={metrics.total} icon={<GraduationCap />} description="Across all departments" />
        <StatCard title="Active Students" value={metrics.active} icon={<CheckCircle2 />} description="Verified portal accounts" />
        <StatCard title="Hostel Residents" value={metrics.hostelers} icon={<Home />} description="Assigned to hostel blocks" />
        <StatCard title="Day Scholars" value={metrics.dayScholars} icon={<Building2 />} description="Local campus commuters" />
      </div>

      <Card className="overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-4 sm:p-5 border-b border-zinc-800">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search student name, roll number, email, phone..."
              className="h-10 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {/* Department Filter */}
            <ThemedSelect
              aria-label="Department"
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              className={`${selectClass} col-span-2 sm:max-w-[16rem]`}
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept: string) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </ThemedSelect>

            {/* Year Filter */}
            <ThemedSelect
              aria-label="Year"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setCurrentPage(1);
              }}
              className={selectClass}
            >
              <option value="ALL">All Years</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </ThemedSelect>

            {/* Student Type Filter */}
            <ThemedSelect
              aria-label="Student type"
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className={selectClass}
            >
              <option value="ALL">All Types</option>
              <option value="HOSTELLER">Hostelers</option>
              <option value="DAY_SCHOLAR">Day Scholars</option>
            </ThemedSelect>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSelectedDept("ALL");
                  setSelectedYear("ALL");
                  setSelectedType("ALL");
                  setCurrentPage(1);
                }}
                className="h-10 col-span-2 sm:col-span-1"
              >
                <X className="h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {loadError && (
          <div role="alert" className="mx-4 mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {loadError}
          </div>
        )}
        {/* Student List View (dimmed while the next page loads) */}
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {total === 0 ? (
          <EmptyState
            title="No Students Found"
            description={
              search || selectedDept !== "ALL" || selectedYear !== "ALL"
                ? "No student matches the specified filter criteria."
                : "No students are currently enrolled in the system."
            }
            icon={<GraduationCap className="h-6 w-6" />}
          />
        ) : (
          <>
            {/* Phones: stacked rows */}
            <ul className="md:hidden divide-y divide-zinc-800/70 px-4">
              {paginatedStudents.map((student: any) => (
                <li key={student.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedStudent(student)}
                    className="w-full flex items-center gap-3 py-3 text-left rounded-2xl px-2 -mx-2 hover:bg-zinc-950 transition-colors"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-sm font-semibold">
                      {initialsOf(student.profile?.name, "ST")}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-zinc-100 truncate">
                        {student.profile?.name || "Student"}
                      </span>
                      <span className="block text-xs text-zinc-500 truncate">
                        {student.studentRoll} · {getDepartmentCode(student.department || "GEN")}
                        {student.year ? ` · Year ${student.year}` : ""}
                        {" · "}
                        {student.studentType === "HOSTELLER" ? "Hosteler" : "Day Scholar"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={student.profile?.active !== false ? "success" : "danger"}>
                        {student.profile?.active !== false ? "Active" : "Inactive"}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-zinc-600" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Tablet & up: table */}
            <div className={`hidden md:block ${dt.wrap}`}>
              <table className={`${dt.table} min-w-[860px]`}>
                <thead>
                  <tr>
                    <th className={dt.th}>Student</th>
                    <th className={dt.th}>Department & Year</th>
                    <th className={dt.th}>Residence</th>
                    <th className={dt.th}>Advisor / Mentor</th>
                    <th className={dt.th}>Status</th>
                    <th className={dt.thRight}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((student: any) => (
                    <tr key={student.id} className={dt.trClickable} onClick={() => setSelectedStudent(student)}>
                      {/* Student Name, Roll Number & Email */}
                      <td className={`${dt.td} max-w-[18rem]`}>
                        <PersonCell
                          name={student.profile?.name || "Student"}
                          chip={student.studentRoll ? <span className={`${dt.chip} shrink-0`}>{student.studentRoll}</span> : undefined}
                          sub={
                            <span className="inline-flex max-w-full items-center gap-1">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{student.profile?.email || "No email"}</span>
                            </span>
                          }
                        />
                      </td>

                      {/* Department & Year */}
                      <td className={dt.td}>
                        <div className="space-y-1">
                          <span className={dt.chip}>{getDepartmentCode(student.department || "GEN")}</span>
                          <p className="text-xs text-zinc-500">
                            {student.department || "General"}
                            {student.year ? ` · Year ${student.year}` : ""}
                            {student.section ? ` (${student.section})` : ""}
                          </p>
                        </div>
                      </td>

                      {/* Residence / Hostel */}
                      <td className={dt.td}>
                        {student.studentType === "HOSTELLER" ? (
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                              <Home className="h-3.5 w-3.5 text-orange-400" /> Hosteler
                            </span>
                            <p className="text-xs text-zinc-500">
                              {student.hostelBlock || "Block N/A"}
                              {student.roomNumber ? ` · Room ${student.roomNumber}` : ""}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-zinc-500" /> Day Scholar
                          </span>
                        )}
                      </td>

                      {/* Faculty Mentor */}
                      <td className={dt.td}>
                        <p className="text-xs font-medium text-zinc-300">
                          {student.faculty?.profile?.name || "Unassigned"}
                        </p>
                        {student.warden?.profile?.name && (
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Warden: {student.warden.profile.name}
                          </p>
                        )}
                      </td>

                      {/* Account Status */}
                      <td className={dt.td}>
                        <Badge variant={student.profile?.active !== false ? "success" : "danger"}>
                          {student.profile?.active !== false ? "Active" : "Inactive"}
                        </Badge>
                      </td>

                      {/* Action: View Detail Modal */}
                      <td className={dt.tdActions}>
                        <RowActions>
                          <IconAction label="Details" icon={<Eye />} onClick={() => setSelectedStudent(student)} />
                        </RowActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        </div>
      </Card>

      {/* Pagination (docked at the bottom of the screen) */}
      <PagerBar
        page={currentPage}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => setCurrentPage(Math.min(totalPages, Math.max(1, p)))}
        itemLabel="students"
      />

      {/* Student Details Modal */}
      {selectedStudent && (
        <Modal
          open={true}
          onClose={() => setSelectedStudent(null)}
          title="Student Profile & Academic Details"
          className="max-w-2xl"
        >
          <div className="space-y-5">
            <p className="text-xs text-zinc-500">
              Full records for {selectedStudent.profile?.name || "Student"} ({selectedStudent.studentRoll})
            </p>
            {/* Header Identity Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-zinc-950 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-base font-semibold">
                  {initialsOf(selectedStudent.profile?.name, "ST")}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-medium text-zinc-100 truncate">
                    {selectedStudent.profile?.name}
                  </h3>
                  <p className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5 min-w-0">
                    <span className="font-mono shrink-0">{selectedStudent.studentRoll}</span>
                    <span>•</span>
                    <span className="truncate">{selectedStudent.department || "General"}</span>
                  </p>
                </div>
              </div>
              <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
                {selectedStudent.studentType === "HOSTELLER" ? "Hosteler" : "Day Scholar"}
              </span>
            </div>

            {/* Info Grid */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailItem label="Contact Email" icon={<Mail className="h-3.5 w-3.5" />}>
                {selectedStudent.profile?.email || "Not registered"}
              </DetailItem>
              <DetailItem label="Phone Number" icon={<Phone className="h-3.5 w-3.5" />}>
                {selectedStudent.profile?.phone || "Not registered"}
              </DetailItem>
              <DetailItem label="Academic Year & Cohort">
                {selectedStudent.year ? `Year ${selectedStudent.year}` : "Unspecified Year"}
                {selectedStudent.section ? ` · Section ${selectedStudent.section}` : ""}
              </DetailItem>
              <DetailItem label="Hostel Accommodation">
                {selectedStudent.studentType === "HOSTELLER"
                  ? `${selectedStudent.hostelBlock || "Block"} · Room ${selectedStudent.roomNumber || "N/A"}`
                  : "Day Scholar (Off-campus resident)"}
              </DetailItem>
              <DetailItem label="Faculty Mentor / Advisor">
                {selectedStudent.faculty?.profile?.name || "None assigned"}
              </DetailItem>
              <DetailItem label="Assigned Hostel Warden">
                {selectedStudent.warden?.profile?.name || "None assigned"}
              </DetailItem>
            </dl>

            <div className="border-t border-zinc-800 pt-5">
              <PassHistoryPanel person={{ kind: "student", id: selectedStudent.id }} />
            </div>

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setSelectedStudent(null)} className="w-full sm:w-auto">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function initialsOf(name: string | undefined | null, fallback: string) {
  return name
    ? name
        .split(" ")
        .map((n: string) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : fallback;
}

function DetailItem({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 p-3.5">
      <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-zinc-200">
        {icon && <span className="mt-[3px] shrink-0 text-zinc-500">{icon}</span>}
        <span className="min-w-0 break-words">{children}</span>
      </dd>
    </div>
  );
}

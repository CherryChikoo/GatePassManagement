"use client";
import { ThemedSelect } from "@/components/ui/themed-select";
import { PassHistoryPanel } from "@/components/passes/pass-history-panel";
import { oversightRoleMeta, type OversightRole } from "@/components/dashboard/oversight-role";

import React, { useState, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Modal, StatCard } from "@/components/ui/primitives";
import { DEPARTMENTS, getDepartmentCode, getDepartmentFullName } from "@/lib/constants";
import {
  Users,
  Search,
  Mail,
  Phone,
  Briefcase,
  Building2,
  CheckCircle2,
  Shield,
  Eye,
  Check,
  X,
  ChevronRight,
} from "lucide-react";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";

interface ExecutiveFacultyClientProps {
  role: OversightRole;
}

export function ExecutiveFacultyClient({ role }: ExecutiveFacultyClientProps) {
  const isReady = useStoreReady();
  const rawAllFaculty = useAppStore((s) => s.data.allFaculty);
  const allFaculty = rawAllFaculty || [];

  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedFaculty, setSelectedFaculty] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Extract unique departments
  const departments: string[] = useMemo(() => {
    const rawList = allFaculty
      .map((f: any) => f.faculty?.department)
      .filter(Boolean) as string[];
    const fromData = Array.from(new Set<string>(rawList));
    return fromData.length > 0 ? fromData.sort() : DEPARTMENTS.map((d) => d.name);
  }, [allFaculty]);

  // Filter faculty members
  const filteredFaculty = useMemo(() => {
    return allFaculty.filter((f: any) => {
      // Department filter
      if (selectedDept !== "ALL" && f.faculty?.department !== selectedDept) {
        return false;
      }

      // Role filter (HOD vs Regular Faculty)
      if (selectedRole === "HOD" && f.role !== "FACULTY_ADMIN") {
        return false;
      }
      if (selectedRole === "FACULTY" && f.role === "FACULTY_ADMIN") {
        return false;
      }

      // Status filter
      if (selectedStatus === "ACTIVE" && f.active === false) {
        return false;
      }
      if (selectedStatus === "DISABLED" && f.active !== false) {
        return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const name = f.name?.toLowerCase() || "";
        const email = f.email?.toLowerCase() || "";
        const phone = f.phone?.toLowerCase() || "";
        const dept = f.faculty?.department?.toLowerCase() || "";
        const desig = f.faculty?.designation?.toLowerCase() || "";
        const empId = f.faculty?.employeeId?.toLowerCase() || "";

        return (
          name.includes(q) ||
          email.includes(q) ||
          phone.includes(q) ||
          dept.includes(q) ||
          desig.includes(q) ||
          empId.includes(q)
        );
      }

      return true;
    });
  }, [allFaculty, selectedDept, selectedRole, selectedStatus, search]);

  const totalPages = Math.max(1, Math.ceil(filteredFaculty.length / pageSize));
  const paginatedFaculty = useMemo(() => {
    return filteredFaculty.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredFaculty, currentPage, pageSize]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = allFaculty.length;
    const active = allFaculty.filter((f: any) => f.active !== false).length;
    const hods = allFaculty.filter((f: any) => f.role === "FACULTY_ADMIN").length;
    const teachingFaculty = total - hods;
    return { total, active, hods, teachingFaculty };
  }, [allFaculty]);

  if (!isReady) {
    return <DashboardSkeleton />;
  }

  const { title: roleTitle, accent: roleAccentBg } = oversightRoleMeta(role);

  const hasFilters = !!(search || selectedDept !== "ALL" || selectedRole !== "ALL" || selectedStatus !== "ALL");
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
            All Faculty Directory
          </h1>
          <p className="mt-1 text-sm text-zinc-500 max-w-2xl">
            Campus-wide registry of academic teaching faculty and departmental leadership.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-orange-500/10 px-3.5 py-1.5 text-xs font-medium text-orange-400">
          {metrics.total} Total Faculty
        </span>
      </div>

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Staff" value={metrics.total} icon={<Users />} description="Across all departments" />
        <StatCard title="Active Accounts" value={metrics.active} icon={<CheckCircle2 />} description="Verified portal accounts" />
        <StatCard title="Department Heads" value={metrics.hods} icon={<Shield />} description="HOD administrators" />
        <StatCard title="Teaching Faculty" value={metrics.teachingFaculty} icon={<Briefcase />} description="Professors & Lecturers" />
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
              placeholder="Search faculty name, employee ID, department, email..."
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

            {/* Role Filter */}
            <ThemedSelect
              aria-label="Role"
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setCurrentPage(1);
              }}
              className={selectClass}
            >
              <option value="ALL">All Roles</option>
              <option value="HOD">Heads of Department (HODs)</option>
              <option value="FACULTY">Teaching Faculty</option>
            </ThemedSelect>

            {/* Status Filter */}
            <ThemedSelect
              aria-label="Account status"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className={selectClass}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Accounts</option>
              <option value="DISABLED">Disabled Accounts</option>
            </ThemedSelect>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSelectedDept("ALL");
                  setSelectedRole("ALL");
                  setSelectedStatus("ALL");
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

        {/* Faculty Data Table */}
        {filteredFaculty.length === 0 ? (
          <EmptyState
            title="No Faculty Members Found"
            description={
              search || selectedDept !== "ALL" || selectedRole !== "ALL"
                ? "No faculty member matches the specified filter criteria."
                : "No faculty members are currently registered in the system."
            }
            icon={<Users className="h-6 w-6" />}
          />
        ) : (
          <>
            {/* Phones: stacked rows */}
            <ul className="md:hidden divide-y divide-zinc-800/70 px-4">
              {paginatedFaculty.map((f: any) => {
                const isHOD = f.role === "FACULTY_ADMIN";
                const dept = f.faculty?.department || "General";
                const desig = f.faculty?.designation || (isHOD ? "Head of Department" : "Faculty Member");
                const empId = f.faculty?.employeeId || "N/A";
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedFaculty(f)}
                      className="w-full flex items-center gap-3 py-3 text-left rounded-2xl px-2 -mx-2 hover:bg-zinc-950 transition-colors"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-sm font-semibold">
                        {initialsOf(f.name, "FA")}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium text-zinc-100 truncate">{f.name}</span>
                          {isHOD && (
                            <span className="shrink-0 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-400">
                              HOD
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-zinc-500 truncate">
                          {empId} · {getDepartmentCode(dept)} · {desig}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Badge variant={f.active !== false ? "success" : "danger"}>
                          {f.active !== false ? "Active" : "Disabled"}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-zinc-600" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Tablet & up: table */}
            <div className={`hidden md:block ${dt.wrap}`}>
              <table className={`${dt.table} min-w-[860px]`}>
                <thead>
                  <tr>
                    <th className={dt.th}>Faculty Member</th>
                    <th className={dt.th}>Department</th>
                    <th className={dt.th}>Role & Designation</th>
                    <th className={dt.th}>Contact</th>
                    <th className={dt.th}>Status</th>
                    <th className={dt.thRight}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedFaculty.map((f: any) => {
                    const isHOD = f.role === "FACULTY_ADMIN";
                    const dept = f.faculty?.department || "General";
                    const desig =
                      f.faculty?.designation ||
                      (isHOD ? "Head of Department" : "Faculty Member");
                    const empId = f.faculty?.employeeId || "N/A";

                    return (
                      <tr key={f.id} className={dt.trClickable} onClick={() => setSelectedFaculty(f)}>
                        {/* Faculty Name, Employee ID & Email */}
                        <td className={`${dt.td} max-w-[18rem]`}>
                          <PersonCell
                            name={f.name || "Faculty Member"}
                            chip={<span className={`${dt.chip} shrink-0`}>{empId}</span>}
                            sub={
                              <span className="inline-flex max-w-full items-center gap-1">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{f.email || "No email"}</span>
                              </span>
                            }
                          />
                        </td>

                        {/* Department */}
                        <td className={dt.td}>
                          <div className="space-y-1">
                            <span className={dt.chip}>{getDepartmentCode(dept)}</span>
                            <p className="text-xs text-zinc-500">{dept}</p>
                          </div>
                        </td>

                        {/* Role & Designation */}
                        <td className={dt.td}>
                          <div className="space-y-1">
                            {isHOD ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-400">
                                <Shield className="h-3 w-3" /> Head of Department
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                                <Briefcase className="h-3 w-3" /> Faculty
                              </span>
                            )}
                            <p className="text-xs text-zinc-300">{desig}</p>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className={dt.td}>
                          {f.phone ? (
                            <span className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono tabular-nums">
                              <Phone className="h-3 w-3 text-zinc-500" />
                              {f.phone}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-600">No phone</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className={dt.td}>
                          <Badge variant={f.active !== false ? "success" : "danger"}>
                            {f.active !== false ? "Active" : "Disabled"}
                          </Badge>
                        </td>

                        {/* Action */}
                        <td className={dt.tdActions}>
                          <RowActions>
                            <IconAction label="View Record" icon={<Eye />} onClick={() => setSelectedFaculty(f)} />
                          </RowActions>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Pagination (docked at the bottom of the screen) */}
      <PagerBar
        page={currentPage}
        pageSize={pageSize}
        total={filteredFaculty.length}
        onPageChange={(p) => setCurrentPage(Math.min(totalPages, Math.max(1, p)))}
        itemLabel="faculty members"
      />

      {/* Faculty Details Modal */}
      {selectedFaculty && (
        <Modal
          open={true}
          onClose={() => setSelectedFaculty(null)}
          title="Faculty Profile & Academic Record"
          className="max-w-2xl"
        >
          <div className="space-y-5">
            <p className="text-xs text-zinc-500">
              Complete profile records for {selectedFaculty.name} ({selectedFaculty.faculty?.employeeId || "Staff"})
            </p>

            {/* Header Identity Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-zinc-950 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-base font-semibold">
                  {initialsOf(selectedFaculty.name, "FA")}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-medium text-zinc-100 truncate">{selectedFaculty.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {selectedFaculty.faculty?.designation ||
                      (selectedFaculty.role === "FACULTY_ADMIN"
                        ? "Head of Department"
                        : "Faculty Member")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                <Badge variant={selectedFaculty.active !== false ? "success" : "danger"}>
                  {selectedFaculty.active !== false ? "Active Account" : "Disabled Account"}
                </Badge>
                {selectedFaculty.role === "FACULTY_ADMIN" && (
                  <span className="text-[11px] font-medium text-orange-400">HOD Leadership</span>
                )}
              </div>
            </div>

            {/* Academic & Contact Information */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailItem label="Academic Department" icon={<Building2 className="h-3.5 w-3.5" />}>
                {selectedFaculty.faculty?.department || "General"}
                <span className="block text-xs text-zinc-500 mt-0.5">
                  Code: {getDepartmentCode(selectedFaculty.faculty?.department || "GEN")}
                </span>
              </DetailItem>
              <DetailItem label="Employee ID">
                <span className="font-mono">{selectedFaculty.faculty?.employeeId || "Not Assigned"}</span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  System ID: {selectedFaculty.faculty?.id?.slice(0, 8) || "—"}
                </span>
              </DetailItem>
              <DetailItem label="Email Address" icon={<Mail className="h-3.5 w-3.5" />}>
                {selectedFaculty.email}
              </DetailItem>
              <DetailItem label="Phone Number" icon={<Phone className="h-3.5 w-3.5" />}>
                <span className="font-mono">{selectedFaculty.phone || "Not recorded"}</span>
              </DetailItem>
            </dl>

            {/* Approval Limits & Authority */}
            <div className="rounded-2xl bg-zinc-950 p-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Authority & Portal Settings
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-sm">
                <span className="text-zinc-500">Account Role:</span>
                <span className="font-mono text-xs font-medium text-zinc-100">{selectedFaculty.role}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-sm">
                <span className="text-zinc-500">Daily Approval Quota:</span>
                <span className="font-medium text-zinc-100">
                  {selectedFaculty.faculty?.maxApprovals || 5} passes / day
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-sm">
                <span className="text-zinc-500">Pass Approval Rights:</span>
                <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  {selectedFaculty.role === "FACULTY_ADMIN"
                    ? "Full Department Approver (HOD)"
                    : "Student Mentor Approver"}
                </span>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-5">
              <PassHistoryPanel person={{ kind: "staff", profileId: selectedFaculty.id }} />
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setSelectedFaculty(null)} className="w-full sm:w-auto">
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

"use client";
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
  Shield,
  Search,
  Mail,
  Phone,
  Building2,
  CheckCircle2,
  Eye,
  Check,
  Award,
  X,
  ChevronRight,
} from "lucide-react";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";

interface ExecutiveHodsClientProps {
  role: OversightRole;
}

export function ExecutiveHodsClient({ role }: ExecutiveHodsClientProps) {
  const isReady = useStoreReady();
  const rawAllHODs = useAppStore((s) => s.data.allHODs);
  const rawAllFaculty = useAppStore((s) => s.data.allFaculty);

  // Fallback to filtering allFaculty if allHODs array is somehow empty
  const allHODs = useMemo(() => {
    if (rawAllHODs && rawAllHODs.length > 0) return rawAllHODs;
    if (rawAllFaculty && rawAllFaculty.length > 0) {
      return rawAllFaculty.filter((f: any) => f.role === "FACULTY_ADMIN");
    }
    return [];
  }, [rawAllHODs, rawAllFaculty]);

  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedHOD, setSelectedHOD] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Extract unique departments
  const departments: string[] = useMemo(() => {
    const rawList = allHODs
      .map((h: any) => h.faculty?.department)
      .filter(Boolean) as string[];
    const fromData = Array.from(new Set<string>(rawList));
    return fromData.length > 0 ? fromData.sort() : DEPARTMENTS.map((d) => d.name);
  }, [allHODs]);

  // Filter HODs
  const filteredHODs = useMemo(() => {
    return allHODs.filter((h: any) => {
      // Department filter
      if (selectedDept !== "ALL" && h.faculty?.department !== selectedDept) {
        return false;
      }

      // Status filter
      if (selectedStatus === "ACTIVE" && h.active === false) {
        return false;
      }
      if (selectedStatus === "DISABLED" && h.active !== false) {
        return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const name = h.name?.toLowerCase() || "";
        const email = h.email?.toLowerCase() || "";
        const phone = h.phone?.toLowerCase() || "";
        const dept = h.faculty?.department?.toLowerCase() || "";
        const empId = h.faculty?.employeeId?.toLowerCase() || "";

        return (
          name.includes(q) ||
          email.includes(q) ||
          phone.includes(q) ||
          dept.includes(q) ||
          empId.includes(q)
        );
      }

      return true;
    });
  }, [allHODs, selectedDept, selectedStatus, search]);

  const totalPages = Math.max(1, Math.ceil(filteredHODs.length / pageSize));
  const paginatedHODs = useMemo(() => {
    return filteredHODs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredHODs, currentPage, pageSize]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = allHODs.length;
    const active = allHODs.filter((h: any) => h.active !== false).length;
    const coveredDepts = new Set(allHODs.map((h: any) => h.faculty?.department).filter(Boolean)).size;
    return { total, active, coveredDepts };
  }, [allHODs]);

  if (!isReady) {
    return <DashboardSkeleton />;
  }

  const { title: roleTitle, accent: roleAccentBg } = oversightRoleMeta(role);

  const hasFilters = !!(search || selectedDept !== "ALL" || selectedStatus !== "ALL");
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
            Heads of Department (HOD) Directory
          </h1>
          <p className="mt-1 text-sm text-zinc-500 max-w-2xl">
            Departmental leadership across all academic divisions reporting to campus management.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-orange-500/10 px-3.5 py-1.5 text-xs font-medium text-orange-400">
          {metrics.total} Department Heads
        </span>
      </div>

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total HODs" value={metrics.total} icon={<Shield />} description="Appointed leaders" />
        <StatCard title="Active Leaders" value={metrics.active} icon={<CheckCircle2 />} description="Verified portal accounts" />
        <StatCard title="Divisions Covered" value={metrics.coveredDepts} icon={<Building2 />} description="Academic departments" />
        {/* Text-valued tile styled like StatCard (a long word would truncate in StatCard's large number style) */}
        <div className="relative min-w-0 rounded-3xl border border-zinc-800/80 bg-zinc-900 p-4 sm:p-5 md:p-6 shadow-card flex flex-col justify-between gap-4 sm:gap-6">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <p className="text-sm sm:text-[15px] text-zinc-300 leading-snug truncate">Authority Level</p>
            <div className="-mt-1 -mr-1 flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300">
              <Award className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-lg sm:text-2xl leading-tight font-light tracking-tight text-zinc-100">Department Admin</p>
            <p className="mt-2 text-xs text-zinc-500 truncate">Full student pass approval</p>
          </div>
        </div>
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
              placeholder="Search HOD name, employee ID, department, email..."
              className="h-10 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {/* Department Filter */}
            <select
              aria-label="Department"
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              className={`${selectClass} sm:max-w-[16rem]`}
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept: string) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
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
            </select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSelectedDept("ALL");
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

        {/* HOD Data Table */}
        {filteredHODs.length === 0 ? (
          <EmptyState
            title="No Heads of Department Found"
            description={
              search || selectedDept !== "ALL"
                ? "No department head matches the specified filter criteria."
                : "No department heads are currently registered in the system."
            }
            icon={<Shield className="h-6 w-6" />}
          />
        ) : (
          <>
            {/* Phones: stacked rows */}
            <ul className="md:hidden divide-y divide-zinc-800/70 px-4">
              {paginatedHODs.map((hod: any) => {
                const dept = hod.faculty?.department || "General";
                const empId = hod.faculty?.employeeId || "N/A";
                return (
                  <li key={hod.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedHOD(hod)}
                      className="w-full flex items-center gap-3 py-3 text-left rounded-2xl px-2 -mx-2 hover:bg-zinc-950 transition-colors"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-sm font-semibold">
                        {initialsOf(hod.name, "HO")}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-zinc-100 truncate">{hod.name}</span>
                        <span className="block text-xs text-zinc-500 truncate">
                          {empId} · {getDepartmentCode(dept)} · {dept}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Badge variant={hod.active !== false ? "success" : "danger"}>
                          {hod.active !== false ? "Active" : "Disabled"}
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
                    <th className={dt.th}>Head of Department</th>
                    <th className={dt.th}>Department</th>
                    <th className={dt.th}>Authority Role</th>
                    <th className={dt.th}>Contact</th>
                    <th className={dt.th}>Status</th>
                    <th className={dt.thRight}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHODs.map((hod: any) => {
                    const dept = hod.faculty?.department || "General";
                    const empId = hod.faculty?.employeeId || "N/A";

                    return (
                      <tr key={hod.id} className={dt.trClickable} onClick={() => setSelectedHOD(hod)}>
                        {/* HOD Name, Employee ID & Email */}
                        <td className={`${dt.td} max-w-[18rem]`}>
                          <PersonCell
                            name={hod.name || "Head of Department"}
                            chip={<span className={`${dt.chip} shrink-0`}>{empId}</span>}
                            sub={
                              <span className="inline-flex max-w-full items-center gap-1">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{hod.email || "No email"}</span>
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

                        {/* Authority Role */}
                        <td className={dt.td}>
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-400">
                              <Shield className="h-3 w-3" /> Head of Department
                            </span>
                            <p className="text-xs text-zinc-500">Academic Executive</p>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className={dt.td}>
                          {hod.phone ? (
                            <span className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono tabular-nums">
                              <Phone className="h-3 w-3 text-zinc-500" />
                              {hod.phone}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-600">No phone</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className={dt.td}>
                          <Badge variant={hod.active !== false ? "success" : "danger"}>
                            {hod.active !== false ? "Active" : "Disabled"}
                          </Badge>
                        </td>

                        {/* Action */}
                        <td className={dt.tdActions}>
                          <RowActions>
                            <IconAction label="View Record" icon={<Eye />} onClick={() => setSelectedHOD(hod)} />
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
        total={filteredHODs.length}
        onPageChange={(p) => setCurrentPage(Math.min(totalPages, Math.max(1, p)))}
        itemLabel="department heads"
      />

      {/* HOD Details Modal */}
      {selectedHOD && (
        <Modal
          open={true}
          onClose={() => setSelectedHOD(null)}
          title="Head of Department Profile"
          className="max-w-2xl"
        >
          <div className="space-y-5">
            <p className="text-xs text-zinc-500">
              Department leadership records for {selectedHOD.name} ({selectedHOD.faculty?.employeeId || "HOD"})
            </p>

            {/* Header Identity Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-zinc-950 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-base font-semibold">
                  {initialsOf(selectedHOD.name, "HO")}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-medium text-zinc-100 truncate">{selectedHOD.name}</h3>
                  <p className="text-xs text-orange-400 font-medium mt-0.5 flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" />
                    Head of Department
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                <Badge variant={selectedHOD.active !== false ? "success" : "danger"}>
                  {selectedHOD.active !== false ? "Active Account" : "Disabled Account"}
                </Badge>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {selectedHOD.faculty?.employeeId || "No ID"}
                </span>
              </div>
            </div>

            {/* Department Leadership & Contact Information */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailItem label="Academic Department" icon={<Building2 className="h-3.5 w-3.5" />}>
                {selectedHOD.faculty?.department || "General"}
                <span className="block text-xs text-zinc-500 mt-0.5">
                  Code: {getDepartmentCode(selectedHOD.faculty?.department || "GEN")}
                </span>
              </DetailItem>
              <DetailItem label="Designation / Role">
                Head of Department
                <span className="block text-xs text-zinc-500 mt-0.5">Profile Role: FACULTY_ADMIN</span>
              </DetailItem>
              <DetailItem label="Email Address" icon={<Mail className="h-3.5 w-3.5" />}>
                {selectedHOD.email}
              </DetailItem>
              <DetailItem label="Phone Number" icon={<Phone className="h-3.5 w-3.5" />}>
                <span className="font-mono">{selectedHOD.phone || "Not recorded"}</span>
              </DetailItem>
            </dl>

            {/* Responsibilities & Quota */}
            <div className="rounded-2xl bg-zinc-950 p-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Leadership Responsibilities
              </p>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-4 text-sm">
                <span className="text-zinc-500 shrink-0">Departmental Pass Approvals:</span>
                <span className="font-medium text-zinc-200 flex items-start gap-1.5 sm:text-right">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-[3px]" />
                  Authorized for all department student passes
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-4 text-sm">
                <span className="text-zinc-500 shrink-0">Faculty Coordination:</span>
                <span className="font-medium text-zinc-200 sm:text-right">
                  Oversees department faculty & student activity logs
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-4 text-sm">
                <span className="text-zinc-500 shrink-0">Reports To:</span>
                <span className="font-medium text-zinc-100 sm:text-right">Director & Academic Dean</span>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-5">
              <PassHistoryPanel person={{ kind: "staff", profileId: selectedHOD.id }} />
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setSelectedHOD(null)} className="w-full sm:w-auto">
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

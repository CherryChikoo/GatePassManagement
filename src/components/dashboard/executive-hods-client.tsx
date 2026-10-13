"use client";

import React, { useState, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Modal } from "@/components/ui/primitives";
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
} from "lucide-react";

interface ExecutiveHodsClientProps {
  role: "DIRECTOR" | "DEAN";
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

  const roleTitle = role === "DIRECTOR" ? "Director Oversight" : "Dean Oversight";
  const roleAccentBg =
    role === "DIRECTOR"
      ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
      : "bg-sky-500/15 text-sky-400 border-sky-500/30";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5 flex-wrap">
            <span>Heads of Department (HOD) Directory</span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${roleAccentBg}`}>
              {roleTitle}
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {metrics.total} Department Heads
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Departmental leadership across all academic divisions reporting to campus management.
          </p>
        </div>
      </div>

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Shield className="h-4 w-4 text-amber-400" />
            Total HODs
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{metrics.total}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Appointed leaders</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Active Leaders
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{metrics.active}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Verified portal accounts</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Building2 className="h-4 w-4 text-indigo-400" />
            Divisions Covered
          </div>
          <p className="text-2xl font-bold text-zinc-100 mt-2">{metrics.coveredDepts}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Academic departments</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Award className="h-4 w-4 text-purple-400" />
            Authority Level
          </div>
          <p className="text-lg font-bold text-zinc-100 mt-2">Department Admin</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Full student pass approval</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search HOD name, employee ID, department, email..."
            className="pl-9 h-9 text-xs bg-zinc-900 border-zinc-800 text-zinc-200"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
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
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Accounts</option>
            <option value="DISABLED">Disabled Accounts</option>
          </select>

          {(search || selectedDept !== "ALL" || selectedStatus !== "ALL") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedDept("ALL");
                setSelectedStatus("ALL");
                setCurrentPage(1);
              }}
              className="h-9 text-xs border-zinc-800 hover:bg-zinc-800 text-zinc-400"
            >
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
          icon={<Shield className="h-10 w-10 text-zinc-600" />}
        />
      ) : (
        <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-xs">
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Head of Department</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Employee ID</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Department</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Authority Role</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Contact</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Status</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {paginatedHODs.map((hod: any) => {
                    const dept = hod.faculty?.department || "General";
                    const empId = hod.faculty?.employeeId || "N/A";
                    const initials = hod.name
                      ? hod.name
                          .split(" ")
                          .map((n: string) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : "HO";

                    return (
                      <tr
                        key={hod.id}
                        className="hover:bg-zinc-800/30 transition-colors group"
                      >
                        {/* HOD Name & Email */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 bg-amber-500/10 text-amber-400 border-amber-500/30">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-zinc-100 truncate">
                                {hod.name}
                              </p>
                              <p className="text-xs text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                                <Mail className="h-3 w-3 text-zinc-500" />
                                {hod.email || "No email"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Employee ID */}
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60">
                            {empId}
                          </span>
                        </td>

                        {/* Department */}
                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              {getDepartmentCode(dept)}
                            </span>
                            <p className="text-xs text-zinc-400">
                              {dept}
                            </p>
                          </div>
                        </td>

                        {/* Authority Role */}
                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              <Shield className="h-3 w-3" /> Head of Department
                            </span>
                            <p className="text-xs text-zinc-400">
                              Academic Executive
                            </p>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-5 py-4">
                          <div className="space-y-0.5 text-xs text-zinc-300">
                            {hod.phone ? (
                              <span className="flex items-center gap-1 text-zinc-300 font-mono">
                                <Phone className="h-3 w-3 text-zinc-500" />
                                {hod.phone}
                              </span>
                            ) : (
                              <span className="text-zinc-500">No phone</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <Badge variant={hod.active !== false ? "success" : "danger"}>
                            {hod.active !== false ? "Active" : "Disabled"}
                          </Badge>
                        </td>

                        {/* Action */}
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedHOD(hod)}
                            className="h-8 text-xs border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View Record
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredHODs.length > pageSize && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-zinc-800/80 bg-zinc-950/20 text-xs text-zinc-400">
                <span>
                  Showing {(currentPage - 1) * pageSize + 1} to{" "}
                  {Math.min(currentPage * pageSize, filteredHODs.length)} of{" "}
                  {filteredHODs.length} department heads
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="h-8 text-xs border-zinc-800 bg-zinc-900 text-zinc-300 disabled:opacity-40"
                  >
                    Previous
                  </Button>
                  <span className="px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="h-8 text-xs border-zinc-800 bg-zinc-900 text-zinc-300 disabled:opacity-40"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* HOD Details Modal */}
      {selectedHOD && (
        <Modal
          open={true}
          onClose={() => setSelectedHOD(null)}
          title="Head of Department Profile"
        >
          <div className="space-y-5 pt-2">
            <p className="text-xs text-zinc-400">
              Department leadership records for {selectedHOD.name} ({selectedHOD.faculty?.employeeId || "HOD"})
            </p>

            {/* Header Identity Card */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl border flex items-center justify-center font-bold text-base bg-amber-500/10 text-amber-400 border-amber-500/30">
                  {selectedHOD.name
                    ? selectedHOD.name
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : "HO"}
                </div>
                <div>
                  <h3 className="font-bold text-zinc-100 text-base">{selectedHOD.name}</h3>
                  <p className="text-xs text-amber-400 font-medium mt-0.5 flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" />
                    Head of Department
                  </p>
                </div>
              </div>
              <div className="text-right space-y-1">
                <Badge variant={selectedHOD.active !== false ? "success" : "danger"}>
                  {selectedHOD.active !== false ? "Active Account" : "Disabled Account"}
                </Badge>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {selectedHOD.faculty?.employeeId || "No ID"}
                </p>
              </div>
            </div>

            {/* Department Leadership Information */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                  Academic Department
                </span>
                <p className="text-sm font-semibold text-zinc-100 mt-1 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-400" />
                  {selectedHOD.faculty?.department || "General"}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Code: {getDepartmentCode(selectedHOD.faculty?.department || "GEN")}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                  Designation / Role
                </span>
                <p className="text-sm font-bold text-zinc-100 mt-1">
                  Head of Department
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Profile Role: FACULTY_ADMIN
                </p>
              </div>
            </div>

            {/* Contact Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                  Email Address
                </span>
                <p className="text-xs font-semibold text-zinc-200 mt-1 flex items-center gap-1.5 truncate">
                  <Mail className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  {selectedHOD.email}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                  Phone Number
                </span>
                <p className="text-xs font-semibold text-zinc-200 mt-1 flex items-center gap-1.5 font-mono">
                  <Phone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  {selectedHOD.phone || "Not recorded"}
                </p>
              </div>
            </div>

            {/* Responsibilities & Quota */}
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2 text-xs">
              <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                Leadership Responsibilities
              </span>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Departmental Pass Approvals:</span>
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  Authorized for all department student passes
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Faculty Coordination:</span>
                <span className="font-semibold text-zinc-200">
                  Oversees department faculty & student activity logs
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Reports To:</span>
                <span className="font-semibold text-purple-400">
                  Director & Academic Dean
                </span>
              </div>
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedHOD(null)}
                className="text-xs border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

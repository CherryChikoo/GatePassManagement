"use client";
import { PassHistoryPanel } from "@/components/passes/pass-history-panel";
import { oversightRoleMeta, type OversightRole } from "@/components/dashboard/oversight-role";

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
  UserCheck,
} from "lucide-react";

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


  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5 flex-wrap">
            <span>All Faculty Directory</span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${roleAccentBg}`}>
              {roleTitle}
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {metrics.total} Total Faculty
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Campus-wide registry of academic teaching faculty and departmental leadership.
          </p>
        </div>
      </div>

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Users className="h-4 w-4 text-emerald-400" />
            Total Staff
          </div>
          <p className="text-2xl font-bold text-zinc-100 mt-2">{metrics.total}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Across all departments</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Active Accounts
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{metrics.active}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Verified portal accounts</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Shield className="h-4 w-4 text-amber-400" />
            Department Heads
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{metrics.hods}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">HOD administrators</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Briefcase className="h-4 w-4 text-indigo-400" />
            Teaching Faculty
          </div>
          <p className="text-2xl font-bold text-zinc-100 mt-2">{metrics.teachingFaculty}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Professors & Lecturers</p>
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
            placeholder="Search faculty name, employee ID, department, email..."
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

          {/* Role Filter */}
          <select
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="ALL">All Roles</option>
            <option value="HOD">Heads of Department (HODs)</option>
            <option value="FACULTY">Teaching Faculty</option>
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

          {(search || selectedDept !== "ALL" || selectedRole !== "ALL" || selectedStatus !== "ALL") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedDept("ALL");
                setSelectedRole("ALL");
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

      {/* Faculty Data Table */}
      {filteredFaculty.length === 0 ? (
        <EmptyState
          title="No Faculty Members Found"
          description={
            search || selectedDept !== "ALL" || selectedRole !== "ALL"
              ? "No faculty member matches the specified filter criteria."
              : "No faculty members are currently registered in the system."
          }
          icon={<Users className="h-10 w-10 text-zinc-600" />}
        />
      ) : (
        <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-xs">
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Faculty Member</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Employee ID</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Department</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Role & Designation</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Contact</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Status</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {paginatedFaculty.map((f: any) => {
                    const isHOD = f.role === "FACULTY_ADMIN";
                    const dept = f.faculty?.department || "General";
                    const desig =
                      f.faculty?.designation ||
                      (isHOD ? "Head of Department" : "Faculty Member");
                    const empId = f.faculty?.employeeId || "N/A";
                    const initials = f.name
                      ? f.name
                          .split(" ")
                          .map((n: string) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : "FA";

                    return (
                      <tr
                        key={f.id}
                        className="hover:bg-zinc-800/30 transition-colors group"
                      >
                        {/* Faculty Name & Email */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-9 w-9 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${
                                isHOD
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              }`}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-zinc-100 truncate">
                                {f.name}
                              </p>
                              <p className="text-xs text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                                <Mail className="h-3 w-3 text-zinc-500" />
                                {f.email || "No email"}
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

                        {/* Role & Designation */}
                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            {isHOD ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <Shield className="h-3 w-3" /> Head of Department
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                                <Briefcase className="h-3 w-3" /> Faculty
                              </span>
                            )}
                            <p className="text-xs text-zinc-300 font-medium">
                              {desig}
                            </p>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-5 py-4">
                          <div className="space-y-0.5 text-xs text-zinc-300">
                            {f.phone ? (
                              <span className="flex items-center gap-1 text-zinc-300 font-mono">
                                <Phone className="h-3 w-3 text-zinc-500" />
                                {f.phone}
                              </span>
                            ) : (
                              <span className="text-zinc-500">No phone</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <Badge variant={f.active !== false ? "success" : "danger"}>
                            {f.active !== false ? "Active" : "Disabled"}
                          </Badge>
                        </td>

                        {/* Action */}
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedFaculty(f)}
                            className="h-8 text-xs border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100"
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
            {filteredFaculty.length > pageSize && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-zinc-800/80 bg-zinc-950/20 text-xs text-zinc-400">
                <span>
                  Showing {(currentPage - 1) * pageSize + 1} to{" "}
                  {Math.min(currentPage * pageSize, filteredFaculty.length)} of{" "}
                  {filteredFaculty.length} faculty members
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

      {/* Faculty Details Modal */}
      {selectedFaculty && (
        <Modal
          open={true}
          onClose={() => setSelectedFaculty(null)}
          title="Faculty Profile & Academic Record"
          className="max-w-2xl"
        >
          <div className="space-y-5 pt-2">
            <p className="text-xs text-zinc-400">
              Complete profile records for {selectedFaculty.name} ({selectedFaculty.faculty?.employeeId || "Staff"})
            </p>

            {/* Header Identity Card */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`h-12 w-12 rounded-xl border flex items-center justify-center font-bold text-base ${
                    selectedFaculty.role === "FACULTY_ADMIN"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  }`}
                >
                  {selectedFaculty.name
                    ? selectedFaculty.name
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : "FA"}
                </div>
                <div>
                  <h3 className="font-bold text-zinc-100 text-base">{selectedFaculty.name}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {selectedFaculty.faculty?.designation ||
                      (selectedFaculty.role === "FACULTY_ADMIN"
                        ? "Head of Department"
                        : "Faculty Member")}
                  </p>
                </div>
              </div>
              <div className="text-right space-y-1">
                <Badge variant={selectedFaculty.active !== false ? "success" : "danger"}>
                  {selectedFaculty.active !== false ? "Active Account" : "Disabled Account"}
                </Badge>
                {selectedFaculty.role === "FACULTY_ADMIN" && (
                  <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                    HOD Leadership
                  </p>
                )}
              </div>
            </div>

            {/* Academic Information Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                  Academic Department
                </span>
                <p className="text-sm font-semibold text-zinc-100 mt-1 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-400" />
                  {selectedFaculty.faculty?.department || "General"}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Code: {getDepartmentCode(selectedFaculty.faculty?.department || "GEN")}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                  Employee ID
                </span>
                <p className="text-sm font-mono font-bold text-zinc-100 mt-1">
                  {selectedFaculty.faculty?.employeeId || "Not Assigned"}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  System ID: {selectedFaculty.faculty?.id?.slice(0, 8) || "—"}
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
                  {selectedFaculty.email}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                  Phone Number
                </span>
                <p className="text-xs font-semibold text-zinc-200 mt-1 flex items-center gap-1.5 font-mono">
                  <Phone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  {selectedFaculty.phone || "Not recorded"}
                </p>
              </div>
            </div>

            {/* Approval Limits & Authority */}
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2 text-xs">
              <span className="text-zinc-500 font-medium block text-[11px] uppercase tracking-wider">
                Authority & Portal Settings
              </span>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Account Role:</span>
                <span className="font-semibold text-zinc-100 font-mono">
                  {selectedFaculty.role}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Daily Approval Quota:</span>
                <span className="font-semibold text-emerald-400">
                  {selectedFaculty.faculty?.maxApprovals || 5} passes / day
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Pass Approval Rights:</span>
                <span className="font-semibold text-zinc-200 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  {selectedFaculty.role === "FACULTY_ADMIN"
                    ? "Full Department Approver (HOD)"
                    : "Student Mentor Approver"}
                </span>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <PassHistoryPanel person={{ kind: "staff", profileId: selectedFaculty.id }} />
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedFaculty(null)}
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

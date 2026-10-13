"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, Badge, EmptyState } from "@/components/ui/primitives";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { DEPARTMENTS, getDepartmentCode, getDepartmentFullName } from "@/lib/constants";
import {
  GraduationCap,
  Search,
  Building2,
  Mail,
  Phone,
  User,
  Shield,
  Home,
  CheckCircle2,
  XCircle,
  Filter,
  Eye,
  Calendar,
  Layers,
} from "lucide-react";

interface Props {
  role: "DIRECTOR" | "DEAN";
  roleTitle: string;
}

export function ExecutiveStudentsClient({ role, roleTitle }: Props) {
  const isReady = useStoreReady();
  const studentsData = useAppStore((s) => s.data.students);
  const students = studentsData || [];

  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Extract unique departments from student list or constants
  const departments: string[] = useMemo(() => {
    const rawList = students.map((s: any) => s.department).filter(Boolean) as string[];
    const fromData = Array.from(new Set<string>(rawList));
    return fromData.length > 0 ? fromData.sort() : DEPARTMENTS.map((d) => d.name);
  }, [students]);

  // Filter students
  const filteredStudents = useMemo(() => {
    return students.filter((student: any) => {
      // Department filter
      if (selectedDept !== "ALL" && student.department !== selectedDept) {
        return false;
      }

      // Year filter
      if (selectedYear !== "ALL" && String(student.year) !== selectedYear) {
        return false;
      }

      // Type filter (HOSTELER vs DAY_SCHOLAR)
      if (selectedType !== "ALL" && student.studentType !== selectedType) {
        return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const name = student.profile?.name?.toLowerCase() || "";
        const roll = student.studentRoll?.toLowerCase() || "";
        const email = student.profile?.email?.toLowerCase() || "";
        const phone = student.profile?.phone?.toLowerCase() || "";
        const dept = student.department?.toLowerCase() || "";
        return (
          name.includes(q) ||
          roll.includes(q) ||
          email.includes(q) ||
          phone.includes(q) ||
          dept.includes(q)
        );
      }

      return true;
    });
  }, [students, selectedDept, selectedYear, selectedType, search]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    return filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = students.length;
    const active = students.filter((s: any) => s.profile?.active !== false).length;
    const hostelers = students.filter((s: any) => s.studentType === "HOSTELER").length;
    const dayScholars = total - hostelers;
    return { total, active, hostelers, dayScholars };
  }, [students]);

  if (!isReady || !studentsData) {
    return <DashboardSkeleton />;
  }

  const roleAccentBg = role === "DIRECTOR" ? "bg-purple-500/15 text-purple-400 border-purple-500/30" : "bg-sky-500/15 text-sky-400 border-sky-500/30";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5 flex-wrap">
            <span>All Students Directory</span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${roleAccentBg}`}>
              {roleTitle}
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {metrics.total} Enrolled
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Campus-wide registry of enrolled students across all academic departments, hostel blocks, and years.
          </p>
        </div>
      </div>

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <GraduationCap className="h-4 w-4 text-purple-400" />
            Total Enrolled
          </div>
          <p className="text-2xl font-bold text-zinc-100 mt-2">{metrics.total}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Across all departments</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Active Students
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{metrics.active}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Verified portal accounts</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Home className="h-4 w-4 text-amber-400" />
            Hostel Residents
          </div>
          <p className="text-2xl font-bold text-zinc-100 mt-2">{metrics.hostelers}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Assigned to hostel blocks</p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Building2 className="h-4 w-4 text-sky-400" />
            Day Scholars
          </div>
          <p className="text-2xl font-bold text-zinc-100 mt-2">{metrics.dayScholars}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Local campus commuters</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search student name, roll number, email, phone..."
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

          {/* Year Filter */}
          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="ALL">All Years</option>
            <option value="1">1st Year</option>
            <option value="2">2nd Year</option>
            <option value="3">3rd Year</option>
            <option value="4">4th Year</option>
          </select>

          {/* Student Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="ALL">All Types</option>
            <option value="HOSTELER">Hostelers</option>
            <option value="DAY_SCHOLAR">Day Scholars</option>
          </select>

          {(search || selectedDept !== "ALL" || selectedYear !== "ALL" || selectedType !== "ALL") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedDept("ALL");
                setSelectedYear("ALL");
                setSelectedType("ALL");
                setCurrentPage(1);
              }}
              className="h-9 text-xs border-zinc-800 hover:bg-zinc-800 text-zinc-400"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Student List View */}
      {filteredStudents.length === 0 ? (
        <EmptyState
          title="No Students Found"
          description={
            search || selectedDept !== "ALL" || selectedYear !== "ALL"
              ? "No student matches the specified filter criteria."
              : "No students are currently enrolled in the system."
          }
          icon={<GraduationCap className="h-10 w-10 text-zinc-600" />}
        />
      ) : (
        <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-xs">
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Student</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Roll Number</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Department & Year</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Residence</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Advisor / Mentor</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Status</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {paginatedStudents.map((student: any) => {
                    const initials = student.profile?.name
                      ? student.profile.name
                          .split(" ")
                          .map((n: string) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : "ST";

                    return (
                      <tr
                        key={student.id}
                        className="hover:bg-zinc-800/30 transition-colors group"
                      >
                        {/* Student Name & Email */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-xs shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-zinc-100 truncate">
                                {student.profile?.name || "Student"}
                              </p>
                              <p className="text-xs text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                                <Mail className="h-3 w-3 text-zinc-500" />
                                {student.profile?.email || "No email"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Roll Number */}
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/60">
                            {student.studentRoll}
                          </span>
                        </td>

                        {/* Department & Year */}
                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              {getDepartmentCode(student.department || "GEN")}
                            </span>
                            <p className="text-xs text-zinc-400">
                              {student.department || "General"}
                              {student.year ? ` · Year ${student.year}` : ""}
                              {student.section ? ` (${student.section})` : ""}
                            </p>
                          </div>
                        </td>

                        {/* Residence / Hostel */}
                        <td className="px-5 py-4">
                          {student.studentType === "HOSTELER" ? (
                            <div className="space-y-0.5">
                              <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                                <Home className="h-3 w-3" /> Hosteler
                              </span>
                              <p className="text-xs text-zinc-400">
                                {student.hostelBlock || "Block N/A"}
                                {student.roomNumber ? ` · Room ${student.roomNumber}` : ""}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400 flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-zinc-500" /> Day Scholar
                            </span>
                          )}
                        </td>

                        {/* Faculty Mentor */}
                        <td className="px-5 py-4">
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
                        <td className="px-5 py-4">
                          {student.profile?.active !== false ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Active
                            </span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Action: View Detail Modal */}
                        <td className="px-5 py-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedStudent(student)}
                            className="h-8 text-xs px-2.5 border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-zinc-800 bg-zinc-950/40 text-xs text-zinc-400">
              <p>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, filteredStudents.length)} of {filteredStudents.length} students
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-7 text-xs px-2.5 border-zinc-800 bg-zinc-900 disabled:opacity-40"
                >
                  Previous
                </Button>
                <span className="text-zinc-500">
                  {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 text-xs px-2.5 border-zinc-800 bg-zinc-900 disabled:opacity-40"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student Details Modal */}
      {selectedStudent && (
        <Modal
          open={true}
          onClose={() => setSelectedStudent(null)}
          title="Student Profile & Academic Details"
        >
          <div className="space-y-5 pt-2">
            <p className="text-xs text-zinc-400">
              Full records for {selectedStudent.profile?.name || "Student"} ({selectedStudent.studentRoll})
            </p>
            {/* Header Identity Card */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-base">
                  {selectedStudent.profile?.name
                    ? selectedStudent.profile.name
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : "ST"}
                </div>
                <div>
                  <h3 className="font-bold text-zinc-100 text-base">
                    {selectedStudent.profile?.name}
                  </h3>
                  <p className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                    <span className="font-mono">{selectedStudent.studentRoll}</span>
                    <span>•</span>
                    <span>{selectedStudent.department || "General"}</span>
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                {selectedStudent.studentType === "HOSTELER" ? "Hosteler" : "Day Scholar"}
              </span>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <p className="text-zinc-500 font-medium">Contact Email</p>
                <p className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-zinc-400" />
                  {selectedStudent.profile?.email || "Not registered"}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <p className="text-zinc-500 font-medium">Phone Number</p>
                <p className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-zinc-400" />
                  {selectedStudent.profile?.phone || "Not registered"}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <p className="text-zinc-500 font-medium">Academic Year & Cohort</p>
                <p className="font-semibold text-zinc-200">
                  {selectedStudent.year ? `Year ${selectedStudent.year}` : "Unspecified Year"}
                  {selectedStudent.section ? ` · Section ${selectedStudent.section}` : ""}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <p className="text-zinc-500 font-medium">Hostel Accommodation</p>
                <p className="font-semibold text-zinc-200">
                  {selectedStudent.studentType === "HOSTELER"
                    ? `${selectedStudent.hostelBlock || "Block"} · Room ${selectedStudent.roomNumber || "N/A"}`
                    : "Day Scholar (Off-campus resident)"}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <p className="text-zinc-500 font-medium">Faculty Mentor / Advisor</p>
                <p className="font-semibold text-zinc-200">
                  {selectedStudent.faculty?.profile?.name || "None assigned"}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <p className="text-zinc-500 font-medium">Assigned Hostel Warden</p>
                <p className="font-semibold text-zinc-200">
                  {selectedStudent.warden?.profile?.name || "None assigned"}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedStudent(null)}
                className="border-zinc-800 hover:bg-zinc-800 text-zinc-300"
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

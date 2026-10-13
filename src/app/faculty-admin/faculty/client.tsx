"use client";

import React, { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, EmptyState } from "@/components/ui/primitives";
import Link from "next/link";
import {
  Users,
  Search,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Shield,
  ChevronDown,
  BadgeCheck,
  History,
} from "lucide-react";

interface Props {
  user?: { name: string; email: string; role: string; profileId: string };
}

export function FacultyAdminFacultyClient({ user }: Props) {
  const isReady = useStoreReady();
  const allUsers = useAppStore((s) => s.data.allUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFacultyId, setExpandedFacultyId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  if (!isReady || !allUsers) {
    return <DashboardSkeleton />;
  }

  // 1. Exclude HOD / Head of Department / FACULTY_ADMIN / current user
  const nonHodFaculty = allUsers.filter((f: any) => {
    if (f.role === "FACULTY_ADMIN") return false;
    if (user && (f.id === user.profileId || f.email === user.email)) return false;
    if (f.faculty?.designation?.toLowerCase()?.includes("head of department")) return false;
    if (f.name?.toLowerCase() === "hod") return false;
    return f.role === "FACULTY" || !!f.faculty;
  });

  // 2. Filter by search query
  const filteredFaculty = nonHodFaculty.filter((f: any) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      (f.name && f.name.toLowerCase().includes(q)) ||
      (f.email && f.email.toLowerCase().includes(q)) ||
      (f.phone && f.phone.toLowerCase().includes(q)) ||
      (f.faculty?.department && f.faculty.department.toLowerCase().includes(q)) ||
      (f.faculty?.designation && f.faculty.designation.toLowerCase().includes(q)) ||
      (f.faculty?.employeeId && f.faculty.employeeId.toLowerCase().includes(q))
    );
  });

  const total = filteredFaculty.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const paginatedFaculty = filteredFaculty.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <span>Faculty Directory</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {nonHodFaculty.length} Total
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Complete roster of academic faculty members and their departments.
          </p>
        </div>

        {/* Search bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, email, dept..."
            className="pl-9 bg-zinc-900/60 border-zinc-800 text-sm"
          />
        </div>
      </div>

      {/* Faculty Table Card */}
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/40">
                  <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Faculty</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Email</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Department</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {paginatedFaculty.map((f: any) => {
                  const isExpanded = expandedFacultyId === f.id;
                  const initials = f.name
                    ? f.name
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : "F";

                  return (
                    <React.Fragment key={f.id}>
                      <tr
                        onClick={() => setExpandedFacultyId(isExpanded ? null : f.id)}
                        className={`table-row-hover transition-colors cursor-pointer select-none ${
                          isExpanded ? "bg-zinc-850/60" : ""
                        }`}
                        title="Click row to view full details"
                      >
                        {/* Column 1: Faculty Name & Emp ID */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-semibold text-xs shrink-0">
                              {initials}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-zinc-100 hover:text-indigo-400 transition-colors">
                                  {f.name}
                                </p>
                                {f.faculty?.employeeId && (
                                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                                    {f.faculty.employeeId}
                                  </span>
                                )}
                              </div>
                              {f.phone && (
                                <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-zinc-500" />
                                  {f.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Email */}
                        <td className="px-5 py-3.5">
                          <p className="text-xs text-zinc-300 font-mono">{f.email}</p>
                        </td>

                        {/* Column 3: Department */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 text-zinc-300">
                            <Building2 className="h-3.5 w-3.5 text-zinc-500" />
                            <span className="text-xs font-medium">
                              {f.faculty?.department || "General Department"}
                            </span>
                          </div>
                        </td>

                        {/* Column 4: Status */}
                        <td className="px-5 py-3.5">
                          <Badge variant={f.active !== false ? "success" : "danger"}>
                            {f.active !== false ? "Active" : "Disabled"}
                          </Badge>
                        </td>

                        {/* Column 5: Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              href={`/faculty-admin/faculty/${f.id}`}
                              prefetch={true}
                              className="inline-flex items-center justify-center gap-1.5 border border-zinc-700/80 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 hover:text-white px-2.5 h-8 text-xs font-semibold rounded-lg transition-colors shadow-none"
                              title="View full gate pass and permissions history"
                            >
                              <History className="h-3.5 w-3.5 text-indigo-400" />
                              History
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedFacultyId(isExpanded ? null : f.id)}
                              className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 px-3 h-8 text-xs font-medium shadow-none"
                            >
                              {isExpanded ? "Hide Details" : "View Details"}
                            </Button>
                            <button
                              type="button"
                              onClick={() => setExpandedFacultyId(isExpanded ? null : f.id)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors ml-1"
                              title={isExpanded ? "Collapse details" : "Click to view full details"}
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform duration-200 ${
                                  isExpanded ? "rotate-180 text-orange-400" : ""
                                }`}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <tr className="bg-zinc-950/80 border-b border-zinc-800/80 animate-fade-in">
                          <td
                            colSpan={5}
                            className="p-5 bg-gradient-to-b from-zinc-900/70 to-zinc-950/95 border-l-2 border-l-indigo-500"
                          >
                            <div className="space-y-4">
                              {/* Top Info Bar */}
                              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                                    <Briefcase className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-bold text-zinc-100 text-base">{f.name}</h4>
                                      {f.faculty?.employeeId && (
                                        <span className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 font-mono text-xs font-bold text-indigo-400">
                                          {f.faculty.employeeId}
                                        </span>
                                      )}
                                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                        {f.faculty?.designation || "Faculty Member"}
                                      </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                      {f.email} {f.phone ? `• ${f.phone}` : ""}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`/faculty-admin/faculty/${f.id}`}
                                    prefetch={true}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-none transition-all"
                                  >
                                    <History className="h-3.5 w-3.5" />
                                    View Pass History
                                  </Link>
                                </div>
                              </div>

                              {/* 4 Detail Grid Cards */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {/* Card 1: Department & Academic Cohort */}
                                <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                    <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                                    Department
                                  </span>
                                  <p className="text-sm font-semibold text-zinc-200">
                                    {f.faculty?.department || "General Department"}
                                  </p>
                                  <p className="text-xs text-zinc-400">
                                    {f.faculty?.designation || "Teaching Staff"}
                                  </p>
                                </div>

                                {/* Card 2: Contact Information */}
                                <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                    <Mail className="h-3.5 w-3.5 text-blue-400" />
                                    Contact Information
                                  </span>
                                  <p className="text-xs text-zinc-200 truncate font-mono">
                                    {f.email}
                                  </p>
                                  <p className="text-xs text-zinc-400">
                                    {f.phone || "No phone registered"}
                                  </p>
                                </div>

                                {/* Card 3: Identification */}
                                <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-emerald-400" />
                                    Staff Credentials
                                  </span>
                                  <p className="text-xs text-zinc-300">
                                    <span className="text-zinc-500">Employee ID: </span>
                                    <span className="font-mono text-zinc-200">
                                      {f.faculty?.employeeId || "N/A"}
                                    </span>
                                  </p>
                                  <p className="text-xs text-zinc-300">
                                    <span className="text-zinc-500">Role: </span>
                                    <span className="font-medium text-indigo-300">Faculty</span>
                                  </p>
                                </div>

                                {/* Card 4: Account Status */}
                                <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                    <Shield className="h-3.5 w-3.5 text-orange-400" />
                                    Account Status
                                  </span>
                                  <div className="flex items-center gap-2 pt-0.5">
                                    <Badge variant={f.active !== false ? "success" : "danger"}>
                                      {f.active !== false ? "Active" : "Disabled"}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredFaculty.length === 0 && (
            <div className="py-12 text-center">
              <EmptyState
                icon={<Users className="h-8 w-8 text-zinc-500" />}
                title="No faculty members found"
                description={
                  searchTerm
                    ? "Try adjusting your search filter."
                    : "No faculty profiles registered for this department."
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination Bar (Matching Student Section) */}
      {total > 0 && (
        <div className="fixed bottom-0 left-0 lg:left-72 right-0 z-50 flex justify-between items-center py-3 px-4 lg:px-8 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">
          <p className="text-sm text-zinc-400 font-medium">
            Showing {(currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, total)} of {total} faculty members
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                className="h-8 px-3 shadow-none"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                className="h-8 px-3 shadow-none"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom spacer for fixed pagination bar */}
      {total > 0 && <div className="h-20" />}
    </div>
  );
}

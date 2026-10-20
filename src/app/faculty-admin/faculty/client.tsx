"use client";

import React, { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
// Student/faculty pages load their data on hover/touch (intent), not on click
import { IntentLink as Link } from "@/components/ui/intent-link";
import {
  Users,
  Search,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Shield,
  ChevronDown,
  History,
  Eye,
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
  const paginatedFaculty = filteredFaculty.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const getInitials = (f: any) =>
    f.name
      ? f.name
          .split(" ")
          .map((n: string) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "F";

  // Expanded details panel (shared by the phone cards and the table rows)
  const renderDetails = (f: any) => (
    <div className="space-y-4">
      {/* Top info bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
        <span className="self-start rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
          {f.faculty?.designation || "Faculty Member"}
        </span>
        <Link
          href={`/faculty-admin/faculty/${f.id}`}
          prefetch={true}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-orange-600 px-4 text-xs font-medium text-white hover:bg-orange-700 transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          View Pass History
        </Link>
      </div>

      {/* Detail tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5 min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <Building2 className="h-3.5 w-3.5" />
            Department
          </span>
          <p className="text-sm font-medium text-zinc-200 break-words">
            {f.faculty?.department || "General Department"}
          </p>
          <p className="text-xs text-zinc-500">{f.faculty?.designation || "Teaching Staff"}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5 min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <Mail className="h-3.5 w-3.5" />
            Contact Information
          </span>
          <p className="text-xs text-zinc-200 truncate font-mono">{f.email}</p>
          <p className="text-xs text-zinc-500">{f.phone || "No phone registered"}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5 min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <Users className="h-3.5 w-3.5" />
            Staff Credentials
          </span>
          <p className="text-xs text-zinc-300">
            <span className="text-zinc-500">Employee ID: </span>
            <span className="font-mono text-zinc-200">{f.faculty?.employeeId || "N/A"}</span>
          </p>
          <p className="text-xs text-zinc-300">
            <span className="text-zinc-500">Role: </span>
            <span className="font-medium text-zinc-200">Faculty</span>
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5 min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <Shield className="h-3.5 w-3.5" />
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
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 flex items-center gap-3 flex-wrap">
            <span>Faculty Directory</span>
            <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
              {nonHodFaculty.length} Total
            </span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Complete roster of academic faculty members and their departments.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 z-10" />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, email, dept..."
            className="h-10 rounded-full border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm placeholder:text-zinc-500 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
          />
        </div>
      </div>

      {/* Faculty list */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Phones: stacked rows */}
          <ul className={`sm:hidden ${dt.mobileList}`}>
            {paginatedFaculty.map((f: any) => {
              const isExpanded = expandedFacultyId === f.id;
              const toggle = () => setExpandedFacultyId(isExpanded ? null : f.id);
              return (
                <li key={f.id} className={isExpanded ? "bg-zinc-950/70" : ""}>
                  <div className="flex items-center gap-2 px-4 py-3.5">
                    <button
                      type="button"
                      onClick={toggle}
                      className="flex flex-1 min-w-0 items-center gap-3 text-left"
                      title="Tap to view full details"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-sm font-semibold">
                        {getInitials(f)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-zinc-100 truncate">{f.name}</span>
                          {f.faculty?.employeeId && (
                            <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                              {f.faculty.employeeId}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-zinc-500 truncate">{f.email}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 min-w-0">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{f.faculty?.department || "General Department"}</span>
                        </span>
                        {f.phone && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 tabular-nums">
                            <Phone className="h-3 w-3 shrink-0" />
                            {f.phone}
                          </span>
                        )}
                        <span className="mt-1.5 block">
                          <Badge variant={f.active !== false ? "success" : "danger"}>
                            {f.active !== false ? "Active" : "Disabled"}
                          </Badge>
                        </span>
                      </span>
                    </button>
                    <RowActions className="shrink-0 gap-0.5">
                      <IconAction label="History" icon={<History />} href={`/faculty-admin/faculty/${f.id}`} />
                      <IconAction
                        label={isExpanded ? "Hide Details" : "View Details"}
                        icon={<Eye />}
                        onClick={toggle}
                      />
                      <IconAction
                        label={isExpanded ? "Collapse details" : "Expand details"}
                        icon={
                          <ChevronDown className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        }
                        onClick={toggle}
                        active={isExpanded}
                      />
                    </RowActions>
                  </div>
                  {isExpanded && (
                    <div className="mb-3 rounded-b-2xl bg-zinc-950/70 px-4 pb-4 pt-1 animate-fade-in">{renderDetails(f)}</div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Tablet & up: table */}
          {paginatedFaculty.length > 0 && (
            <div className={`hidden sm:block ${dt.wrap}`}>
              <table className={dt.table}>
                <thead>
                  <tr>
                    <th className={dt.th}>Faculty</th>
                    <th className={dt.th}>Email</th>
                    <th className={dt.th}>Department</th>
                    <th className={dt.th}>Status</th>
                    <th className={dt.thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedFaculty.map((f: any) => {
                    const isExpanded = expandedFacultyId === f.id;
                    const toggle = () => setExpandedFacultyId(isExpanded ? null : f.id);

                    return (
                      <React.Fragment key={f.id}>
                        <tr
                          onClick={toggle}
                          className={`${dt.trClickable} select-none ${
                            isExpanded
                              ? "[&>td]:bg-zinc-950/70 [&>td]:border-b-0 [&>td:first-child]:rounded-bl-none [&>td:last-child]:rounded-br-none"
                              : ""
                          }`}
                          title="Click row to view full details"
                        >
                          {/* Faculty name & emp ID */}
                          <td className={dt.td}>
                            <PersonCell
                              name={f.name || "Faculty"}
                              chip={
                                f.faculty?.employeeId ? (
                                  <span className={dt.chip}>{f.faculty.employeeId}</span>
                                ) : undefined
                              }
                              sub={
                                f.phone ? (
                                  <span className="inline-flex items-center gap-1 tabular-nums">
                                    <Phone className="h-3 w-3" />
                                    {f.phone}
                                  </span>
                                ) : undefined
                              }
                            />
                          </td>

                          {/* Email */}
                          <td className={dt.tdMuted}>{f.email}</td>

                          {/* Department */}
                          <td className={dt.td}>
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                              <span className="text-xs">{f.faculty?.department || "General Department"}</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className={dt.td}>
                            <Badge variant={f.active !== false ? "success" : "danger"}>
                              {f.active !== false ? "Active" : "Disabled"}
                            </Badge>
                          </td>

                          {/* Actions */}
                          <td className={dt.tdActions}>
                            <RowActions>
                              <IconAction label="History" icon={<History />} href={`/faculty-admin/faculty/${f.id}`} />
                              <IconAction
                                label={isExpanded ? "Hide Details" : "View Details"}
                                icon={<Eye />}
                                onClick={toggle}
                              />
                              <IconAction
                                label={isExpanded ? "Collapse details" : "Expand details"}
                                icon={
                                  <ChevronDown
                                    className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                }
                                onClick={toggle}
                                active={isExpanded}
                              />
                            </RowActions>
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr className="animate-fade-in">
                            <td colSpan={5} className="px-0 pt-0 pb-3">
                              <div className="rounded-b-2xl bg-zinc-950/70 px-4 pb-5 pt-1 sm:px-5">
                                {renderDetails(f)}
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
          )}

          {filteredFaculty.length === 0 && (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No faculty members found"
              description={
                searchTerm
                  ? "Try adjusting your search filter."
                  : "No faculty profiles registered for this department."
              }
            />
          )}
        </CardContent>
      </Card>

      <PagerBar
        page={currentPage}
        pageSize={pageSize}
        total={total}
        onPageChange={setCurrentPage}
        itemLabel="faculty members"
      />
    </div>
  );
}

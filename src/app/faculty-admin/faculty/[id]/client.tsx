"use client";
import { ResetPasswordButton } from "@/components/users/reset-password-button";
import { istDateString } from "@/lib/time/ist";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PagerBar } from "@/components/ui/pager-bar";
import { Badge, StatusBadge, EmptyState, StatCard } from "@/components/ui/primitives";
import { BackButton } from "@/components/ui/back-button";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  History,
  Building2,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Clock,
  Search,
  CheckCircle2,
  XCircle,
  LogIn,
  LogOut,
} from "lucide-react";

interface Props {
  faculty: {
    id: string;
    profileId: string;
    name: string;
    email: string;
    phone?: string | null;
    department?: string | null;
    designation?: string | null;
    employeeId?: string | null;
    active: boolean;
  };
  permissions: Array<{
    id: string;
    type: "EXIT" | "ENTRY";
    status: string;
    purpose: string;
    destination?: string | null;
    exitDate?: string | null;
    expectedExit?: string | null;
    expectedReturn?: string | null;
    remarks?: string | null;
    contactNumber?: string | null;
    rejectionReason?: string | null;
    approvedAt?: string | null;
    rejectedAt?: string | null;
    createdAt?: string | null;
    movements: Array<{
      id: string;
      type: "EXIT" | "ENTRY";
      gateName: string;
      gateLocation?: string | null;
      securityName: string;
      createdAt?: string | null;
    }>;
    approverName?: string | null;
  }>;
  stats: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  };
}

export function FacultyPassHistoryClient({ faculty, permissions, stats }: Props) {
  const [activeTab, setActiveTab] = useState<"ALL" | "APPROVED" | "PENDING" | "REJECTED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [passDate, setPassDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredPermissions = permissions.filter((p) => {
    // Filter by tab status
    if (activeTab === "APPROVED") {
      if (!["APPROVED", "EXITED", "COMPLETED"].includes(p.status)) return false;
    } else if (activeTab === "PENDING") {
      if (p.status !== "PENDING") return false;
    } else if (activeTab === "REJECTED") {
      if (!["REJECTED", "CANCELLED", "EXPIRED"].includes(p.status)) return false;
    }

    // Filter by IST date (requested, scheduled, or a gate movement that day)
    if (passDate) {
      const days = [p.createdAt, p.exitDate, ...(p.movements ?? []).map((m: any) => m.createdAt)]
        .filter(Boolean)
        .map((d: string) => istDateString(new Date(d)));
      if (!days.includes(passDate)) return false;
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchPurpose = p.purpose?.toLowerCase().includes(q);
      const matchDest = p.destination?.toLowerCase().includes(q);
      const matchType = p.type?.toLowerCase().includes(q);
      return matchPurpose || matchDest || matchType;
    }

    return true;
  });

  const paginatedPermissions = filteredPermissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const initials = faculty.name
    ? faculty.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "F";

  const completedCount = permissions.filter(
    (p) => p.status === "COMPLETED" || p.status === "EXITED"
  ).length;

  return (
    <div className="mx-auto max-w-6xl w-full space-y-6">
      {/* Top navigation */}
      <div>
        <BackButton href="/faculty-admin/faculty" label="Back to Faculty Directory" />
      </div>

      {/* Faculty profile summary */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <div className="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-lg sm:text-xl font-semibold text-orange-400">
                {initials}
              </div>
              <div className="min-w-0 space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 break-words">
                  {faculty.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  {faculty.employeeId && (
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-500">
                      {faculty.employeeId}
                    </span>
                  )}
                  <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-medium text-orange-400">
                    {faculty.designation || "Faculty Member"}
                  </span>
                  <Badge variant={faculty.active ? "success" : "danger"}>
                    {faculty.active ? "Active" : "Disabled"}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {faculty.department || "General Department"}
                  </span>
                  <span className="flex items-center gap-1.5 min-w-0 break-all">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {faculty.email}
                  </span>
                  {faculty.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {faculty.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end md:self-center shrink-0">
              <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-400">
                Department Faculty
              </span>
              <ResetPasswordButton profileId={faculty.profileId} name={faculty.name} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Passes Taken" value={stats.total} icon={<History />} description="All requested permissions" />
        <StatCard title="Approved Passes" value={stats.approved} icon={<CheckCircle2 />} description="Authorized by HOD/Admin" />
        <StatCard title="Exited / Completed" value={completedCount} icon={<LogOut />} description="Recorded campus gate logs" />
        <StatCard title="Rejected Passes" value={stats.rejected} icon={<XCircle />} description="Denied requests" />
      </div>

      {/* Filter tabs, date & search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div
          className="flex sm:inline-flex max-w-full self-start rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="Filter passes"
        >
          {(
            [
              { id: "ALL", label: "All Passes", count: stats.total },
              { id: "APPROVED", label: "Approved", count: stats.approved },
              { id: "PENDING", label: "Pending", count: stats.pending },
              { id: "REJECTED", label: "Rejected", count: stats.rejected },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setCurrentPage(1);
              }}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                activeTab === tab.id ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] font-semibold text-zinc-500">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Calendar className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="date"
                aria-label="Filter by date"
                value={passDate}
                max={istDateString()}
                onChange={(e) => {
                  setPassDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 w-full sm:w-auto rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-200 outline-none hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:light] transition-colors"
              />
            </div>
            {passDate && (
              <button
                type="button"
                onClick={() => {
                  setPassDate("");
                  setCurrentPage(1);
                }}
                className="h-10 shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-3.5 text-xs font-medium text-zinc-400 hover:bg-zinc-950 hover:text-zinc-200 transition-colors"
              >
                All dates
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 z-10" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by purpose or destination..."
              className="h-10 rounded-full border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm placeholder:text-zinc-500 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
          </div>
        </div>
      </div>

      {/* Passes list */}
      {filteredPermissions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title={`No ${activeTab !== "ALL" ? activeTab.toLowerCase() : ""} passes found`}
            description={
              searchQuery
                ? "No pass records matched your search query."
                : `This faculty member has not taken any ${
                    activeTab !== "ALL" ? activeTab.toLowerCase() : ""
                  } gate passes.`
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {paginatedPermissions.map((pass) => (
            <Card key={pass.id} className="hover:border-zinc-700">
              <CardContent className="p-4 sm:p-5">
                <div className="space-y-4">
                  {/* Top row: type, purpose, status, applied at */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3 pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                          pass.type === "EXIT"
                            ? "bg-sky-500/10 text-sky-400"
                            : "bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        {pass.type} PASS
                      </span>
                      <h3 className="text-base font-medium text-zinc-100 break-words">{pass.purpose}</h3>
                      <StatusBadge status={pass.status} />
                    </div>

                    {pass.createdAt && (
                      <span className="text-xs text-zinc-500 shrink-0">
                        Applied on {formatDateTime(pass.createdAt)}
                      </span>
                    )}
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    <div className="rounded-2xl bg-zinc-950 p-3 space-y-1 min-w-0">
                      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                        <MapPin className="h-3.5 w-3.5" /> Destination
                      </span>
                      <p className="text-sm font-medium text-zinc-200 break-words">
                        {pass.destination || "Not specified"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-zinc-950 p-3 space-y-1 min-w-0">
                      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                        <Calendar className="h-3.5 w-3.5" /> Pass Date
                      </span>
                      <p className="text-sm font-medium text-zinc-200">
                        {pass.exitDate ? formatDate(pass.exitDate) : "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-zinc-950 p-3 space-y-1 min-w-0">
                      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                        <Clock className="h-3.5 w-3.5" /> Expected Times
                      </span>
                      <p className="text-sm font-medium text-zinc-200">
                        {pass.expectedExit
                          ? formatDateTime(pass.expectedExit).split(", ")[1]
                          : "Anytime"}
                        {pass.expectedReturn
                          ? ` → ${formatDateTime(pass.expectedReturn).split(", ")[1]}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {/* Remarks / contact */}
                  {(pass.remarks || pass.contactNumber) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                      {pass.contactNumber && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-zinc-500" /> Contact: {pass.contactNumber}
                        </span>
                      )}
                      {pass.remarks && (
                        <span className="break-words">
                          <span className="text-zinc-500">Remarks:</span> {pass.remarks}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Rejection */}
                  {pass.rejectionReason && (
                    <div className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                      <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                      <div className="min-w-0 break-words">
                        <span className="font-medium text-red-400">Rejection Reason: </span>
                        {pass.rejectionReason}
                        {pass.rejectedAt && (
                          <span className="mt-0.5 block text-[11px] text-red-400/80">
                            Rejected on {formatDateTime(pass.rejectedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Approval */}
                  {pass.approvedAt && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Approved on {formatDateTime(pass.approvedAt)}
                        {pass.approverName ? ` by ${pass.approverName}` : ""}
                      </span>
                    </div>
                  )}

                  {/* Gate movement logs */}
                  {pass.movements && pass.movements.length > 0 && (
                    <div className="pt-4 border-t border-zinc-800">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Gate Movement History
                      </p>
                      <div className="grid gap-2">
                        {pass.movements.map((m) => (
                          <div
                            key={m.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 rounded-2xl border border-zinc-800 p-3 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                                  m.type === "EXIT" ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400"
                                }`}
                              >
                                {m.type === "EXIT" ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
                              </span>
                              <span className="font-medium text-zinc-200 break-words">
                                {m.type} registered at {m.gateName}
                                {m.gateLocation && (
                                  <span className="font-normal text-zinc-500"> ({m.gateLocation})</span>
                                )}
                              </span>
                            </div>
                            <div className="pl-9 sm:pl-0 sm:text-right text-zinc-500 shrink-0">
                              <span>{m.createdAt ? formatDateTime(m.createdAt) : "—"}</span>
                              <span className="ml-2">by {m.securityName}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination (docks at the bottom of the screen) */}
      <PagerBar
        page={currentPage}
        pageSize={pageSize}
        total={filteredPermissions.length}
        onPageChange={setCurrentPage}
        itemLabel="passes"
      />
    </div>
  );
}

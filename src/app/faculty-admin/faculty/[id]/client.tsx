"use client";
import { ResetPasswordButton } from "@/components/users/reset-password-button";
import { istDateString } from "@/lib/time/ist";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, StatusBadge, EmptyState } from "@/components/ui/primitives";
import { BackButton } from "@/components/ui/back-button";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  History,
  Briefcase,
  Building2,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Clock,
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  LogIn,
  LogOut,
  FileText,
  User,
  Sparkles,
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

  const totalPages = Math.max(1, Math.ceil(filteredPermissions.length / pageSize));
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
    <div className="min-h-[calc(100vh-12rem)] flex flex-col justify-between max-w-6xl mx-auto w-full">
      <div className="space-y-6 flex-1">
        {/* Top Navigation */}
        <div>
          <BackButton href="/faculty-admin/faculty" label="Back to Faculty Directory" />
        </div>

      {/* Faculty Profile Summary Card */}
      <Card className="border border-zinc-800 bg-zinc-900/70 shadow-none overflow-hidden rounded-2xl">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-xl shrink-0">
                {initials}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl md:text-2xl font-bold text-zinc-100 tracking-tight">
                    {faculty.name}
                  </h1>
                  {faculty.employeeId && (
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                      {faculty.employeeId}
                    </span>
                  )}
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    {faculty.designation || "Faculty Member"}
                  </span>
                  <Badge variant={faculty.active ? "success" : "danger"}>
                    {faculty.active ? "Active" : "Disabled"}
                  </Badge>
                  <ResetPasswordButton profileId={faculty.profileId} name={faculty.name} className="h-7" />
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-zinc-500" />
                    {faculty.department || "General Department"}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono">
                    <Mail className="h-3.5 w-3.5 text-zinc-500" />
                    {faculty.email}
                  </span>
                  {faculty.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-zinc-500" />
                      {faculty.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start md:self-center">
              <span className="text-xs font-medium px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                Department Faculty
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-1">
          <p className="text-xs text-zinc-400 font-medium">Total Passes Taken</p>
          <p className="text-2xl font-bold text-zinc-100">{stats.total}</p>
          <p className="text-[11px] text-zinc-500">All requested permissions</p>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
          <p className="text-xs text-emerald-400 font-medium">Approved Passes</p>
          <p className="text-2xl font-bold text-emerald-300">{stats.approved}</p>
          <p className="text-[11px] text-zinc-500">Authorized by HOD/Admin</p>
        </div>

        <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-1">
          <p className="text-xs text-blue-400 font-medium">Exited / Completed</p>
          <p className="text-2xl font-bold text-blue-300">{completedCount}</p>
          <p className="text-[11px] text-zinc-500">Recorded campus gate logs</p>
        </div>

        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-1">
          <p className="text-xs text-red-400 font-medium">Rejected Passes</p>
          <p className="text-2xl font-bold text-red-300">{stats.rejected}</p>
          <p className="text-[11px] text-zinc-500">Denied requests</p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="flex bg-zinc-900/60 p-1.5 rounded-xl w-full max-w-md border border-zinc-800">
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
              onClick={() => {
                setActiveTab(tab.id);
                setCurrentPage(1);
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab.id
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.id ? "bg-zinc-700 text-zinc-200" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Filter by date"
            value={passDate}
            max={istDateString()}
            onChange={(e) => {
              setPassDate(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-200 [color-scheme:dark]"
          />
          {passDate && (
            <button
              type="button"
              onClick={() => {
                setPassDate("");
                setCurrentPage(1);
              }}
              className="h-9 px-2.5 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200"
            >
              All dates
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by purpose or destination..."
            className="pl-9 h-9 bg-zinc-900 border-zinc-800 text-xs"
          />
        </div>
      </div>

      {/* Passes List */}
      {filteredPermissions.length === 0 ? (
        <Card className="border border-zinc-800/80 bg-zinc-900/40 rounded-2xl p-12 text-center">
          <EmptyState
            icon={<History className="h-10 w-10 text-zinc-500" />}
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
        <div className="grid gap-4">
          {paginatedPermissions.map((pass) => (
            <Card
              key={pass.id}
              className="border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 transition-all rounded-2xl overflow-hidden shadow-none"
            >
              <CardContent className="p-5">
                <div className="space-y-4">
                  {/* Top Row: Type, Purpose, Status, Applied At */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                          pass.type === "EXIT"
                            ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                            : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        }`}
                      >
                        {pass.type} PASS
                      </span>
                      <h3 className="font-semibold text-zinc-100 text-base">
                        {pass.purpose}
                      </h3>
                      <StatusBadge status={pass.status} />
                    </div>

                    {pass.createdAt && (
                      <span className="text-xs text-zinc-400">
                        Applied on {formatDateTime(pass.createdAt)}
                      </span>
                    )}
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60 space-y-1">
                      <span className="text-zinc-500 font-medium flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-zinc-400" /> Destination
                      </span>
                      <p className="text-sm font-semibold text-zinc-200">
                        {pass.destination || "Not specified"}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60 space-y-1">
                      <span className="text-zinc-500 font-medium flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-zinc-400" /> Pass Date
                      </span>
                      <p className="text-sm font-semibold text-zinc-200">
                        {pass.exitDate ? formatDate(pass.exitDate) : "—"}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60 space-y-1">
                      <span className="text-zinc-500 font-medium flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-zinc-400" /> Expected Times
                      </span>
                      <p className="text-sm font-semibold text-zinc-200">
                        {pass.expectedExit
                          ? formatDateTime(pass.expectedExit).split(", ")[1]
                          : "Anytime"}
                        {pass.expectedReturn
                          ? ` → ${formatDateTime(pass.expectedReturn).split(", ")[1]}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {/* Remarks / Contact */}
                  {(pass.remarks || pass.contactNumber) && (
                    <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 px-1">
                      {pass.contactNumber && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-zinc-500" /> Contact: {pass.contactNumber}
                        </span>
                      )}
                      {pass.remarks && (
                        <span>
                          <span className="text-zinc-500">Remarks:</span> {pass.remarks}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Rejection Alert Box */}
                  {pass.rejectionReason && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-red-200">Rejection Reason: </span>
                        {pass.rejectionReason}
                        {pass.rejectedAt && (
                          <span className="block text-[11px] text-red-400/80 mt-0.5">
                            Rejected on {formatDateTime(pass.rejectedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Approval Information Box */}
                  {pass.approvedAt && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 px-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span>
                        Approved on {formatDateTime(pass.approvedAt)}
                        {pass.approverName ? ` by ${pass.approverName}` : ""}
                      </span>
                    </div>
                  )}

                  {/* Gate Movement Logs */}
                  {pass.movements && pass.movements.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800/60">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Gate Movement History
                      </p>
                      <div className="grid gap-2">
                        {pass.movements.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/50 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              {m.type === "EXIT" ? (
                                <LogOut className="h-3.5 w-3.5 text-orange-400" />
                              ) : (
                                <LogIn className="h-3.5 w-3.5 text-emerald-400" />
                              )}
                              <span className="font-semibold text-zinc-200">
                                {m.type} registered at {m.gateName}
                              </span>
                              {m.gateLocation && (
                                <span className="text-zinc-500">({m.gateLocation})</span>
                              )}
                            </div>
                            <div className="text-right text-zinc-400">
                              <span>{m.createdAt ? formatDateTime(m.createdAt) : "—"}</span>
                              <span className="text-zinc-500 ml-2">by {m.securityName}</span>
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
      </div>

      {/* Pagination Bar (Sticky at bottom, touches sidebar seamlessly with 0px gap) */}
      {filteredPermissions.length > 0 && (
        <div className="sticky bottom-0 -mx-4 lg:-mx-8 -mb-4 lg:-mb-8 mt-10 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl z-30 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-zinc-400 font-medium">
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, filteredPermissions.length)} of{" "}
              {filteredPermissions.length} passes
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-3 text-xs shadow-none border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-3 text-xs shadow-none border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

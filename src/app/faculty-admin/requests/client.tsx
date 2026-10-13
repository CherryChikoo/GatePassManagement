"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, EmptyState, Modal, StatusBadge, Select } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { handleApproval, batchApproval } from "@/server/actions/approvals";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  User,
  MapPin,
  Clock,
  Search,
  GraduationCap,
  Briefcase,
  CheckSquare,
  Square,
  AlertTriangle,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { TopLoadingBar } from "@/components/ui/top-loading-bar";

export function FacultyAdminRequestsClient() {
  const isReady = useStoreReady();
  const allRequests = useAppStore((s) => s.data.allRequests || s.data.requests);
  const updateData = useAppStore((s) => s.updateData);

  const [activeTab, setActiveTab] = useState<"PENDING" | "ACCEPTED" | "REJECTED">("PENDING");
  const [targetType, setTargetType] = useState<"ALL" | "FACULTY" | "STUDENTS">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [approveModal, setApproveModal] = useState<{ id: string; name: string } | null>(null);
  const [batchRejectModal, setBatchRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState<number>(60);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  // Local optimistic overrides for 0ms instantaneous UI feedback
  const [localOverrides, setLocalOverrides] = useState<
    Record<string, { status: string; approvedAt?: string; rejectedAt?: string; rejectionReason?: string }>
  >({});

  if (!isReady || !allRequests) {
    return <DashboardSkeleton />;
  }

  // Merge server requests with instant local optimistic overrides
  const rawRequests = (allRequests || []).map((item: any) => {
    if (localOverrides[item.id]) {
      return { ...item, ...localOverrides[item.id] };
    }
    return item;
  });

  const filteredRequests = rawRequests
    .filter((item: any) => {
      const isFacultyPass = item.approverType === "FACULTY_ADMIN" || !!item.facultyId;

      // Target filter
      if (targetType === "FACULTY" && !isFacultyPass) return false;
      if (targetType === "STUDENTS" && isFacultyPass) return false;

      // Status filter
      if (activeTab === "PENDING" && item.status !== "PENDING") return false;
      if (
        activeTab === "ACCEPTED" &&
        item.status !== "APPROVED" &&
        item.status !== "COMPLETED" &&
        item.status !== "EXITED"
      )
        return false;
      if (
        activeTab === "REJECTED" &&
        item.status !== "REJECTED" &&
        item.status !== "CANCELLED" &&
        item.status !== "EXPIRED"
      )
        return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const studentName = item.student?.profile?.name?.toLowerCase() || "";
        const facultyName = item.faculty?.profile?.name?.toLowerCase() || "";
        const roll = item.student?.studentRoll?.toLowerCase() || "";
        const empId = item.faculty?.employeeId?.toLowerCase() || "";
        const purpose = item.purpose?.toLowerCase() || "";
        const destination = item.destination?.toLowerCase() || "";

        if (
          !studentName.includes(q) &&
          !facultyName.includes(q) &&
          !roll.includes(q) &&
          !empId.includes(q) &&
          !purpose.includes(q) &&
          !destination.includes(q)
        ) {
          return false;
        }
      }

      return true;
    })
    .sort((a: any, b: any) => {
      if (activeTab === "ACCEPTED") {
        // Show recently accepted items at the very top
        const timeA = new Date(a.approvedAt || a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.approvedAt || b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      }
      if (activeTab === "REJECTED") {
        // Show recently rejected items at the very top
        const timeA = new Date(a.rejectedAt || a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.rejectedAt || b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      }
      // PENDING: newest requests first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const pendingCount = rawRequests.filter((r: any) => r.status === "PENDING").length;
  const acceptedCount = rawRequests.filter(
    (r: any) => r.status === "APPROVED" || r.status === "COMPLETED" || r.status === "EXITED"
  ).length;
  const rejectedCount = rawRequests.filter(
    (r: any) => r.status === "REJECTED" || r.status === "CANCELLED" || r.status === "EXPIRED"
  ).length;

  const facultyPendingCount = rawRequests.filter(
    (r: any) => (r.approverType === "FACULTY_ADMIN" || !!r.facultyId) && r.status === "PENDING"
  ).length;
  const studentPendingCount = rawRequests.filter(
    (r: any) => r.approverType !== "FACULTY_ADMIN" && !r.facultyId && r.status === "PENDING"
  ).length;

  async function onAction(
    id: string,
    action: "APPROVE" | "REJECT",
    reason?: string,
    expiryMins?: number
  ) {
    const nowIso = new Date().toISOString();

    // 1. Instant local override (0ms UI latency) — immediately removes from Pending and places at top of Accepted/Rejected
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: {
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedAt: action === "APPROVE" ? nowIso : undefined,
        rejectedAt: action === "REJECT" ? nowIso : undefined,
        rejectionReason: action === "REJECT" ? (reason || "Request denied") : undefined,
      },
    }));

    // 2. Also update Zustand store
    updateData("allRequests", (prev: any[]) => {
      if (!prev) return [];
      return prev.map((r) =>
        r.id === id ? { 
          ...r, 
          status: action === "APPROVE" ? "APPROVED" : "REJECTED",
          approvedAt: action === "APPROVE" ? nowIso : r.approvedAt,
          rejectedAt: action === "REJECT" ? nowIso : r.rejectedAt,
          rejectionReason: action === "REJECT" ? (reason || "Request denied") : r.rejectionReason,
        } : r
      );
    });
    updateData("requests", (prev: any[]) => {
      if (!prev) return [];
      return prev.map((r) =>
        r.id === id ? { 
          ...r, 
          status: action === "APPROVE" ? "APPROVED" : "REJECTED",
          approvedAt: action === "APPROVE" ? nowIso : r.approvedAt,
          rejectedAt: action === "REJECT" ? nowIso : r.rejectedAt,
          rejectionReason: action === "REJECT" ? (reason || "Request denied") : r.rejectionReason,
        } : r
      );
    });

    if (action === "REJECT") setRejectModal(null);
    if (action === "APPROVE") setApproveModal(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      setProcessing((prev) => new Set(prev).add(id));
      const result = await handleApproval(id, action, reason, expiryMins);
      if (result.error) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        alert(result.error);
        useAppStore.getState().refresh(true);
      } else {
        useAppStore.getState().refresh(true);
      }
    } catch {
      setLocalOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      alert("Failed to process request");
      useAppStore.getState().refresh(true);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRejectReason("");
      setExpiryMinutes(60);
    }
  }

  async function onBatchAction(action: "APPROVE" | "REJECT", reason?: string) {
    if (selectedIds.size === 0) return;
    setBatchProcessing(true);
    if (action === "REJECT") setBatchRejectModal(false);

    const ids = Array.from(selectedIds).slice(0, 5);
    const nowIso = new Date().toISOString();

    const newOverrides: Record<string, any> = {};
    ids.forEach((id) => {
      newOverrides[id] = {
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedAt: action === "APPROVE" ? nowIso : undefined,
        rejectedAt: action === "REJECT" ? nowIso : undefined,
        rejectionReason: action === "REJECT" ? (reason || "Request denied") : undefined,
      };
    });
    setLocalOverrides((prev) => ({ ...prev, ...newOverrides }));

    const updateFn = (prev: any[]) => {
      if (!prev) return [];
      return prev.map((r) =>
        ids.includes(r.id)
          ? {
              ...r,
              status: action === "APPROVE" ? "APPROVED" : "REJECTED",
              approvedAt: action === "APPROVE" ? nowIso : r.approvedAt,
              rejectedAt: action === "REJECT" ? nowIso : r.rejectedAt,
              rejectionReason: action === "REJECT" ? (reason || "Request denied") : r.rejectionReason,
            }
          : r
      );
    };

    updateData("allRequests", updateFn);
    updateData("requests", updateFn);

    try {
      const result = await batchApproval(ids, action, reason);
      if (result?.error || !result?.success) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          ids.forEach((id) => delete next[id]);
          return next;
        });
        alert(result?.error || "Failed to process some batch requests");
      }
      useAppStore.getState().refresh(true);
    } catch {
      setLocalOverrides((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      alert("Failed to process batch request");
      useAppStore.getState().refresh(true);
    } finally {
      setBatchProcessing(false);
      setSelectedIds(new Set());
      setRejectReason("");
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= 5) {
          alert("Maximum 5 items can be selected for batch processing");
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      const pendingIds = paginatedRequests
        .filter((r: any) => r.status === "PENDING")
        .slice(0, 5)
        .map((r: any) => r.id);
      setSelectedIds(new Set(pendingIds));
    }
  }

  return (
    <div className="space-y-6 pb-24 relative">
      <TopLoadingBar active={processing.size > 0 || batchProcessing} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            Gate Pass Requests
            {pendingCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {pendingCount} Pending
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Review and approve pass requests for department faculty and students.
          </p>
        </div>

        {/* Batch actions bar if items are selected */}
        {selectedIds.size > 0 && activeTab === "PENDING" && (
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700/80 p-1.5 rounded-xl shadow-none animate-fade-in">
            <span className="text-xs font-semibold px-2 text-zinc-300">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              disabled={batchProcessing}
              onClick={() => onBatchAction("APPROVE")}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 shadow-none"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve Selected ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={batchProcessing}
              onClick={() => setBatchRejectModal(true)}
              className="bg-zinc-800 text-red-400 hover:bg-red-950 hover:text-red-300 border-zinc-700 text-xs h-8 shadow-none"
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject Selected ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {/* Target Type Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Target filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => {
              setTargetType("ALL");
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              targetType === "ALL"
                ? "bg-zinc-100 text-zinc-900 border-zinc-200"
                : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
            }`}
          >
            All Requests
          </button>
          <button
            onClick={() => {
              setTargetType("FACULTY");
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              targetType === "FACULTY"
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            Faculty Passes
            {facultyPendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-[10px]">
                {facultyPendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setTargetType("STUDENTS");
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              targetType === "STUDENTS"
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
            }`}
          >
            <GraduationCap className="h-3.5 w-3.5" />
            Student Passes
            {studentPendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-blue-500/30 text-[10px]">
                {studentPendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, roll, emp ID..."
            className="pl-9 h-9 bg-zinc-900 border-zinc-800 text-xs"
          />
        </div>
      </div>

      {/* Status Tabs with Live Counters */}
      <div className="flex bg-zinc-900/60 p-1.5 rounded-xl w-full max-w-md border border-zinc-800">
        {(
          [
            { id: "PENDING", label: "Pending", count: pendingCount },
            { id: "ACCEPTED", label: "Accepted", count: acceptedCount },
            { id: "REJECTED", label: "Rejected", count: rejectedCount },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setCurrentPage(1);
              setSelectedIds(new Set());
            }}
            className={`flex-1 text-xs sm:text-sm font-medium py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 ${
              activeTab === tab.id
                ? "bg-zinc-800 text-zinc-100 shadow-md font-semibold"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full transition-colors ${
                activeTab === tab.id
                  ? tab.id === "ACCEPTED"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : tab.id === "REJECTED"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-amber-500/20 text-amber-400"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Batch Selection Action Bar on Pending Tab */}
      {activeTab === "PENDING" && paginatedRequests.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3 px-1 py-1.5 bg-zinc-900/40 rounded-xl border border-zinc-800/60">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="text-xs text-zinc-300 hover:text-white flex items-center gap-2 transition-colors cursor-pointer select-none font-medium px-2 py-1 rounded-lg hover:bg-zinc-800/60"
            >
              {selectedIds.size > 0 ? (
                <CheckSquare className="h-4 w-4 text-orange-500" />
              ) : (
                <Square className="h-4 w-4 text-zinc-600" />
              )}
              <span>
                {selectedIds.size > 0
                  ? `${selectedIds.size} request${selectedIds.size > 1 ? "s" : ""} selected`
                  : "Select for batch approval (up to 5)"}
              </span>
            </button>
            {selectedIds.size > 0 && (
              <span className="text-[11px] text-zinc-500 hidden sm:inline">
                (Max 5 requests allowed per batch)
              </span>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 pr-1 animate-fade-in">
              <Button
                size="sm"
                disabled={batchProcessing}
                onClick={() => onBatchAction("APPROVE")}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 px-3 font-semibold shadow-none flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve {selectedIds.size}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={batchProcessing}
                onClick={() => setBatchRejectModal(true)}
                className="bg-zinc-800 hover:bg-red-950/80 text-red-400 hover:text-red-300 border border-red-900/40 text-xs h-7 px-3 font-semibold shadow-none flex items-center gap-1.5"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject {selectedIds.size}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                className="text-zinc-400 hover:text-zinc-200 text-xs h-7 px-2"
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Requests List */}
      {paginatedRequests.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-10 w-10" />}
          title={`No ${activeTab.toLowerCase()} requests`}
          description={
            activeTab === "PENDING"
              ? "All caught up! No pass requests waiting for your approval."
              : `No pass requests found in ${activeTab.toLowerCase()} state.`
          }
        />
      ) : (
        <div className="grid gap-4">
          {paginatedRequests.map((req: any) => {
            const isProcessing = processing.has(req.id);
            const isFacultyPass = req.approverType === "FACULTY_ADMIN" || !!req.facultyId;
            const applicantName = isFacultyPass
              ? req.faculty?.profile?.name || "Faculty Member"
              : req.student?.profile?.name || "Student";
            const isSelected = selectedIds.has(req.id);

            const applicantDept = isFacultyPass
              ? req.faculty?.department
              : req.student?.department;

            return (
              <Card
                key={req.id}
                className={`overflow-hidden transition-all duration-200 border rounded-2xl ${
                  isSelected
                    ? "border-orange-500/60 bg-orange-500/5"
                    : isFacultyPass
                    ? "border-indigo-500/30 bg-zinc-900/70 hover:border-indigo-500/50"
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                }`}
              >
                <CardContent className="p-0">
                  <div className="p-5 flex flex-col md:flex-row gap-5 items-start md:items-center justify-between">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {activeTab === "PENDING" && (
                        <button
                          onClick={() => toggleSelect(req.id)}
                          className="mt-2 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-orange-500" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      )}

                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                          isFacultyPass
                            ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                            : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {isFacultyPass ? (
                          <Briefcase className="h-5 w-5" />
                        ) : (
                          <GraduationCap className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-zinc-100 text-base">{applicantName}</h3>
                          
                          {/* Division Badge */}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                              isFacultyPass
                                ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                            }`}
                          >
                            {isFacultyPass ? "Faculty Division" : "Student Division"}
                          </span>

                          {isFacultyPass && req.faculty?.employeeId && (
                            <span className="text-[11px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50">
                              {req.faculty.employeeId}
                            </span>
                          )}
                          {!isFacultyPass && req.student?.studentRoll && (
                            <span className="text-[11px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50">
                              {req.student.studentRoll}
                            </span>
                          )}

                          {applicantDept && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
                              Dept: {applicantDept}
                            </span>
                          )}

                          <StatusBadge status={req.status} />

                          {/* Highlight Recently Accepted Pass */}
                          {activeTab === "ACCEPTED" && req.approvedAt && (
                            (() => {
                              const isRecent = (Date.now() - new Date(req.approvedAt).getTime()) < 24 * 60 * 60 * 1000;
                              return isRecent ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 animate-pulse">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                  Recently Accepted
                                </span>
                              ) : null;
                            })()
                          )}
                        </div>

                        {/* Visual Division separator */}
                        <div className="my-2.5 border-t border-zinc-800/60" />

                        <p className="text-xs text-zinc-300 mb-2">
                          <span className="font-medium text-zinc-200">{req.purpose}</span>
                          {req.remarks && (
                            <span className="text-zinc-400 italic"> — {req.remarks}</span>
                          )}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-zinc-400">
                          {req.destination && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                              <span>{req.destination}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-zinc-500" />
                            <span>
                              {formatDate(req.exitDate)}{" "}
                              {req.expectedExit &&
                                `at ${formatDateTime(req.expectedExit).split(", ")[1] || ""}`}
                            </span>
                          </div>
                          {req.expectedReturn && (
                            <div className="flex items-center gap-1.5 text-zinc-400">
                              <span>
                                Return: {formatDateTime(req.expectedReturn).split(", ")[1] || ""}
                              </span>
                            </div>
                          )}

                          {/* Accepted timestamp */}
                          {activeTab === "ACCEPTED" && (req.approvedAt || req.updatedAt) && (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Accepted: {formatDateTime(req.approvedAt || req.updatedAt)}</span>
                            </div>
                          )}

                          {/* Rejected timestamp & reason */}
                          {activeTab === "REJECTED" && (
                            <div className="flex items-center gap-1.5 text-red-400 font-medium bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                              <XCircle className="h-3.5 w-3.5 text-red-400" />
                              <span>Rejected: {req.rejectionReason || "Denied"} {req.rejectedAt ? `• ${formatDateTime(req.rejectedAt)}` : ""}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {activeTab === "PENDING" && (
                      <div className="flex md:flex-col gap-2 w-full md:w-32 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-800">
                        <Button
                          variant="success"
                          onClick={() => setApproveModal({ id: req.id, name: applicantName })}
                          disabled={isProcessing}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-none"
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setRejectModal({ id: req.id, name: applicantName })}
                          disabled={isProcessing}
                          className="flex-1 bg-zinc-800 text-red-400 hover:bg-red-950 hover:text-red-300 border border-zinc-700 shadow-none"
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-4 border-t border-zinc-800/50">
          <p className="text-xs text-zinc-400">
            Page {currentPage} of {totalPages} ({filteredRequests.length} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="border-zinc-800"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="border-zinc-800"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      <Modal
        open={!!approveModal}
        onClose={() => setApproveModal(null)}
        title="Approve Gate Pass"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Are you sure you want to approve the gate pass for{" "}
            <span className="font-semibold text-zinc-100">{approveModal?.name}</span>?
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">QR Code Validity</label>
            <Select
              value={String(expiryMinutes)}
              onChange={(e) => setExpiryMinutes(Number(e.target.value))}
            >
              <option value="30">30 minutes</option>
              <option value="60">1 hour (standard)</option>
              <option value="120">2 hours</option>
              <option value="240">4 hours</option>
              <option value="480">8 hours</option>
              <option value="720">12 hours (full day)</option>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setApproveModal(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                approveModal && onAction(approveModal.id, "APPROVE", undefined, expiryMinutes)
              }
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Confirm Approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Request">
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Provide a reason for rejecting the pass for{" "}
            <span className="font-semibold text-zinc-100">{rejectModal?.name}</span>.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Incomplete lab attendance, invalid purpose..."
            rows={3}
            required
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setRejectModal(null)}>
              Cancel
            </Button>
            <Button
              disabled={!rejectReason.trim()}
              onClick={() => rejectModal && onAction(rejectModal.id, "REJECT", rejectReason)}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Reject Modal */}
      <Modal
        open={batchRejectModal}
        onClose={() => setBatchRejectModal(false)}
        title="Batch Reject Requests"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Reject {selectedIds.size} selected pass request(s)? Please provide a reason:
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Department activity canceled, curfew guidelines..."
            rows={3}
            required
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setBatchRejectModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={!rejectReason.trim()}
              onClick={() => onBatchAction("REJECT", rejectReason)}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Reject All Selected
            </Button>
          </div>
        </div>
      </Modal>

      {/* Floating Bottom Batch Action Pill Bar */}
      {selectedIds.size > 0 && activeTab === "PENDING" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 px-4 py-2.5 rounded-full shadow-2xl transition-all duration-300">
          <div className="flex items-center gap-2 pr-2 border-r border-zinc-700/60">
            <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-xs font-semibold text-zinc-200">
              {selectedIds.size} selected
            </span>
          </div>
          <Button
            size="sm"
            disabled={batchProcessing}
            onClick={() => onBatchAction("APPROVE")}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 px-3.5 rounded-full font-medium shadow-none flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            disabled={batchProcessing}
            onClick={() => setBatchRejectModal(true)}
            className="bg-zinc-800 hover:bg-red-950/80 text-red-400 hover:text-red-300 border border-zinc-700 text-xs h-8 px-3.5 rounded-full font-medium shadow-none flex items-center gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject ({selectedIds.size})
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-2 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { delayMinutes, formatDelay, returnDueAt } from "@/lib/passes/return-scan";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, EmptyState, Modal, StatusBadge, Select } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { PagerBar } from "@/components/ui/pager-bar";
import { handleApproval, batchApproval } from "@/server/actions/approvals";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  MapPin,
  Clock,
  Search,
  GraduationCap,
  Briefcase,
  CheckSquare,
  Square,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { TopLoadingBar } from "@/components/ui/top-loading-bar";
import { PassExtraDetails } from "@/components/passes/pass-extra";

/** The request lists as they are now, to put back if an optimistic approve / reject fails */
function snapshotRequests() {
  const d = useAppStore.getState().data;
  return { allRequests: d.allRequests, requests: d.requests };
}
function restoreRequests(snap: { allRequests: any; requests: any }) {
  const st = useAppStore.getState();
  if (snap.allRequests !== undefined) st.setData("allRequests", snap.allRequests);
  if (snap.requests !== undefined) st.setData("requests", snap.requests);
}

export function FacultyAdminRequestsClient() {
  const isReady = useStoreReady();
  const allRequests = useAppStore((s) => s.data.allRequests || s.data.requests);
  const updateData = useAppStore((s) => s.updateData);

  const [activeTab, setActiveTab] = useState<"PENDING" | "ACCEPTED" | "REJECTED">("PENDING");
  const [targetType, setTargetType] = useState<"ALL" | "FACULTY" | "STUDENTS">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  // Result of an approve / reject that needs the HOD's attention (shown above the list)
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);
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
      const isFacultyPass = !!item.facultyId;

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
    (r: any) => !!r.facultyId && r.status === "PENDING"
  ).length;
  const studentPendingCount = rawRequests.filter(
    (r: any) => !r.facultyId && r.status === "PENDING"
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

    // 2. Also update Zustand store (put back if the server refuses)
    const before = snapshotRequests();
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
      const result: any = await handleApproval(id, action, reason, expiryMins);
      if (result.error) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        restoreRequests(before);
        setNotice({ tone: "error", text: result.error });
        useAppStore.getState().refresh(true);
      } else if (result.action === "PARTIAL") {
        // "Both HOD & Dean" pass: still pending until the Dean approves
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        const mark = (prev: any[]) => (prev || []).map((r) => (r.id === id ? { ...r, status: "PENDING", hodApprovedAt: nowIso } : r));
        updateData("allRequests", mark);
        updateData("requests", mark);
        setNotice({ tone: "info", text: result.message || "Approved. Waiting for the Dean's approval." });
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
      restoreRequests(before);
      setNotice({ tone: "error", text: "Could not save. Check the connection and try again." });
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

    const before = snapshotRequests();
    updateData("allRequests", updateFn);
    updateData("requests", updateFn);

    try {
      const result: any = await batchApproval(ids, action, reason);
      if (result?.error || !result?.success) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          ids.forEach((id) => delete next[id]);
          return next;
        });
        restoreRequests(before);
        setNotice({ tone: "error", text: result?.error || "Some requests could not be processed. Please try again." });
      } else {
        // "Both HOD & Dean" passes stay pending until the Dean also approves
        const partialIds: string[] = (result.results || [])
          .filter((r: any) => r.action === "PARTIAL")
          .map((r: any) => r.id);
        if (partialIds.length > 0) {
          setLocalOverrides((prev) => {
            const next = { ...prev };
            partialIds.forEach((id) => delete next[id]);
            return next;
          });
          const mark = (prev: any[]) =>
            (prev || []).map((r) => (partialIds.includes(r.id) ? { ...r, status: "PENDING", hodApprovedAt: nowIso } : r));
          updateData("allRequests", mark);
          updateData("requests", mark);
        }
      }
      useAppStore.getState().refresh(true);
    } catch {
      setLocalOverrides((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      restoreRequests(before);
      setNotice({ tone: "error", text: "Could not save. Check the connection and try again." });
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
          setNotice({ tone: "info", text: "You can select up to 5 requests at a time." });
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
    <div className="relative mx-auto max-w-7xl space-y-6 pb-28">
      <TopLoadingBar active={processing.size > 0 || batchProcessing} />
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
            notice.tone === "error" ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-sky-500/20 bg-sky-500/10 text-sky-400"
          }`}
        >
          <span className="min-w-0 flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 rounded-full px-2 text-xs font-semibold hover:underline">
            OK
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 flex items-center gap-3 flex-wrap">
            Gate Pass Requests
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                {pendingCount} Pending
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Today&apos;s pass requests for department faculty and students. Past requests are in the Activity tab.
          </p>
        </div>

        {/* Batch actions (header) when items are selected */}
        {selectedIds.size > 0 && activeTab === "PENDING" && (
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 p-1.5 pl-4 shadow-card animate-fade-in shrink-0">
            <span className="text-xs font-medium text-zinc-300 whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="success"
              disabled={batchProcessing}
              onClick={() => onBatchAction("APPROVE")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve Selected ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={batchProcessing}
              onClick={() => setBatchRejectModal(true)}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
            >
              <XCircle className="h-3.5 w-3.5" /> Reject Selected ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {/* Target type filters & search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
          {/* Target filter */}
          <div
            className="inline-flex max-w-full self-start rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
            role="tablist"
            aria-label="Filter by applicant type"
          >
            {(
              [
                { id: "ALL", label: "All Requests", icon: null, count: 0 },
                { id: "FACULTY", label: "Faculty Passes", icon: <Briefcase className="h-3.5 w-3.5" />, count: facultyPendingCount },
                { id: "STUDENTS", label: "Student Passes", icon: <GraduationCap className="h-3.5 w-3.5" />, count: studentPendingCount },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={targetType === t.id}
                onClick={() => {
                  setTargetType(t.id);
                  setCurrentPage(1);
                }}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                  targetType === t.id ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {t.icon}
                {t.label}
                {t.count > 0 && (
                  <span className="ml-0.5 rounded-full bg-orange-500/10 px-1.5 text-[10px] font-semibold text-orange-400">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Status tabs with live counters */}
          <div
            className="flex sm:inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
            role="tablist"
            aria-label="Filter by status"
          >
            {(
              [
                { id: "PENDING", label: "Pending", count: pendingCount },
                { id: "ACCEPTED", label: "Accepted", count: acceptedCount },
                { id: "REJECTED", label: "Rejected", count: rejectedCount },
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
                  setSelectedIds(new Set());
                }}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                  activeTab === tab.id ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 text-[10px] font-semibold transition-colors ${
                    activeTab === tab.id
                      ? tab.id === "ACCEPTED"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : tab.id === "REJECTED"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-400"
                      : "bg-zinc-900 text-zinc-500"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-72 shrink-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 z-10" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, roll, emp ID..."
            className="h-10 rounded-full border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm placeholder:text-zinc-500 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
          />
        </div>
      </div>

      {/* Batch selection bar (pending tab) */}
      {activeTab === "PENDING" && paginatedRequests.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-2 py-1.5 shadow-card">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-950 hover:text-zinc-100 transition-colors cursor-pointer select-none"
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
                variant="success"
                disabled={batchProcessing}
                onClick={() => onBatchAction("APPROVE")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve {selectedIds.size}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={batchProcessing}
                onClick={() => setBatchRejectModal(true)}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject {selectedIds.size}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Requests list */}
      {paginatedRequests.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title={`No ${activeTab.toLowerCase()} requests`}
            description={
              activeTab === "PENDING"
                ? "All caught up! No pass requests waiting for your approval."
                : `No pass requests found in ${activeTab.toLowerCase()} state.`
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {paginatedRequests.map((req: any) => {
            const isProcessing = processing.has(req.id);
            const isFacultyPass = !!req.facultyId;
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
                className={
                  isSelected
                    ? "border-orange-500/50 ring-2 ring-orange-500/15"
                    : "hover:border-zinc-700"
                }
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-5 items-stretch md:items-center justify-between">
                    <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                      {activeTab === "PENDING" && (
                        <button
                          type="button"
                          onClick={() => toggleSelect(req.id)}
                          aria-label={isSelected ? `Deselect ${applicantName}` : `Select ${applicantName}`}
                          className="-ml-2 -mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-950 hover:text-zinc-300 transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-orange-500" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      )}

                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                        {isFacultyPass ? (
                          <Briefcase className="h-5 w-5" />
                        ) : (
                          <GraduationCap className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap">
                          <h3 className="text-base font-medium text-zinc-100 break-words">{applicantName}</h3>
                          <StatusBadge status={req.status} />
                          {/* Faculty still out past the end of their pass (the QR keeps working) */}
                          {req.facultyId && req.status === "EXITED" && delayMinutes(returnDueAt(req)) > 0 && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 whitespace-nowrap">
                              Delayed return · {formatDelay(delayMinutes(returnDueAt(req)))}
                            </span>
                          )}

                          {/* Highlight recently accepted pass */}
                          {activeTab === "ACCEPTED" && req.approvedAt && (
                            (() => {
                              const isRecent = (Date.now() - new Date(req.approvedAt).getTime()) < 24 * 60 * 60 * 1000;
                              return isRecent ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Recently Accepted
                                </span>
                              ) : null;
                            })()
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {/* Division badge */}
                          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                            {isFacultyPass ? "Faculty Division" : "Student Division"}
                          </span>
                          {isFacultyPass && req.faculty?.employeeId && (
                            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                              {req.faculty.employeeId}
                            </span>
                          )}
                          {!isFacultyPass && req.student?.studentRoll && (
                            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                              {req.student.studentRoll}
                            </span>
                          )}
                          {applicantDept && (
                            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                              Dept: {applicantDept}
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-sm text-zinc-300 break-words">
                          <span className="font-medium text-zinc-200">{req.purpose}</span>
                          {req.remarks && (
                            <span className="text-zinc-500 italic"> — {req.remarks}</span>
                          )}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
                          <PassExtraDetails pass={req} className="w-full" />
                          {req.destination && (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="break-words">{req.destination}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {formatDate(req.exitDate)}{" "}
                              {req.expectedExit &&
                                `at ${formatDateTime(req.expectedExit).split(", ")[1] || ""}`}
                            </span>
                          </div>
                          {req.expectedReturn && (
                            <div className="flex items-center gap-1.5">
                              <span>
                                Return: {formatDateTime(req.expectedReturn).split(", ")[1] || ""}
                              </span>
                            </div>
                          )}

                          {/* Accepted timestamp */}
                          {activeTab === "ACCEPTED" && (req.approvedAt || req.updatedAt) && (
                            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>Accepted: {formatDateTime(req.approvedAt || req.updatedAt)}</span>
                            </div>
                          )}

                          {/* Rejected timestamp & reason */}
                          {activeTab === "REJECTED" && (
                            <div className="flex items-start gap-1.5 rounded-2xl bg-red-500/10 px-2.5 py-1 font-medium text-red-400">
                              <XCircle className="h-3.5 w-3.5 mt-px shrink-0" />
                              <span className="break-words">Rejected: {req.rejectionReason || "Denied"} {req.rejectedAt ? `• ${formatDateTime(req.rejectedAt)}` : ""}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {activeTab === "PENDING" && req.approvalMode === "BOTH" && req.hodApprovedAt && (
                      <div className="w-full md:w-44 shrink-0 flex items-start gap-1.5 rounded-2xl bg-emerald-500/10 px-3 py-2.5 text-xs font-medium text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" />
                        <span>You approved — waiting for the Dean</span>
                      </div>
                    )}

                    {activeTab === "PENDING" && !(req.approvalMode === "BOTH" && req.hodApprovedAt) && (
                      <div className="flex flex-wrap md:flex-col gap-2 w-full md:w-36 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-zinc-800">
                        {req.approvalMode === "BOTH" && (
                          <span className="w-full rounded-full bg-amber-500/10 px-2 py-1 text-center text-[11px] font-medium text-amber-400">
                            Needs HOD + Dean
                          </span>
                        )}
                        <Button
                          variant="success"
                          onClick={() => setApproveModal({ id: req.id, name: applicantName })}
                          disabled={isProcessing}
                          className="flex-1 md:flex-none"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setRejectModal({ id: req.id, name: applicantName })}
                          disabled={isProcessing}
                          className="flex-1 md:flex-none border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
                        >
                          <XCircle className="h-4 w-4" />
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

      {/* Pagination (docks at the bottom of the screen) */}
      <PagerBar
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={filteredRequests.length}
        onPageChange={setCurrentPage}
        itemLabel="requests"
      />

      {/* Approve Modal */}
      <Modal
        open={!!approveModal}
        onClose={() => setApproveModal(null)}
        title="Approve Gate Pass"
      >
        <div className="space-y-5">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Are you sure you want to approve the gate pass for{" "}
            <span className="font-medium text-zinc-100">{approveModal?.name}</span>?
          </p>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">QR Code Validity</label>
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
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setApproveModal(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={() =>
                approveModal && onAction(approveModal.id, "APPROVE", undefined, expiryMinutes)
              }
              className="w-full sm:w-auto"
            >
              Confirm Approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Request">
        <div className="space-y-5">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Provide a reason for rejecting the pass for{" "}
            <span className="font-medium text-zinc-100">{rejectModal?.name}</span>.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Incomplete lab attendance, invalid purpose..."
            rows={3}
            required
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setRejectModal(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={() => rejectModal && onAction(rejectModal.id, "REJECT", rejectReason)}
              className="w-full sm:w-auto"
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
        <div className="space-y-5">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Reject {selectedIds.size} selected pass request(s)? Please provide a reason:
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Department activity canceled, curfew guidelines..."
            rows={3}
            required
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setBatchRejectModal(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={() => onBatchAction("REJECT", rejectReason)}
              className="w-full sm:w-auto"
            >
              Reject All Selected
            </Button>
          </div>
        </div>
      </Modal>

      {/* Floating bottom batch action bar */}
      {selectedIds.size > 0 && activeTab === "PENDING" && (
        <div className="fixed bottom-[5.25rem] sm:bottom-24 left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 sm:gap-3 rounded-full border border-zinc-800 bg-zinc-900 py-1.5 pl-4 pr-1.5 shadow-[0_12px_32px_-12px_rgba(16,24,40,0.35)]">
          <div className="flex items-center gap-2 pr-2 sm:pr-3 border-r border-zinc-800 shrink-0">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="text-xs font-medium text-zinc-200 whitespace-nowrap">
              {selectedIds.size}<span className="hidden sm:inline"> selected</span>
            </span>
          </div>
          <Button
            size="sm"
            variant="success"
            disabled={batchProcessing}
            onClick={() => onBatchAction("APPROVE")}
            className="h-10 px-3 sm:px-3.5"
          >
            <CheckCircle2 className="hidden sm:block h-3.5 w-3.5" />
            Approve ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={batchProcessing}
            onClick={() => setBatchRejectModal(true)}
            className="h-10 px-3 sm:px-3.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
          >
            <XCircle className="hidden sm:block h-3.5 w-3.5" />
            Reject ({selectedIds.size})
          </Button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="h-10 shrink-0 rounded-full px-2.5 text-xs font-medium text-zinc-500 hover:bg-zinc-950 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

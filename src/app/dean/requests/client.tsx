"use client";
import { delayMinutes, formatDelay, returnDueAt } from "@/lib/passes/return-scan";
import { ThemedSelect } from "@/components/ui/themed-select";
import { scheduledNote } from "@/lib/pass-dates";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, EmptyState, Modal, StatusBadge } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { handleApproval, batchApproval } from "@/server/actions/approvals";
import { formatDateTime } from "@/lib/utils";
import { getDepartmentCode } from "@/lib/constants";
import {
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Clock,
  Search,
  CheckSquare,
  Square,
  Building2,
  Shield,
  Briefcase,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { PassExtraDetails } from "@/components/passes/pass-extra";
import { PagerBar } from "@/components/ui/pager-bar";

export function DeanRequestsClient() {
  const isReady = useStoreReady();
  const requests = useAppStore((s) => s.data.requests);
  const updateData = useAppStore((s) => s.updateData);
  // Result of an approve / reject that needs attention (shown above the list)
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<"PENDING" | "ACCEPTED" | "REJECTED">("PENDING");
  const [selectedDept, setSelectedDept] = useState("ALL");
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

  // Local optimistic overrides for instantaneous 0ms feedback
  const [localOverrides, setLocalOverrides] = useState<
    Record<string, { status: string; approvedAt?: string; rejectedAt?: string; rejectionReason?: string }>
  >({});

  if (!isReady || !requests) {
    return <DashboardSkeleton />;
  }

  // Merge server requests with optimistic overrides
  const rawRequests = (requests || []).map((item: any) => {
    if (localOverrides[item.id]) {
      return { ...item, ...localOverrides[item.id] };
    }
    return item;
  });

  // Extract unique departments for dropdown filter
  const departments = Array.from(
    new Set(
      rawRequests
        .map((r: any) => r.faculty?.department)
        .filter(Boolean)
    )
  ).sort() as string[];

  const filteredRequests = rawRequests
    .filter((item: any) => {
      // Department filter
      if (selectedDept !== "ALL" && item.faculty?.department !== selectedDept) return false;

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
        const facultyName = item.faculty?.profile?.name?.toLowerCase() || "";
        const empId = item.faculty?.employeeId?.toLowerCase() || "";
        const dept = item.faculty?.department?.toLowerCase() || "";
        const purpose = item.purpose?.toLowerCase() || "";
        const destination = item.destination?.toLowerCase() || "";

        return (
          facultyName.includes(q) ||
          empId.includes(q) ||
          dept.includes(q) ||
          purpose.includes(q) ||
          destination.includes(q)
        );
      }

      return true;
    })
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Pagination
  const paginatedRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Tab counts
  const pendingCount = rawRequests.filter((r: any) => r.status === "PENDING").length;
  const acceptedCount = rawRequests.filter(
    (r: any) => r.status === "APPROVED" || r.status === "COMPLETED" || r.status === "EXITED"
  ).length;
  const rejectedCount = rawRequests.filter(
    (r: any) => r.status === "REJECTED" || r.status === "CANCELLED" || r.status === "EXPIRED"
  ).length;

  // Actions
  const handleSingleApprove = async (id: string, mins: number) => {
    setProcessing((prev) => new Set(prev).add(id));
    setApproveModal(null);

    // Instant optimistic update
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: { status: "APPROVED", approvedAt: new Date().toISOString() },
    }));

    try {
      const res: any = await handleApproval(id, "APPROVE", undefined, mins);
      if (res?.error) {
        // Rollback and tell the user why
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setNotice({ tone: "error", text: res.error });
        useAppStore.getState().refresh(true);
      } else if (res?.action === "PARTIAL") {
        // "Both HOD & Dean" pass: still pending until the HOD approves
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        updateData("requests", (prev: any[]) =>
          (prev || []).map((p: any) => (p.id === id ? { ...p, deanApprovedAt: new Date().toISOString() } : p))
        );
        setNotice({ tone: "info", text: res.message || "Approved. Waiting for the HOD's approval." });
        useAppStore.getState().refresh(true);
      } else {
        updateData("requests", (prev: any[]) =>
          (prev || []).map((p: any) => (p.id === id ? { ...p, status: "APPROVED", approvedAt: new Date().toISOString() } : p))
        );
      }
    } catch {
      setLocalOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotice({ tone: "error", text: "Could not approve. Check the connection and try again." });
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSingleReject = async (id: string, reason: string) => {
    if (!reason.trim()) return;
    setProcessing((prev) => new Set(prev).add(id));
    setRejectModal(null);
    setRejectReason("");

    // Instant optimistic update
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: { status: "REJECTED", rejectedAt: new Date().toISOString(), rejectionReason: reason },
    }));

    try {
      const res = await handleApproval(id, "REJECT", reason);
      if (res?.error) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setNotice({ tone: "error", text: res.error });
        useAppStore.getState().refresh(true);
      } else {
        updateData("requests", (prev: any[]) =>
          (prev || []).map((p: any) =>
            p.id === id ? { ...p, status: "REJECTED", rejectedAt: new Date().toISOString(), rejectionReason: reason } : p
          )
        );
      }
    } catch {
      setLocalOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotice({ tone: "error", text: "Could not reject. Check the connection and try again." });
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Batch actions
  const handleBatchApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchProcessing(true);

    const now = new Date().toISOString();
    setLocalOverrides((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = { status: "APPROVED", approvedAt: now };
      });
      return next;
    });

    try {
      const res: any = await batchApproval(ids, "APPROVE");
      const failedIds: string[] = res?.success
        ? []
        : (res?.results?.filter((r: any) => !r.success).map((r: any) => r.id) ?? ids);
      // "Both HOD & Dean" passes stay pending until the HOD also approves
      const partialIds: string[] = (res?.results || [])
        .filter((r: any) => r.success && r.action === "PARTIAL")
        .map((r: any) => r.id);
      const okIds = ids.filter((id) => !failedIds.includes(id) && !partialIds.includes(id));
      if (okIds.length > 0) {
        updateData("requests", (prev: any[]) =>
          (prev || []).map((p: any) => (okIds.includes(p.id) ? { ...p, status: "APPROVED", approvedAt: now } : p))
        );
      }
      if (partialIds.length > 0) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          partialIds.forEach((id) => delete next[id]);
          return next;
        });
        updateData("requests", (prev: any[]) =>
          (prev || []).map((p: any) => (partialIds.includes(p.id) ? { ...p, deanApprovedAt: now } : p))
        );
        useAppStore.getState().refresh(true);
      }
      if (failedIds.length > 0) {
        // Roll back only the ones that failed
        setLocalOverrides((prev) => {
          const next = { ...prev };
          failedIds.forEach((id) => delete next[id]);
          return next;
        });
        setNotice({ tone: "error", text: res?.error || "Some requests could not be approved." });
        useAppStore.getState().refresh(true);
      }
      setSelectedIds(new Set(failedIds));
    } catch {
      setLocalOverrides((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      setNotice({ tone: "error", text: "Could not save. Check the connection and try again." });
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleBatchReject = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !rejectReason.trim()) return;
    setBatchProcessing(true);
    setBatchRejectModal(false);

    const now = new Date().toISOString();
    setLocalOverrides((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = { status: "REJECTED", rejectedAt: now, rejectionReason: rejectReason };
      });
      return next;
    });

    try {
      const res: any = await batchApproval(ids, "REJECT", rejectReason);
      const failedIds: string[] = res?.success
        ? []
        : (res?.results?.filter((r: any) => !r.success).map((r: any) => r.id) ?? ids);
      const okIds = ids.filter((id) => !failedIds.includes(id));
      if (okIds.length > 0) {
        updateData("requests", (prev: any[]) =>
          (prev || []).map((p: any) =>
            okIds.includes(p.id) ? { ...p, status: "REJECTED", rejectedAt: now, rejectionReason: rejectReason } : p
          )
        );
      }
      if (failedIds.length > 0) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          failedIds.forEach((id) => delete next[id]);
          return next;
        });
        setNotice({ tone: "error", text: res?.error || "Some requests could not be rejected." });
        useAppStore.getState().refresh(true);
      } else {
        setRejectReason("");
      }
      setSelectedIds(new Set(failedIds));
    } catch {
      setLocalOverrides((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      setNotice({ tone: "error", text: "Could not save. Check the connection and try again." });
    } finally {
      setBatchProcessing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= 5) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const tabs = [
    { id: "PENDING" as const, label: "Pending", count: pendingCount },
    { id: "ACCEPTED" as const, label: "Approved", count: acceptedCount },
    { id: "REJECTED" as const, label: "Rejected", count: rejectedCount },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
              Faculty Gate Pass Authorizations
            </h1>
            <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-400">
              Dean Review
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Today&apos;s faculty gate pass requests. Past requests are in the Activity tab.
          </p>
        </div>

        {/* Batch Operations Toolbar */}
        {selectedIds.size > 0 && activeTab === "PENDING" && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl sm:rounded-full border border-orange-500/20 bg-orange-500/10 p-1.5 sm:pl-4 animate-fade-in">
            <span className="w-full sm:w-auto px-2 sm:px-0 text-xs font-medium text-orange-400">
              {selectedIds.size} Selected (Max 5)
            </span>
            <Button
              size="sm"
              variant="success"
              onClick={handleBatchApprove}
              loading={batchProcessing}
              className="flex-1 sm:flex-none h-10 sm:h-9"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBatchRejectModal(true)}
              disabled={batchProcessing}
              className="flex-1 sm:flex-none h-10 sm:h-9 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4" />
              Reject All
            </Button>
          </div>
        )}
      </div>

      {/* Tabs & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div
          className="inline-flex w-fit max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="Filter by status"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => {
                setActiveTab(t.id);
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                activeTab === t.id ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  activeTab === t.id ? "bg-orange-500/10 text-orange-400" : "bg-zinc-900 text-zinc-500"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Department Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 min-w-0">
          <div className="w-full sm:w-72">
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search faculty name, ID, purpose..."
              aria-label="Search faculty requests"
              icon={<Search className="h-4 w-4" />}
              className="h-10 rounded-full text-sm focus:ring-4 focus:ring-orange-500/10"
            />
          </div>

          {departments.length > 0 && (
            <ThemedSelect
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by department"
              className="h-10 w-full sm:w-auto sm:max-w-[16rem] rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </ThemedSelect>
          )}
        </div>
      </div>

      {/* Requests List */}
      {paginatedRequests.length === 0 ? (
        <Card>
          <EmptyState
            title={`No ${activeTab.toLowerCase()} requests`}
            description={
              searchQuery || selectedDept !== "ALL"
                ? "No faculty requests match your filter criteria."
                : `There are currently no ${activeTab.toLowerCase()} faculty gate pass requests.`
            }
            icon={<ClipboardCheck className="h-6 w-6" />}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {paginatedRequests.map((item: any) => {
            const facultyName = item.faculty?.profile?.name || "Faculty Member";
            const dept = item.faculty?.department || "Department";
            const desig = item.faculty?.designation || "Faculty";
            const empId = item.faculty?.employeeId || "N/A";
            const isItemProcessing = processing.has(item.id);
            const isSelected = selectedIds.has(item.id);

            return (
              <Card
                key={item.id}
                className={isSelected ? "border-orange-500/40 ring-1 ring-orange-500/20" : ""}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Left: Checkbox + Profile */}
                    <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                      {activeTab === "PENDING" && (
                        <button
                          onClick={() => toggleSelect(item.id)}
                          aria-label={isSelected ? `Deselect ${facultyName}` : `Select ${facultyName}`}
                          aria-pressed={isSelected}
                          className="-ml-2 -my-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-950 hover:text-orange-400 transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-orange-400" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      )}

                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-sm font-semibold text-orange-400">
                        {facultyName
                          .split(" ")
                          .map((n: string) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                          <h3 className="text-sm font-medium text-zinc-100 break-words">{facultyName}</h3>
                          <span className="font-mono text-xs text-zinc-500">{empId}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                            {getDepartmentCode(dept)}
                          </span>
                          {item.faculty?.profile?.role === "FACULTY_ADMIN" ||
                          item.faculty?.designation?.toLowerCase().includes("head") ||
                          item.faculty?.designation?.toLowerCase().includes("hod") ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-400">
                              <Shield className="h-3 w-3" />
                              HOD
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                              <Briefcase className="h-3 w-3" />
                              Faculty
                            </span>
                          )}
                          <StatusBadge status={item.status} />
                          {/* Faculty still out past the end of their pass (the QR keeps working) */}
                          {item.facultyId && item.status === "EXITED" && delayMinutes(returnDueAt(item)) > 0 && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 whitespace-nowrap">
                              Delayed return · {formatDelay(delayMinutes(returnDueAt(item)))}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs text-zinc-500">
                          {desig} • Department of {dept}
                        </p>

                        {/* Request Meta */}
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl bg-zinc-950 p-3 text-xs">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <span className="shrink-0 text-zinc-500">Purpose:</span>
                            <span className="font-medium text-zinc-200 break-words">{item.purpose || "Official Duty"}</span>
                          </div>
                          <PassExtraDetails pass={item} className="w-full" />
                          {item.destination && (
                            <div className="flex items-start gap-1.5 min-w-0">
                              <span className="shrink-0 text-zinc-500">Destination:</span>
                              <span className="font-medium text-zinc-200 break-words">{item.destination}</span>
                            </div>
                          )}
                          <div className="flex items-start gap-1.5 text-zinc-500 min-w-0">
                            <Clock className="h-3.5 w-3.5 shrink-0 mt-px" />
                            <span>Requested: {formatDateTime(item.createdAt)}{scheduledNote(item)}</span>
                          </div>
                          {item.rejectionReason && (
                            <div className="font-medium text-red-400 break-words sm:col-span-2">
                              Reason: {item.rejectionReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    {item.status === "PENDING" && item.approvalMode === "BOTH" && item.deanApprovedAt && (
                      <div className="shrink-0 sm:self-center rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 w-fit">
                        ✓ You approved — waiting for the HOD
                      </div>
                    )}
                    {item.status === "PENDING" && !(item.approvalMode === "BOTH" && item.deanApprovedAt) && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0 sm:self-center sm:justify-end">
                        {item.approvalMode === "BOTH" && (
                          <span className="w-full sm:w-auto rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 text-center">
                            Needs HOD + Dean
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => setApproveModal({ id: item.id, name: facultyName })}
                          loading={isItemProcessing}
                          className="flex-1 sm:flex-none h-10 sm:h-9"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectModal({ id: item.id, name: facultyName })}
                          disabled={isItemProcessing}
                          className="flex-1 sm:flex-none h-10 sm:h-9 border-red-500/30 text-red-400 hover:bg-red-500/10"
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

      {/* Pagination (docked at the bottom of the screen) */}
      <PagerBar
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={filteredRequests.length}
        onPageChange={setCurrentPage}
        itemLabel="requests"
      />

      {/* Approve Modal with Validity Window */}
      {approveModal && (
        <Modal
          open={!!approveModal}
          onClose={() => setApproveModal(null)}
          title="Authorize Faculty Gate Pass"
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-300 leading-relaxed">
              You are authorizing the gate pass for <span className="font-medium text-zinc-100">{approveModal.name}</span>.
              A secure QR code credential will be issued.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="dean-pass-validity" className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Pass Validity Window (from approval)
              </label>
              <ThemedSelect
                id="dean-pass-validity"
                value={expiryMinutes}
                onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-sm text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
              >
                <option value={30}>30 Minutes</option>
                <option value={60}>1 Hour (Standard)</option>
                <option value={120}>2 Hours</option>
                <option value={240}>4 Hours</option>
                <option value={480}>8 Hours (Full Working Day)</option>
                <option value={720}>12 Hours</option>
              </ThemedSelect>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-11 sm:h-9 w-full sm:w-auto" onClick={() => setApproveModal(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="success"
                className="h-11 sm:h-9 w-full sm:w-auto"
                onClick={() => handleSingleApprove(approveModal.id, expiryMinutes)}
              >
                Confirm Approval & Issue QR
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <Modal
          open={!!rejectModal}
          onClose={() => {
            setRejectModal(null);
            setRejectReason("");
          }}
          title="Deny Faculty Gate Pass"
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-300 leading-relaxed">
              Provide a reason for rejecting the gate pass for{" "}
              <span className="font-medium text-zinc-100">{rejectModal.name}</span>.
            </p>

            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Schedule conflict with academic committee meeting..."
              rows={3}
            />

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-11 sm:h-9 w-full sm:w-auto" onClick={() => setRejectModal(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-11 sm:h-9 w-full sm:w-auto"
                disabled={!rejectReason.trim()}
                onClick={() => handleSingleReject(rejectModal.id, rejectReason)}
              >
                Confirm Denial
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Batch Reject Modal */}
      {batchRejectModal && (
        <Modal
          open={batchRejectModal}
          onClose={() => {
            setBatchRejectModal(false);
            setRejectReason("");
          }}
          title={`Deny ${selectedIds.size} Selected Passes`}
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-300 leading-relaxed">
              Provide a reason for denying the selected {selectedIds.size} faculty gate pass requests.
            </p>

            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. University-wide faculty convocation today..."
              rows={3}
            />

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-11 sm:h-9 w-full sm:w-auto" onClick={() => setBatchRejectModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-11 sm:h-9 w-full sm:w-auto"
                disabled={!rejectReason.trim()}
                onClick={handleBatchReject}
              >
                Deny All Selected
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

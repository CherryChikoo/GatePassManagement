"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, EmptyState, Modal, StatusBadge, Select } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { handleApproval, batchApproval } from "@/server/actions/approvals";
import { formatDate, formatDateTime } from "@/lib/utils";
import { getDepartmentCode } from "@/lib/constants";
import {
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  User,
  MapPin,
  Clock,
  Search,
  Briefcase,
  CheckSquare,
  Square,
  AlertTriangle,
  Building2,
  ArrowRight,
  Shield,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

export function DirectorRequestsClient() {
  const isReady = useStoreReady();
  const requests = useAppStore((s) => s.data.requests);
  const updateData = useAppStore((s) => s.updateData);

  const [activeTab, setActiveTab] = useState<"PENDING" | "ACCEPTED" | "REJECTED">("PENDING");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "HOD" | "FACULTY">("ALL");
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

  // Director sees passes for that day only (and pending requests awaiting action)
  const isTodayPass = (item: any) => {
    if (item.status === "PENDING") return true;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const exitDateStr = item.exitDate ? new Date(item.exitDate).toISOString().slice(0, 10) : "";
    const createdDateStr = item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : "";
    const approvedDateStr = item.approvedAt ? new Date(item.approvedAt).toISOString().slice(0, 10) : "";
    return exitDateStr === todayStr || createdDateStr === todayStr || approvedDateStr === todayStr;
  };

  const isHodItem = (item: any) => {
    return (
      item.faculty?.profile?.role === "FACULTY_ADMIN" ||
      item.faculty?.designation?.toLowerCase().includes("head") ||
      item.faculty?.designation?.toLowerCase().includes("hod")
    );
  };

  const todayRawRequests = rawRequests.filter(isTodayPass);

  const filteredRequests = todayRawRequests
    .filter((item: any) => {
      // Department filter
      if (selectedDept !== "ALL" && item.faculty?.department !== selectedDept) return false;

      // Role filter (HOD vs Faculty)
      const isHod = isHodItem(item);
      if (roleFilter === "HOD" && !isHod) return false;
      if (roleFilter === "FACULTY" && isHod) return false;

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
  const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE) || 1;
  const paginatedRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Tab counts
  const pendingCount = todayRawRequests.filter((r: any) => r.status === "PENDING").length;
  const acceptedCount = todayRawRequests.filter(
    (r: any) => r.status === "APPROVED" || r.status === "COMPLETED" || r.status === "EXITED"
  ).length;
  const rejectedCount = todayRawRequests.filter(
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
      const res = await handleApproval(id, "APPROVE", undefined, mins);
      if (res?.error) {
        // Rollback
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
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
      const res = await batchApproval(ids, "APPROVE");
      if (res?.success) {
        updateData("requests", (prev: any[]) =>
          (prev || []).map((p: any) => (ids.includes(p.id) ? { ...p, status: "APPROVED", approvedAt: now } : p))
        );
        setSelectedIds(new Set());
      } else {
        // Rollback
        setLocalOverrides((prev) => {
          const next = { ...prev };
          ids.forEach((id) => delete next[id]);
          return next;
        });
      }
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
      const res = await batchApproval(ids, "REJECT", rejectReason);
      if (res?.success) {
        updateData("requests", (prev: any[]) =>
          (prev || []).map((p: any) =>
            ids.includes(p.id) ? { ...p, status: "REJECTED", rejectedAt: now, rejectionReason: rejectReason } : p
          )
        );
        setSelectedIds(new Set());
        setRejectReason("");
      } else {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          ids.forEach((id) => delete next[id]);
          return next;
        });
      }
    } finally {
      setBatchProcessing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= 5) return prev; // max 5 batch
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5 flex-wrap">
            <span>Faculty Gate Pass Requests</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
              Director Authorization
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Today&apos;s Passes Only
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Review and authorize gate passes for HODs and faculty for today (un-exited passes expire at day end)
          </p>
        </div>

        {/* Batch Operations Toolbar (when pending items are selected) */}
        {selectedIds.size > 0 && activeTab === "PENDING" && (
          <div className="flex items-center gap-2 bg-zinc-900 border border-purple-500/30 p-1.5 rounded-xl animate-fade-in">
            <span className="text-xs font-semibold text-purple-300 px-2">
              {selectedIds.size} Selected (Max 5)
            </span>
            <Button
              size="sm"
              onClick={handleBatchApprove}
              loading={batchProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-semibold"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Approve All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBatchRejectModal(true)}
              disabled={batchProcessing}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 h-8 text-xs font-semibold"
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Reject All
            </Button>
          </div>
        )}
      </div>

      {/* Tabs & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          <button
            onClick={() => {
              setActiveTab("PENDING");
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "PENDING"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            Pending
            <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-bold">
              {pendingCount}
            </span>
          </button>
          <button
            onClick={() => {
              setActiveTab("ACCEPTED");
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "ACCEPTED"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            Approved
            <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-bold">
              {acceptedCount}
            </span>
          </button>
          <button
            onClick={() => {
              setActiveTab("REJECTED");
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "REJECTED"
                ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            Rejected
            <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-bold">
              {rejectedCount}
            </span>
          </button>
        </div>

        {/* Search & Department Filters */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <div className="relative min-w-[200px] sm:min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search faculty name, ID, purpose..."
              className="pl-9 h-9 text-xs bg-zinc-900/80 border-zinc-800 focus:border-purple-500/50"
            />
          </div>

          {/* Role Filter (All / HOD / Faculty) */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="ALL">All Roles (HOD & Faculty)</option>
            <option value="HOD">HODs Only</option>
            <option value="FACULTY">Faculty Only</option>
          </select>

          {departments.length > 0 && (
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Requests List */}
      {paginatedRequests.length === 0 ? (
        <EmptyState
          title={`No ${activeTab.toLowerCase()} requests`}
          description={
            searchQuery || selectedDept !== "ALL"
              ? "No faculty requests match your filter criteria."
              : `There are currently no ${activeTab.toLowerCase()} faculty gate pass requests.`
          }
          icon={<ClipboardCheck className="h-10 w-10 text-zinc-600" />}
        />
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
                className={`border-zinc-800/80 bg-zinc-900/60 hover:border-zinc-700 transition-all ${
                  isSelected ? "border-purple-500/50 bg-purple-950/10" : ""
                }`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Left: Checkbox + Profile */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      {activeTab === "PENDING" && (
                        <button
                          onClick={() => toggleSelect(item.id)}
                          className="mt-1 text-zinc-500 hover:text-purple-400 transition-colors shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-purple-400" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      )}

                      <div className="h-11 w-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 font-bold text-sm">
                        {facultyName
                          .split(" ")
                          .map((n: string) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-zinc-100 text-sm">{facultyName}</h3>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium">
                            {empId}
                          </span>
                          {isHodItem(item) ? (
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-sm">
                              <Shield className="h-3 w-3 text-amber-400" />
                              HOD
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 shadow-sm">
                              <Briefcase className="h-3 w-3 text-indigo-400" />
                              Faculty
                            </span>
                          )}
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            {getDepartmentCode(dept)}
                          </span>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          {desig} • Department of {dept}
                        </p>

                        {/* Request Meta */}
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1.5 text-zinc-300">
                            <span className="text-zinc-500 font-medium">Purpose:</span>
                            <span className="font-medium text-zinc-200">{item.purpose || "Official Duty"}</span>
                          </div>
                          {item.destination && (
                            <div className="flex items-center gap-1.5 text-zinc-300">
                              <span className="text-zinc-500 font-medium">Destination:</span>
                              <span className="font-medium text-zinc-200">{item.destination}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-zinc-400">
                            <Clock className="h-3.5 w-3.5 text-zinc-500" />
                            <span>Requested: {formatDateTime(item.createdAt)}</span>
                          </div>
                          {item.rejectionReason && (
                            <div className="text-red-400 font-medium">
                              Reason: {item.rejectionReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    {item.status === "PENDING" && (
                      <div className="flex items-center gap-2 shrink-0 sm:self-center">
                        <Button
                          size="sm"
                          onClick={() => setApproveModal({ id: item.id, name: facultyName })}
                          loading={isItemProcessing}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-8 text-xs px-3"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectModal({ id: item.id, name: facultyName })}
                          disabled={isItemProcessing}
                          className="border-red-500/40 text-red-400 hover:bg-red-500/10 font-semibold h-8 text-xs px-3"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-800 pt-4 text-xs text-zinc-400">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
            {Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length} requests
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="h-8 text-xs"
            >
              Previous
            </Button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="h-8 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Approve Modal with Validity Window */}
      {approveModal && (
        <Modal
          open={!!approveModal}
          onClose={() => setApproveModal(null)}
          title="Authorize Faculty Gate Pass"
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              You are authorizing the gate pass for <span className="font-bold text-zinc-100">{approveModal.name}</span>.
              A secure QR code credential will be issued.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400 block">
                Pass Validity Window (from approval)
              </label>
              <select
                value={expiryMinutes}
                onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                className="w-full h-10 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value={30}>30 Minutes</option>
                <option value={60}>1 Hour (Standard)</option>
                <option value={120}>2 Hours</option>
                <option value={240}>4 Hours</option>
                <option value={480}>8 Hours (Full Working Day)</option>
                <option value={720}>12 Hours</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setApproveModal(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
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
            <p className="text-sm text-zinc-300">
              Provide a reason for rejecting the gate pass for{" "}
              <span className="font-bold text-zinc-100">{rejectModal.name}</span>.
            </p>

            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Mandatory lecture scheduled, please reschedule..."
              rows={3}
              className="text-xs"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setRejectModal(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-semibold"
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
            <p className="text-sm text-zinc-300">
              Provide a reason for denying the selected {selectedIds.size} faculty gate pass requests.
            </p>

            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Official campus meeting scheduled at this time..."
              rows={3}
              className="text-xs"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setBatchRejectModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-semibold"
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

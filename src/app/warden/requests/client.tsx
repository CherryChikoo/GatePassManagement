"use client";

import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, EmptyState, Modal, Badge, StatusBadge } from "@/components/ui/primitives";
import { logoutAction } from "@/server/actions/auth";
import { handleApproval, batchApproval } from "@/server/actions/approvals";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  User,
  MapPin,
  Clock,
  FileText,
  ArrowLeft,
  Check,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

export function WardenRequestsClient({ user }: Props) {
  const isReady = useStoreReady();
  const requestsData = useAppStore((s) => s.data.requests);
  const updateData = useAppStore((s) => s.updateData);

  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "ACCEPTED" | "REJECTED">("PENDING");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [approveModal, setApproveModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState<number>(60);
  const [batchProcessing, setBatchProcessing] = useState(false);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < 5) next.add(id);
    setSelected(next);
  };

  if (!isReady || requestsData === undefined) {
    return <DashboardSkeleton />;
  }

  const requests = requestsData || [];

  const filteredRequests = requests.filter((item: any) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "PENDING") return item.status === "PENDING";
    if (activeTab === "ACCEPTED") return item.status === "APPROVED" || item.status === "COMPLETED" || item.status === "EXITED";
    if (activeTab === "REJECTED") return item.status === "REJECTED";
    return true;
  });

  const pendingItems = filteredRequests.filter((r: any) => r.status === "PENDING");

  const selectAll = () => {
    if (selected.size === Math.min(pendingItems.length, 5)) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingItems.slice(0, 5).map((r: any) => r.id)));
    }
  };

  async function handleSingleApprove() {
    if (!approveModal) return;
    const requestId = approveModal.id;
    setProcessing(requestId);
    
    // Optimistic UI Update
    updateData("requests", (old: any) => 
      (old || []).map((r: any) => r.id === requestId ? { ...r, status: "APPROVED" } : r)
    );

    try {
      await handleApproval(requestId, "APPROVE", undefined, expiryMinutes);
      useAppStore.getState().refresh(true);
    } catch {
      updateData("requests", (old: any) => 
        (old || []).map((r: any) => r.id === requestId ? { ...r, status: "PENDING" } : r)
      );
    } finally {
      setProcessing(null);
      setApproveModal(null);
      setExpiryMinutes(60);
    }
  }

  async function handleSingleReject() {
    if (!rejectModal) return;
    const requestId = rejectModal.id;
    setProcessing(requestId);
    
    // Optimistic Update
    updateData("requests", (old: any) => 
      (old || []).map((r: any) => r.id === requestId ? { ...r, status: "REJECTED", rejectionReason: rejectReason } : r)
    );

    try {
      await handleApproval(requestId, "REJECT", rejectReason);
      useAppStore.getState().refresh(true);
    } catch {
      updateData("requests", (old: any) => 
        (old || []).map((r: any) => r.id === requestId ? { ...r, status: "PENDING", rejectionReason: null } : r)
      );
    } finally {
      setProcessing(null);
      setRejectModal(null);
      setRejectReason("");
    }
  }

  async function handleBatchApprove() {
    if (selected.size === 0) return;
    setBatchProcessing(true);
    
    const selectedIds = Array.from(selected);
    
    updateData("requests", (old: any) => 
      (old || []).map((r: any) => selectedIds.includes(r.id) ? { ...r, status: "APPROVED" } : r)
    );

    try {
      await batchApproval(selectedIds, "APPROVE");
      useAppStore.getState().refresh(true);
    } catch {
      updateData("requests", (old: any) => 
        (old || []).map((r: any) => selectedIds.includes(r.id) ? { ...r, status: "PENDING" } : r)
      );
    } finally {
      setBatchProcessing(false);
      setSelected(new Set());
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <BackButton href="/warden" label="Back to Dashboard" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Student Requests
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Manage and review all hostel permission requests
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none w-full sm:w-auto">
               {(["ALL", "PENDING", "ACCEPTED", "REJECTED"] as const).map((tab) => (
                  <button
                     key={tab}
                     onClick={() => setActiveTab(tab)}
                     className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                        activeTab === tab 
                          ? "bg-zinc-100 text-zinc-900 border-zinc-200"
                          : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                     }`}
                  >
                     {tab === "ALL" ? "All Requests" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
               ))}
            </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-3 animate-fade-in">
              <Badge variant="info">{selected.size} selected</Badge>
              <Button
                variant="success"
                size="sm"
                loading={batchProcessing}
                onClick={handleBatchApprove}
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve {selected.size}
              </Button>
            </div>
          )}
          </div>
        </div>

        {activeTab === "PENDING" && pendingItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {selected.size === Math.min(pendingItems.length, 5)
                ? "Deselect all"
                : `Select all (max 5)`}
            </button>
          </div>
        )}

        {filteredRequests.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-8 w-8" />}
            title={activeTab === "ALL" ? "No requests found" : activeTab === "PENDING" ? "All Caught Up!" : "No requests"}
            description={
              activeTab === "PENDING"
                ? "No pending permission requests from your students."
                : `No ${activeTab.toLowerCase().replace('_', ' ')} requests found.`
            }
          />
        ) : (
          <div className="space-y-4">
            
    {(() => {
      const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE) || 1;
      const paginatedRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
      return (
        <>
          {paginatedRequests.map((req: any) => (
    
              <Card key={req.id} glow className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 p-4 sm:p-6">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {req.status === "PENDING" && (
                        <button
                          onClick={() => toggleSelect(req.id)}
                          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                            selected.has(req.id)
                              ? "border-amber-500 bg-amber-600 text-white"
                              : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                          }`}
                        >
                          {selected.has(req.id) && <Check className="h-3 w-3" />}
                        </button>
                      )}

                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-zinc-200 truncate">
                                {req.student.profile.name}
                              </p>
                              <Badge variant={req.type === "EXIT" ? "warning" : "success"}>
                                {req.type || "EXIT"}
                              </Badge>
                            </div>
                            <p className="text-xs text-zinc-500 truncate">
                              {req.student.studentRoll}
                              {req.student.roomNumber && ` • Room ${req.student.roomNumber}`}
                              {req.student.hostelBlock && ` • Block ${req.student.hostelBlock}`}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="flex items-center gap-2 text-sm text-zinc-400 min-w-0">
                            <FileText className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                            <span className="truncate">{req.purpose}</span>
                          </div>
                          {req.destination && (
                            <div className="flex items-center gap-2 text-sm text-zinc-400 min-w-0">
                              <MapPin className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                              <span className="truncate">{req.destination}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-zinc-400 min-w-0">
                            <Clock className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                            <span className="truncate">{formatDate(req.exitDate)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                      {req.status === "PENDING" ? (
                        <div className="flex sm:flex-col items-center gap-2 w-full sm:w-auto">
                          <Button
                            variant="success"
                            size="sm"
                            className="flex-1 sm:flex-none w-full sm:w-auto"
                            onClick={() =>
                              setApproveModal({ id: req.id, name: req.student.profile.name })
                            }
                            loading={processing === req.id}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="flex-1 sm:flex-none w-full sm:w-auto"
                            onClick={() =>
                              setRejectModal({ id: req.id, name: req.student.profile.name })
                            }
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                          <StatusBadge status={req.status} />
                          {req.qr?.usedForExit && (
                            <span className="text-[10px] text-zinc-400 font-medium">
                              {req.qr?.usedForEntry ? "Returned" : "Exited"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        );
      })()}

      {/* Pagination Controls */}
      {filteredRequests.length > PAGE_SIZE && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4 border-t border-zinc-800/50 mt-4">
          <p className="text-xs sm:text-sm text-zinc-400">
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length} records
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-zinc-700 bg-zinc-800 rounded-md disabled:opacity-50 text-white transition-colors hover:bg-zinc-700"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredRequests.length / PAGE_SIZE), p + 1))}
              disabled={currentPage === Math.ceil(filteredRequests.length / PAGE_SIZE)}
              className="px-3 py-1 text-sm border border-zinc-700 bg-zinc-800 rounded-md disabled:opacity-50 text-white transition-colors hover:bg-zinc-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
          </div>
        )}
      </div>

      <Modal
        open={!!approveModal}
        onClose={() => {
          setApproveModal(null);
          setExpiryMinutes(60);
        }}
        title="Approve Gate Pass"
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-zinc-300">
            Set the QR Code validity window for <strong>{approveModal?.name}</strong>. If they do not scan out at the gate within this timeframe, the QR code will expire.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
             {[15, 30, 60, 120].map((min) => (
                <button
                   key={min}
                   onClick={() => setExpiryMinutes(min)}
                   className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                     expiryMinutes === min
                       ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                       : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                   }`}
                >
                   {min === 60 ? "1 Hour" : min === 120 ? "2 Hours" : `${min} Mins`}
                </button>
             ))}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setApproveModal(null);
                setExpiryMinutes(60);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              loading={!!processing}
              onClick={handleSingleApprove}
            >
              Confirm Approval
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectReason(""); }}
        title="Reject Request"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Reject the request from{" "}
            <span className="text-zinc-200 font-medium">{rejectModal?.name}</span>?
          </p>
          <Textarea
            label="Reason"
            placeholder="Provide a reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            id="warden-reject-reason"
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setRejectModal(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSingleReject} loading={!!processing}>
              Confirm Reject
            </Button>
          </div>
        </div>
      </Modal>
    
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, EmptyState, Modal, StatusBadge } from "@/components/ui/primitives";
import { handleApproval } from "@/server/actions/approvals";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  User,
  MapPin,
  Clock,
  FileText,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { TopLoadingBar } from "@/components/ui/top-loading-bar";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

export function FacultyRequestsClient({ user }: Props) {
  const isReady = useStoreReady();
  const requestsData = useAppStore((s) => s.data.requests);
  const updateData = useAppStore((s) => s.updateData);
  
  const [localOverrides, setLocalOverrides] = useState<Record<string, { status: string; approvedAt?: string; rejectedAt?: string; rejectionReason?: string }>>({});
  const [activeTab, setActiveTab] = useState<"PENDING" | "ACCEPTED" | "REJECTED">("PENDING");
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [approveModal, setApproveModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState<number>(60);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  if (!isReady || !requestsData) {
    return <DashboardSkeleton />;
  }

  const rawRequests = (requestsData || []).map((r: any) => {
    if (localOverrides[r.id]) {
      return { ...r, ...localOverrides[r.id] };
    }
    return r;
  });
  
  const filteredRequests = rawRequests
    .filter((item: any) => {
      if (activeTab === "PENDING") return item.status === "PENDING";
      if (activeTab === "ACCEPTED") return item.status === "APPROVED" || item.status === "COMPLETED" || item.status === "EXITED";
      if (activeTab === "REJECTED") return item.status === "REJECTED" || item.status === "CANCELLED" || item.status === "EXPIRED";
      return true;
    })
    .sort((a: any, b: any) => {
      if (activeTab === "ACCEPTED") {
        const timeA = new Date(a.approvedAt || a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.approvedAt || b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      }
      if (activeTab === "REJECTED") {
        const timeA = new Date(a.rejectedAt || a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.rejectedAt || b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const pendingCount = rawRequests.filter((r: any) => r.status === "PENDING").length;
  const acceptedCount = rawRequests.filter(
    (r: any) => r.status === "APPROVED" || r.status === "COMPLETED" || r.status === "EXITED"
  ).length;
  const rejectedCount = rawRequests.filter(
    (r: any) => r.status === "REJECTED" || r.status === "CANCELLED" || r.status === "EXPIRED"
  ).length;

  async function handleSingleApprove() {
    if (!approveModal) return;
    
    const requestId = approveModal.id;
    const nowIso = new Date().toISOString();

    setLocalOverrides((prev) => ({
      ...prev,
      [requestId]: { status: "APPROVED", approvedAt: nowIso },
    }));

    setProcessing(prev => new Set([...prev, requestId]));
    setApproveModal(null);
    
    // Optimistic UI update in Zustand
    updateData("requests", (old: any) => 
      (old || []).map((r: any) => r.id === requestId ? { ...r, status: "APPROVED", approvedAt: nowIso } : r)
    );

    try {
      const result = await handleApproval(requestId, "APPROVE", undefined, expiryMinutes);
      if (result?.error) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[requestId];
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
        delete next[requestId];
        return next;
      });
      alert("Failed to approve request");
      useAppStore.getState().refresh(true);
    } finally {
      setProcessing(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
      setExpiryMinutes(60);
    }
  }

  async function handleSingleReject() {
    if (!rejectModal) return;
    
    const requestId = rejectModal.id;
    const nowIso = new Date().toISOString();

    setLocalOverrides((prev) => ({
      ...prev,
      [requestId]: { status: "REJECTED", rejectedAt: nowIso, rejectionReason: rejectReason || "Request denied" },
    }));

    setProcessing(prev => new Set([...prev, requestId]));
    setRejectModal(null);
    
    // Optimistic UI update in Zustand
    updateData("requests", (old: any) => 
      (old || []).map((r: any) => r.id === requestId ? { ...r, status: "REJECTED", rejectedAt: nowIso, rejectionReason: rejectReason || "Request denied" } : r)
    );

    try {
      const result = await handleApproval(requestId, "REJECT", rejectReason);
      if (result?.error) {
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[requestId];
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
        delete next[requestId];
        return next;
      });
      alert("Failed to reject request");
      useAppStore.getState().refresh(true);
    } finally {
      setProcessing(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
      setRejectReason("");
    }
  }

  return (
    <>
      <TopLoadingBar active={processing.size > 0} />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <BackButton href="/faculty" label="Back to Dashboard" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Student Requests
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            {(["PENDING", "ACCEPTED", "REJECTED"] as const).map((tab) => {
              const count =
                tab === "PENDING"
                  ? pendingCount
                  : tab === "ACCEPTED"
                  ? acceptedCount
                  : rejectedCount;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setCurrentPage(1);
                  }}
                  className={`text-xs font-medium px-4 py-2 rounded-lg border transition-colors ${
                    activeTab === tab 
                      ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
                      : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  {count > 0 && (
                    <span className={`ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      activeTab === tab ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-8 w-8" />}
            title="No requests"
            description={`No ${activeTab.toLowerCase()} requests found.`}
          />
        ) : (
          <div className="space-y-3">
            {(() => {
              const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE) || 1;
              const paginatedRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
              return (
                <>
                  {paginatedRequests.map((req: any) => {
                    const isProcessing = processing.has(req.id);
              
              return (
                <Card 
                  key={req.id} 
                  className={`overflow-hidden transition-all ${
                    isProcessing ? 'opacity-60 pointer-events-none' : 'hover:border-zinc-600'
                  }`}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                      <div className="flex-1 space-y-3">
                        {/* Student Info */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                            <User className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-zinc-100">
                                {req.student.profile.name}
                              </p>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider bg-blue-500/15 text-blue-300 border-blue-500/30">
                                Student Division
                              </span>
                              {req.student.studentRoll && (
                                <span className="text-[11px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50">
                                  {req.student.studentRoll}
                                </span>
                              )}
                              {req.student.department && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
                                  Dept: {req.student.department}
                                </span>
                              )}
                              {activeTab === "ACCEPTED" && req.approvedAt && (() => {
                                const isRecent = (Date.now() - new Date(req.approvedAt).getTime()) < 24 * 60 * 60 * 1000;
                                return isRecent ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 animate-pulse">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    Recently Accepted
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Visual Division separator */}
                        <div className="my-2 border-t border-zinc-800/60" />

                        {/* Details */}
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-zinc-500 mt-0.5" />
                            <span className="text-zinc-300">{req.purpose}</span>
                          </div>
                          
                          {req.destination && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-zinc-500" />
                              <span className="text-zinc-400">{req.destination}</span>
                            </div>
                          )}
                          
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-zinc-500" />
                              <span>
                                {formatDate(req.exitDate)} at {req.expectedExit && formatDateTime(req.expectedExit).split(',')[1]?.trim()}
                              </span>
                            </div>

                            {activeTab === "ACCEPTED" && (req.approvedAt || req.updatedAt) && (
                              <div className="flex items-center gap-1.5 text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Accepted: {formatDateTime(req.approvedAt || req.updatedAt)}</span>
                              </div>
                            )}

                            {activeTab === "REJECTED" && (
                              <div className="flex items-center gap-1.5 text-red-400 font-medium bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                                <XCircle className="h-3.5 w-3.5 text-red-400" />
                                <span>Rejected: {req.rejectionReason || "Denied"} {req.rejectedAt ? `• ${formatDateTime(req.rejectedAt)}` : ""}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                        {req.status === "PENDING" && !isProcessing ? (
                          <div className="flex sm:flex-col items-center gap-2 w-full sm:w-auto">
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => setApproveModal({ id: req.id, name: req.student.profile.name })}
                              className="flex-1 sm:flex-none w-full sm:w-auto sm:min-w-[100px] shadow-none bg-emerald-600 hover:bg-emerald-500"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Accept
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setRejectModal({ id: req.id, name: req.student.profile.name })}
                              className="flex-1 sm:flex-none w-full sm:w-auto sm:min-w-[100px] shadow-none bg-zinc-800 text-red-400 hover:bg-red-950 hover:text-red-300 border border-zinc-700"
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        ) : isProcessing ? (
                          <div className="min-w-[100px] h-9 flex items-center justify-center">
                            <div className="h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                            <StatusBadge status={req.status} />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
                </>
              );
            })()}
          </div>
        )}

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

      {/* Approve Modal */}
      <Modal
        open={!!approveModal}
        onClose={() => {
          setApproveModal(null);
          setExpiryMinutes(60);
        }}
        title="Approve Request"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Approve request from <span className="font-semibold text-blue-400">{approveModal?.name}</span>?
          </p>
          
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              QR Code Validity
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[15, 30, 60, 120].map((min) => (
                <button
                  key={min}
                  onClick={() => setExpiryMinutes(min)}
                  className={`px-3 py-2 text-sm font-semibold rounded-lg border-2 transition-all ${
                    expiryMinutes === min
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                      : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {min === 60 ? "1 Hr" : min === 120 ? "2 Hrs" : `${min}m`}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setApproveModal(null)}>
              Cancel
            </Button>
            <Button variant="success" onClick={handleSingleApprove}>
              Approve
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={!!rejectModal}
        onClose={() => {
          setRejectModal(null);
          setRejectReason("");
        }}
        title="Reject Request"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Reject request from <span className="font-semibold text-red-400">{rejectModal?.name}</span>?
          </p>
          
          <Textarea
            label="Reason for Rejection"
            placeholder="e.g., Insufficient notice, conflicting schedule..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            required
          />
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectModal(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleSingleReject}
              disabled={!rejectReason.trim()}
            >
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

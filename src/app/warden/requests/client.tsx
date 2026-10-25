"use client";

import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, EmptyState, Modal, Badge, StatusBadge } from "@/components/ui/primitives";
import { delayMinutes, formatDelay, returnDueAt } from "@/lib/passes/return-scan";
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
import { PassExtraDetails } from "@/components/passes/pass-extra";
import { PagerBar } from "@/components/ui/pager-bar";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

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

export function WardenRequestsClient({ user }: Props) {
  const isReady = useStoreReady();
  const requestsData = useAppStore((s) => s.data.requests);
  const updateData = useAppStore((s) => s.updateData);
  // Result of an approve / reject that needs attention (shown above the list)
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);

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
    const before = snapshotRequests();

    // Optimistic UI Update (put back if the server refuses)
    updateData("requests", (old: any) =>
      (old || []).map((r: any) => r.id === requestId ? { ...r, status: "APPROVED" } : r)
    );

    try {
      const res = await handleApproval(requestId, "APPROVE", undefined, expiryMinutes);
      if (res?.error) {
        restoreRequests(before);
        setNotice({ tone: "error", text: res.error });
      }
      useAppStore.getState().refresh(true);
    } catch {
      restoreRequests(before);
      setNotice({ tone: "error", text: "Could not approve. Check the connection and try again." });
    } finally {
      setProcessing(null);
      setApproveModal(null);
      setExpiryMinutes(60);
    }
  }

  async function handleSingleReject() {
    if (!rejectModal) return;
    // The Reject button stays off until a reason is typed
    if (!rejectReason.trim()) return;
    const requestId = rejectModal.id;
    setProcessing(requestId);
    const before = snapshotRequests();

    // Optimistic Update (put back if the server refuses)
    updateData("requests", (old: any) =>
      (old || []).map((r: any) => r.id === requestId ? { ...r, status: "REJECTED", rejectionReason: rejectReason } : r)
    );

    try {
      const res = await handleApproval(requestId, "REJECT", rejectReason);
      if (res?.error) {
        restoreRequests(before);
        setNotice({ tone: "error", text: res.error });
      }
      useAppStore.getState().refresh(true);
    } catch {
      restoreRequests(before);
      setNotice({ tone: "error", text: "Could not reject. Check the connection and try again." });
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
    const before = snapshotRequests();

    updateData("requests", (old: any) =>
      (old || []).map((r: any) => selectedIds.includes(r.id) ? { ...r, status: "APPROVED" } : r)
    );

    try {
      const res: any = await batchApproval(selectedIds, "APPROVE");
      if (!res?.success) {
        // Back to the saved state; the refresh shows the ones that did go through
        restoreRequests(before);
        setNotice({ tone: "error", text: res?.error || "Some requests could not be approved." });
      }
      useAppStore.getState().refresh(true);
    } catch {
      restoreRequests(before);
      setNotice({ tone: "error", text: "Could not save. Check the connection and try again." });
    } finally {
      setBatchProcessing(false);
      setSelected(new Set());
    }
  }

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8">
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
        <div className="min-w-0">
          <BackButton href="/warden" label="Back to Dashboard" className="-ml-3 mb-2" />
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
            Student Requests
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Today&apos;s hostel permission requests. Past requests are in the Activity tab.
          </p>
        </div>

        {/* Toolbar: filter + selection */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            className="inline-flex max-w-full self-start rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
            role="tablist"
            aria-label="Filter requests"
          >
            {(["ALL", "PENDING", "ACCEPTED", "REJECTED"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
                className={`text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                  activeTab === tab ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {tab === "ALL" ? "All Requests" : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 min-h-10">
            {activeTab === "PENDING" && pendingItems.length > 0 && (
              <button
                onClick={selectAll}
                className="h-10 px-1 text-xs font-medium text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                {selected.size === Math.min(pendingItems.length, 5)
                  ? "Deselect all"
                  : `Select all (max 5)`}
              </button>
            )}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 animate-fade-in">
                <Badge>{selected.size} selected</Badge>
                <Button
                  variant="success"
                  size="sm"
                  className="h-10 sm:h-9"
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

        {filteredRequests.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ClipboardCheck className="h-8 w-8" />}
              title={activeTab === "ALL" ? "No requests found" : activeTab === "PENDING" ? "All Caught Up!" : "No requests"}
              description={
                activeTab === "PENDING"
                  ? "No pending permission requests from your students."
                  : `No ${activeTab.toLowerCase().replace('_', ' ')} requests found.`
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-zinc-800/70">
              {(() => {
                const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE) || 1;
                const paginatedRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
                return (
                  <>
                    {paginatedRequests.map((req: any) => (
                      <li
                        key={req.id}
                        className={`p-4 sm:p-5 transition-colors ${selected.has(req.id) ? "bg-orange-500/5" : ""}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              {req.status === "PENDING" && (
                                <button
                                  type="button"
                                  onClick={() => toggleSelect(req.id)}
                                  aria-pressed={selected.has(req.id)}
                                  aria-label={`Select ${req.student.profile.name}`}
                                  className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-zinc-950 transition-colors"
                                >
                                  <span
                                    className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                                      selected.has(req.id)
                                        ? "border-orange-600 bg-orange-600 text-white"
                                        : "border-zinc-700 bg-zinc-900"
                                    }`}
                                  >
                                    {selected.has(req.id) && <Check className="h-3 w-3" />}
                                  </span>
                                </button>
                              )}

                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 font-semibold">
                                {(req.student.profile.name || "S").charAt(0).toUpperCase()}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-sm font-medium text-zinc-100 truncate">
                                    {req.student.profile.name}
                                  </p>
                                  <Badge variant={req.type === "EXIT" ? "warning" : "success"} className="shrink-0">
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

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-zinc-950 px-3.5 py-3">
                              <div className="flex items-center gap-2 text-sm text-zinc-300 min-w-0">
                                <FileText className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                                <span className="truncate">{req.purpose}</span>
                              </div>
                              {req.destination && (
                                <div className="flex items-center gap-2 text-sm text-zinc-300 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                                  <span className="truncate">{req.destination}</span>
                                </div>
                              )}
                              <PassExtraDetails pass={req} className="sm:col-span-2" />
                              <div className="flex items-center gap-2 text-sm text-zinc-300 min-w-0">
                                <Clock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                                <span className="truncate">{formatDate(req.exitDate)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 sm:w-36">
                            {req.status === "PENDING" ? (
                              <div className="flex sm:flex-col gap-2">
                                <Button
                                  variant="success"
                                  size="sm"
                                  className="flex-1 sm:flex-none w-full h-10"
                                  onClick={() =>
                                    setApproveModal({ id: req.id, name: req.student.profile.name })
                                  }
                                  loading={processing === req.id}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 sm:flex-none w-full h-10 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
                                  onClick={() =>
                                    setRejectModal({ id: req.id, name: req.student.profile.name })
                                  }
                                >
                                  <XCircle className="h-4 w-4" />
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1.5">
                                <StatusBadge status={req.status} />
                                {req.qr?.usedForExit && (
                                  <span className="text-[11px] font-medium text-zinc-500">
                                    {req.qr?.usedForEntry ? "Returned" : "Exited"}
                                  </span>
                                )}
                                {/* Still out past the planned return (the return QR keeps working) */}
                                {req.status === "EXITED" && !req.qr?.usedForEntry && delayMinutes(returnDueAt(req)) > 0 && (
                                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 whitespace-nowrap">
                                    Delayed return · {formatDelay(delayMinutes(returnDueAt(req)))}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </>
                );
              })()}
            </ul>
          </Card>
        )}

        <PagerBar
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={filteredRequests.length}
          onPageChange={setCurrentPage}
          itemLabel="requests"
        />
      </div>

      <Modal
        open={!!approveModal}
        onClose={() => {
          setApproveModal(null);
          setExpiryMinutes(60);
        }}
        title="Approve Gate Pass"
      >
        <div className="space-y-5">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Set the QR Code validity window for <strong className="font-medium text-zinc-100">{approveModal?.name}</strong>. If they do not scan out at the gate within this timeframe, the QR code will expire.
          </p>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">QR valid for</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[15, 30, 60, 120].map((min) => (
                <button
                  key={min}
                  type="button"
                  aria-pressed={expiryMinutes === min}
                  onClick={() => setExpiryMinutes(min)}
                  className={`h-11 px-3 text-sm font-medium rounded-full border transition-colors ${
                    expiryMinutes === min
                      ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-950 hover:border-zinc-700"
                  }`}
                >
                  {min === 60 ? "1 Hour" : min === 120 ? "2 Hours" : `${min} Mins`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setApproveModal(null);
                setExpiryMinutes(60);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              className="w-full sm:w-auto"
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
        <div className="space-y-5">
          <p className="text-sm text-zinc-400">
            Reject the request from{" "}
            <span className="text-zinc-100 font-medium">{rejectModal?.name}</span>?
          </p>
          <Textarea
            label="Reason"
            placeholder="Provide a reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            id="warden-reject-reason"
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setRejectModal(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleSingleReject} loading={!!processing} disabled={!rejectReason.trim()}>
              Confirm Reject
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

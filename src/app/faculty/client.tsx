"use client";

import { StatCard, StatusBadge } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";
import { formatDateTime } from "@/lib/utils";
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/primitives";
import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

export function FacultyDashboardClient({ user }: Props) {
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "ACCEPTED" | "REJECTED">("ALL");
  
  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  if (!dashboardData) {
    return (
        <p className="text-zinc-500">Faculty record not found.</p>
    );
  }

  const { faculty, stats, recentActivity, studentMovements } = dashboardData;

  const filteredActivity = recentActivity?.filter((item: any) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "PENDING") return item.status === "PENDING";
    if (activeTab === "ACCEPTED") return item.status === "APPROVED" || item.status === "COMPLETED" || item.status === "EXITED";
    if (activeTab === "REJECTED") return item.status === "REJECTED";
    return true;
  }).slice(0, 10) || [];

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Faculty Dashboard
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {faculty.department || "Department"}{" "}
              {faculty.designation ? `• ${faculty.designation}` : ""}
            </p>
          </div>
        </div>

        {/* Stats - 5 cards with Exits and Entries */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard
            title="Total Students"
            value={stats.totalStudents}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            title="Approved Today"
            value={stats.approvedToday}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          />
          <StatCard
            title="Rejected Today"
            value={stats.rejectedToday}
            icon={<XCircle className="h-5 w-5 text-red-400" />}
          />
          <StatCard
            title="Exits Today"
            value={stats.exitsToday}
            icon={<MapPin className="h-5 w-5 text-orange-400" />}
          />
          <StatCard
            title="Entries Today"
            value={stats.entriesToday}
            icon={<MapPin className="h-5 w-5 text-blue-400" />}
          />
        </div>

        {/* Requests */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Requests</CardTitle>
            <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none">
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
          </CardHeader>
          <CardContent>
            {filteredActivity.length === 0 ? (
              <p className="text-center text-sm text-zinc-500 py-8">
                No {activeTab === "ALL" ? "recent" : activeTab.toLowerCase().replace('_', ' ')} requests found.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredActivity.map((item: any) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedActivity(item)}
                    className="flex items-center justify-between rounded-xl bg-zinc-800/30 px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200">
                        {item.student?.profile?.name || "Student"} —{" "}
                        {item.student?.studentRoll || ""}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {item.purpose} •{" "}
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={item.status} />
                      {item.qr?.usedForExit && (
                        <span className="text-[10px] text-zinc-400">
                          {item.qr?.usedForEntry ? "Returned" : "Exited"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <Modal
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        title="Request Details"
      >
        {selectedActivity && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Student</p>
                <p className="text-sm text-zinc-200">{selectedActivity.student?.profile?.name}</p>
                <p className="text-xs text-zinc-400">{selectedActivity.student?.studentRoll}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Status</p>
                <StatusBadge status={selectedActivity.status} />
              </div>
              <div className="col-span-2">
                <p className="text-xs text-zinc-500 mb-1">Purpose</p>
                <p className="text-sm text-zinc-200">{selectedActivity.purpose}</p>
              </div>
              {selectedActivity.destination && (
                <div className="col-span-2">
                  <p className="text-xs text-zinc-500 mb-1">Destination</p>
                  <p className="text-sm text-zinc-200">{selectedActivity.destination}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-zinc-500 mb-1">Expected Exit</p>
                <p className="text-sm text-zinc-200">
                  {selectedActivity.expectedExit ? formatDateTime(selectedActivity.expectedExit) : "None"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Expected Return</p>
                <p className="text-sm text-zinc-200">
                  {selectedActivity.expectedReturn ? formatDateTime(selectedActivity.expectedReturn) : "None"}
                </p>
              </div>
              {selectedActivity.qr?.usedForExit && (
                <div className="col-span-2 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                   <p className="text-xs text-zinc-400 mb-1 flex items-center gap-2"><MapPin className="h-3 w-3" /> Gate Scan Status</p>
                   <p className="text-sm text-zinc-200">
                     {selectedActivity.qr.usedForEntry 
                       ? "Student has exited and returned."
                       : "Student is currently outside."}
                   </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    
    </>
  );
}

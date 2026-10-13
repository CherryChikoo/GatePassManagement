"use client";

import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

import React, { useState } from "react";
import { StatCard, StatusBadge, Modal } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logoutAction } from "@/server/actions/auth";
import { formatDateTime } from "@/lib/utils";
import {
  Users,
  GraduationCap,
  BookOpen,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  DoorOpen,
  DoorClosed,
} from "lucide-react";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

export function AdminDashboardClient({ user }: Props) {
  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  const { stats, recentMovements } = dashboardData || { stats: {}, recentMovements: [] };

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Admin Dashboard
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            System-wide overview and management
          </p>
        </div>

        {/* Top-level stats */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100 font-heading border-b border-zinc-800/50 pb-2">User Demographics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Total Students"
              value={stats.totalStudents}
              icon={<GraduationCap className="h-5 w-5" />}
            />
            <StatCard
              title="Faculty"
              value={stats.totalFaculty}
              icon={<BookOpen className="h-5 w-5" />}
            />
            <StatCard
              title="Wardens"
              value={stats.totalWardens}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              title="Security Staff"
              value={stats.totalSecurity}
              icon={<Shield className="h-5 w-5" />}
            />
          </div>
        </div>

        {/* Permission stats */}
        <div className="space-y-4 mt-8">
          <h2 className="text-lg font-semibold text-zinc-100 font-heading border-b border-zinc-800/50 pb-2">Daily Operations</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard
            title="Outsider Visits"
            value={stats.outsidersCount}
            icon={<Users className="h-5 w-5 text-indigo-500" />}
          />
          <StatCard
            title="Approved Today"
            value={stats.approvedToday}
            icon={<CheckCircle2 className="h-5 w-5 text-blue-500" />}
          />
          <StatCard
            title="Rejected Today"
            value={stats.rejectedToday}
            icon={<XCircle className="h-5 w-5 text-red-500" />}
          />
          <StatCard
            title="Entry Today"
            value={stats.entryToday}
            icon={<DoorClosed className="h-5 w-5 text-emerald-500" />}
          />
          <StatCard
            title="Exit Today"
            value={stats.exitToday}
            icon={<DoorOpen className="h-5 w-5 text-orange-500" />}
          />
        </div>
        </div>


        {/* Recent Movements */}
        <Card>
          <CardHeader>
            <CardTitle>Live Movement Feed</CardTitle>
          </CardHeader>
          <CardContent>
            {recentMovements.length === 0 ? (
              <p className="text-center text-sm text-zinc-500 py-8">
                No movements recorded today.
              </p>
            ) : (
              <div className="space-y-2">
                {recentMovements.map((mov: any) => (
                  <div
                    key={mov.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 rounded-xl bg-zinc-800/30 p-3 sm:px-4 sm:py-3 table-row-hover transition-colors cursor-pointer"
                    onClick={() => setSelectedRecord(mov)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`rounded-lg p-1.5 shrink-0 ${
                          mov.type === "EXIT"
                            ? "bg-orange-500/15 text-orange-400"
                            : "bg-blue-500/15 text-blue-400"
                        }`}
                      >
                        {mov.type === "EXIT" ? (
                          <DoorOpen className="h-4 w-4" />
                        ) : (
                          <DoorClosed className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {mov.student?.profile?.name || "Unknown"} —{" "}
                          {mov.student?.studentRoll || ""}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">
                          Gate: {mov.gate?.name || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                      <span className="text-xs text-zinc-500">
                        {formatDateTime(mov.createdAt)}
                      </span>
                      <StatusBadge status={mov.type} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Record Details Modal */}
      <Modal
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title="Movement Details"
      >
        {selectedRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-100">
                {selectedRecord.student?.profile?.name || selectedRecord.name || "Unknown"}
              </h3>
              <StatusBadge status={selectedRecord.type || selectedRecord.status} />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
              {/* Student phone */}
              {selectedRecord.student?.profile?.phone && (
                <div>
                  <p className="text-zinc-500">Phone</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.student.profile.phone}</p>
                </div>
              )}
              {/* Student email */}
              {selectedRecord.student?.profile?.email && (
                <div>
                  <p className="text-zinc-500">Email</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.student.profile.email}</p>
                </div>
              )}
              {/* Permission purpose */}
              {selectedRecord.permission?.purpose && (
                <div className="col-span-2">
                  <p className="text-zinc-500">Purpose</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.permission.purpose}</p>
                </div>
              )}
              {selectedRecord.permission?.destination && (
                <div className="col-span-2">
                  <p className="text-zinc-500">Destination</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.permission.destination}</p>
                </div>
              )}
              {selectedRecord.student?.studentRoll && (
                <div>
                  <p className="text-zinc-500">Roll Number</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.student.studentRoll}</p>
                </div>
              )}
              {selectedRecord.gate?.name && (
                <div>
                  <p className="text-zinc-500">Gate</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.gate.name}</p>
                </div>
              )}
              {selectedRecord.securityUser?.profile?.name && (
                <div>
                  <p className="text-zinc-500">Processed By</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.securityUser.profile.name}</p>
                </div>
              )}
              {selectedRecord.createdAt && (
                <div className="col-span-2">
                  <p className="text-zinc-500">Timestamp</p>
                  <p className="font-medium text-zinc-200">{formatDateTime(selectedRecord.createdAt)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

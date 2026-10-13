"use client";
import { useState } from "react";
import { StatCard, StatusBadge } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";
import { formatDateTime } from "@/lib/utils";
import {
  Users,
  DoorOpen,
  DoorClosed,
  ScanLine,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

export function SecurityDashboardClient({ user }: Props) {
  const [page, setPage] = useState(1);
  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  const { stats, recentMovements, gates } = dashboardData || { stats: {}, recentMovements: [], gates: [] };
  const movementsList = recentMovements || [];
  const ITEMS_PER_PAGE = 8;
  const totalItems = movementsList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const paginatedMovements = movementsList.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const startItem = totalItems === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(page * ITEMS_PER_PAGE, totalItems);

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Security Dashboard
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Gate monitoring & movement registration
            </p>
          </div>
          <Link href="/security/scan">
            <Button size="lg">
              <ScanLine className="h-5 w-5" />
              Scan QR Code
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Outsider Visits"
            value={stats.outsiderVisitsToday || 0}
            icon={<Users className="h-5 w-5" />}
            className="border-purple-500/20"
          />
          <StatCard
            title="Student Exits"
            value={stats.studentExitsToday || 0}
            icon={<DoorOpen className="h-5 w-5" />}
          />
          <StatCard
            title="Student Entries"
            value={stats.studentEntriesToday || 0}
            icon={<DoorClosed className="h-5 w-5" />}
          />
          <StatCard
            title="Outsiders Inside"
            value={stats.outsidersInside || 0}
            icon={<MapPin className="h-5 w-5" />}
            className="border-amber-500/20"
          />
        </div>

        {/* Quick Action Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Link href="/security/scan">
            <Card glow className="cursor-pointer hover:border-red-500/40 transition-all group h-full">
              <CardContent className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4">
                <div className="rounded-xl bg-red-500/15 p-2.5 sm:p-3 text-red-400 group-hover:bg-red-500/25 transition-colors shrink-0">
                  <ScanLine className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-200 text-sm sm:text-base">Scan & Register</p>
                  <p className="text-xs sm:text-sm text-zinc-500 truncate">Scan QR and register exit</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/security/outsiders">
            <Card glow className="cursor-pointer hover:border-orange-500/40 transition-all group h-full">
              <CardContent className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4">
                <div className="rounded-xl bg-orange-500/15 p-2.5 sm:p-3 text-orange-400 group-hover:bg-orange-500/25 transition-colors shrink-0">
                  <Users className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-200 text-sm sm:text-base">Outsider Registration</p>
                  <p className="text-xs sm:text-sm text-zinc-500 truncate">Register visitors and outsiders</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Movements */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Movements</CardTitle>
              <span className="text-xs text-zinc-500 font-medium">
                {totalItems} total recorded
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            {(!movementsList || movementsList.length === 0) ? (
              <p className="text-center text-sm text-zinc-500 py-12">
                No movements recorded today.
              </p>
            ) : (
              <div className="space-y-2 p-4 sm:p-6 pt-0 sm:pt-0">
                {paginatedMovements.map((mov: any) => (
                  <div
                    key={mov.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 rounded-xl bg-zinc-800/30 p-3 sm:px-4 sm:py-3 table-row-hover transition-colors"
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
                          {mov.gate?.name || "Unknown Gate"} •{" "}
                          {mov.permission?.destination || mov.permission?.purpose || ""}
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

            {/* Pagination Controls */}
            {totalItems > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800/40 px-4 sm:px-6 py-3.5 bg-zinc-950/40">
                <p className="text-xs sm:text-sm text-zinc-400">
                  Showing <span className="font-semibold text-zinc-200">{startItem}</span> to{" "}
                  <span className="font-semibold text-zinc-200">{endItem}</span> of{" "}
                  <span className="font-semibold text-zinc-200">{totalItems}</span> movements
                </p>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>

                  {totalPages > 1 ? (
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((pNum) => {
                          if (totalPages <= 5) return true;
                          if (pNum === 1 || pNum === totalPages) return true;
                          return Math.abs(pNum - page) <= 1;
                        })
                        .map((pNum, idx, arr) => {
                          const prev = arr[idx - 1];
                          const showEllipsis = prev && pNum - prev > 1;
                          return (
                            <span key={pNum} className="flex items-center">
                              {showEllipsis && <span className="px-1 text-zinc-600 text-xs">...</span>}
                              <button
                                type="button"
                                onClick={() => setPage(pNum)}
                                className={`h-8 min-w-[2rem] px-2 rounded-md text-xs font-medium transition-colors ${
                                  page === pNum
                                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                                }`}
                              >
                                {pNum}
                              </button>
                            </span>
                          );
                        })}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500 px-2">Page 1 of 1</span>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4 sm:ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    
    </>
  );
}

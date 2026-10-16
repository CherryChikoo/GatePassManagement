"use client";
import { MovementDetails } from "@/components/registers/derived-views";

import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

import React, { useState } from "react";
import Link from "next/link";
import { StatCard, StatusBadge, Modal } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import {
  Users,
  GraduationCap,
  BookOpen,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  DoorOpen,
  DoorClosed,
  ClipboardList,
  History,
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

  const firstName = (user.name || "").replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").split(" ")[0] || user.name || "Admin";
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        {/* Greeting */}
        <div className="min-w-0">
          <p className="text-sm text-zinc-500">{todayLabel}</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-light tracking-tight text-zinc-100 truncate">
            {greeting}, <span className="font-medium bg-gradient-to-r from-[#ff634a] to-[#c2381f] bg-clip-text text-transparent">{firstName}</span>
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">System-wide overview and management</p>
        </div>

        {/* User demographics */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">User Demographics</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard title="Total Students" value={stats.totalStudents} icon={<GraduationCap />} />
            <StatCard title="Faculty" value={stats.totalFaculty} icon={<BookOpen />} />
            <StatCard title="Wardens" value={stats.totalWardens} icon={<Users />} />
            <StatCard title="Security Staff" value={stats.totalSecurity} icon={<Shield />} />
          </div>
        </section>

        {/* Daily operations */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">Daily Operations</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            <StatCard title="Visitor Visits" value={stats.outsidersCount} icon={<Users />} />
            <StatCard title="Approved Today" value={stats.approvedToday} icon={<CheckCircle2 />} />
            <StatCard title="Rejected Today" value={stats.rejectedToday} icon={<XCircle />} />
            <StatCard title="Entry Today" value={stats.entryToday} icon={<DoorClosed />} />
            <StatCard
              title="Exit Today"
              value={stats.exitToday}
              icon={<DoorOpen />}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          {/* Live movement feed */}
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="font-medium">Live Movement Feed</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {recentMovements.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
                    <Clock className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-sm text-zinc-500">No movements recorded today.</p>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-800/70">
                  {recentMovements.map((mov: any) => (
                    <li key={mov.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(mov)}
                        className="w-full flex items-center gap-3 sm:gap-4 py-3 text-left rounded-2xl px-2 -mx-2 hover:bg-zinc-950 transition-colors cursor-pointer"
                      >
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                            mov.type === "EXIT"
                              ? "bg-orange-500/10 text-orange-400"
                              : "bg-blue-500/10 text-blue-400"
                          }`}
                        >
                          {mov.type === "EXIT" ? <DoorOpen className="h-4 w-4" /> : <DoorClosed className="h-4 w-4" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-zinc-100 truncate">
                              {mov.student?.profile?.name || "Unknown person"}
                              {mov.student?.studentRoll ? (
                                <span className="text-zinc-500 font-normal"> · {mov.student.studentRoll}</span>
                              ) : null}
                            </span>
                            {mov.student?.isFaculty && (
                              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                                Faculty
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-zinc-500 truncate">Gate: {mov.gate?.name || "—"}</span>
                        </span>
                        <span className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge status={mov.type} />
                          <span className="text-[11px] text-zinc-500">{formatDateTime(mov.createdAt)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Right: feature card + quick links */}
          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div
              className="relative overflow-hidden rounded-3xl border border-orange-500/20 p-5 sm:p-6 shadow-card"
              style={{ background: "linear-gradient(160deg, #fff3f0 0%, #ffe1d9 55%, #ffd2c7 100%)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-medium text-zinc-100">At the gates today</h2>
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-zinc-300 border border-white">
                  {Number(stats.entryToday || 0) + Number(stats.exitToday || 0)} scans
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/70 border border-white px-4 py-3">
                  <p className="text-xs text-zinc-400">Entries</p>
                  <p className="mt-1 text-3xl font-light tracking-tight text-zinc-100">{stats.entryToday ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-white/70 border border-white px-4 py-3">
                  <p className="text-xs text-zinc-400">Exits</p>
                  <p className="mt-1 text-3xl font-light tracking-tight text-zinc-100">{stats.exitToday ?? 0}</p>
                </div>
              </div>
              <Link
                href="/admin/activity"
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
              >
                <History className="h-4 w-4" />
                Open activity log
              </Link>
            </div>

            <Card>
              <CardContent className="p-5 sm:p-6 space-y-3">
                <h2 className="text-base font-medium text-zinc-100">Quick links</h2>
                {[
                  { href: "/admin/users", label: "Users", hint: "Create and manage user accounts", icon: <Users className="h-4 w-4" /> },
                  { href: "/admin/activity", label: "Activity", hint: "Entries, exits and visitors by date", icon: <History className="h-4 w-4" /> },
                  { href: "/admin/gates", label: "Gates", hint: "Add, edit and switch gates on or off", icon: <DoorOpen className="h-4 w-4" /> },
                  { href: "/admin/registers", label: "Registers", hint: "Gate registers and records", icon: <ClipboardList className="h-4 w-4" /> },
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-800 px-3 py-3 hover:bg-zinc-950 transition-colors"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-zinc-400">{l.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-100">{l.label}</span>
                      <span className="block text-xs text-zinc-500 truncate">{l.hint}</span>
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Record Details Modal */}
      <Modal open={!!selectedRecord} onClose={() => setSelectedRecord(null)} title="Movement Details" className="max-w-xl">
        {selectedRecord && <MovementDetails id={selectedRecord.id} />}
      </Modal>
    </>
  );
}

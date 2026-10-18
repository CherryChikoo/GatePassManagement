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
  LogOut,
  Briefcase,
  AlertTriangle,
  Hourglass,
  Ticket,
  UserCheck,
  UserX,
  Home,
  Building2,
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
  const n = (v: unknown) => Number(v ?? 0) || 0;

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

        {/* Right now: who is out, waiting or late */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">Right now</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            <StatCard
              title="Students out"
              value={n(stats.studentsOut)}
              icon={<LogOut />}
              description={`${n(stats.hostellersOut)} hostellers · ${n(stats.dayScholarsOut)} day scholars`}
            />
            <StatCard title="Faculty out" value={n(stats.facultyOut)} icon={<Briefcase />} description="On an exit pass" />
            <StatCard title="Visitors inside" value={n(stats.visitorsInside)} icon={<Users />} description="Not checked out today" />
            <StatCard
              title="Overdue"
              value={n(stats.overdue)}
              icon={<AlertTriangle />}
              description="Past their return time"
              className={n(stats.overdue) > 0 ? "border-red-500/40 bg-red-500/5" : undefined}
            />
            <StatCard
              title="Pending requests"
              value={n(stats.pending)}
              icon={<Hourglass />}
              description="Waiting for approval"
              className={n(stats.pending) > 0 ? "border-amber-500/40" : undefined}
            />
            <StatCard title="Approved, not used" value={n(stats.approvedUnused)} icon={<Ticket />} description="Valid passes not scanned yet" />
          </div>
        </section>

        {/* Today */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">Today</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard title="Requests" value={n(stats.requestsToday)} icon={<ClipboardList />} description="Pass requests made" />
            <StatCard title="Approved" value={n(stats.approvedToday)} icon={<CheckCircle2 />} />
            <StatCard title="Rejected" value={n(stats.rejectedToday)} icon={<XCircle />} />
            <StatCard title="Gate exits" value={n(stats.exitToday)} icon={<DoorOpen />} />
            <StatCard title="Gate entries" value={n(stats.entryToday)} icon={<DoorClosed />} />
            <StatCard title="Visitor visits" value={n(stats.outsidersCount)} icon={<Users />} />
            <StatCard title="Register entries" value={n(stats.registerToday)} icon={<BookOpen />} description="In all gate registers" />
            <StatCard
              title="Security attendance"
              value={`${n(stats.attendanceMarked)} / ${n(stats.activeSecurity)}`}
              icon={<UserCheck />}
              description={n(stats.attendanceMarked) < n(stats.activeSecurity) ? "Not everyone marked yet" : "All marked"}
            />
          </div>
        </section>

        {/* People */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">People</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            <StatCard
              title="Students"
              value={n(stats.totalStudents)}
              icon={<GraduationCap />}
              description={`${n(stats.boysHostellers)} boys · ${n(stats.ladiesHostellers)} ladies hostel · ${n(stats.dayScholars)} day`}
            />
            <StatCard
              title="Faculty"
              value={n(stats.facultyOnly)}
              icon={<BookOpen />}
              description={`+ ${n(stats.hods)} HODs · ${n(stats.deansDirectors)} Dean / Director`}
            />
            <StatCard title="Wardens" value={n(stats.totalWardens)} icon={<Home />} />
            <StatCard title="Security staff" value={n(stats.totalSecurity)} icon={<Shield />} description={`+ ${n(stats.supervisors)} supervisors`} />
            <StatCard title="HODs" value={n(stats.hods)} icon={<Building2 />} />
            <StatCard
              title="Disabled accounts"
              value={n(stats.disabledAccounts)}
              icon={<UserX />}
              description="Can't sign in"
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

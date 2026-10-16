"use client";


import { StatCard } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logoutAction } from "@/server/actions/auth";
import {
  Users,
  Clock,
  CheckCircle2,
  MapPin,
  ClipboardCheck,
  Building2,
  LogIn,
  LogOut,
  ScanLine,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { Modal, StatusBadge } from "@/components/ui/primitives";
import { useState } from "react";
import { formatDateTime } from "@/lib/utils";
import { gateMarkText } from "@/lib/pass-dates";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

export function WardenDashboardClient({ user }: Props) {
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "ACCEPTED" | "REJECTED">("ALL");

  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  if (!dashboardData) {
    return (
        <p className="text-zinc-500">Warden record not found.</p>
    );
  }

  const { warden, stats, recentActivity, studentMovements } = dashboardData;

  const filteredActivity = recentActivity?.filter((item: any) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "PENDING") return item.status === "PENDING";
    if (activeTab === "ACCEPTED") return item.status === "APPROVED" || item.status === "COMPLETED" || item.status === "EXITED";
    if (activeTab === "REJECTED") return item.status === "REJECTED";
    return true;
  }).slice(0, 10) || [];

  // Greeting header (display only)
  const firstName = (user.name || "").replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").split(" ")[0] || user.name;
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
          <p className="mt-1.5 text-sm text-zinc-500 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            {warden.hostelBlock ? `Block ${warden.hostelBlock}` : "Hostel Management"}
          </p>
        </div>

        {/* One tap to the camera: wardens mostly open the portal to scan */}
        <Link
          href="/warden/scan?scan=1"
          className="group flex items-center gap-4 rounded-3xl bg-orange-600 p-4 sm:p-5 text-white shadow-[0_14px_30px_-14px_rgba(207,62,37,0.65)] hover:bg-orange-700 active:scale-[0.99] transition-[background-color,transform]"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <ScanLine className="h-7 w-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-medium leading-tight">Scan hostel pass</span>
            <span className="mt-0.5 block text-sm text-white/80">Opens the camera to mark students reached the hostel</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-white/80 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          {/* Left: stats + requests */}
          <div className="xl:col-span-2 space-y-4 lg:space-y-6 min-w-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard title="Hostel Students" value={stats.totalHostellers} icon={<Users />} description="Assigned to you" />
              <StatCard
                title="Approved Today"
                value={stats.approvedToday}
                icon={<CheckCircle2 />}
                description={`${stats.rejectedToday} rejected today`}
              />
              <StatCard title="Exits Today" value={stats.exitsToday} icon={<LogOut />} description="Gate scans" />
              <StatCard title="Entries Today" value={stats.entriesToday} icon={<LogIn />} description="Gate scans" />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="font-medium">Requests</CardTitle>
                  <div className="inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none" role="tablist" aria-label="Filter requests">
                    {(["ALL", "PENDING", "ACCEPTED", "REJECTED"] as const).map((tab) => (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={activeTab === tab}
                        onClick={() => setActiveTab(tab)}
                        className={`text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                          activeTab === tab ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {tab === "ALL" ? "All Requests" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {filteredActivity.length === 0 ? (
                  <p className="text-center text-sm text-zinc-500 py-10">
                    No {activeTab === "ALL" ? "recent" : activeTab.toLowerCase().replace('_', ' ')} requests found.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-800/70">
                    {filteredActivity.map((item: any) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedActivity(item)}
                          className="w-full flex items-center gap-3 sm:gap-4 py-3 text-left rounded-2xl px-2 -mx-2 hover:bg-zinc-950 transition-colors"
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 font-semibold">
                            {(item.student?.profile?.name || "S").charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-zinc-100 truncate">
                              {item.student?.profile?.name || "Student"}
                              <span className="text-zinc-500 font-normal"> · {item.student?.studentRoll || ""}</span>
                            </span>
                            <span className="block text-xs text-zinc-500 truncate">{item.purpose}</span>
                          </span>
                          <span className="flex flex-col items-end gap-1 shrink-0">
                            <StatusBadge status={item.status} />
                            <span className="text-[11px] text-zinc-500 whitespace-nowrap">
                              {item.qr?.usedForExit && (
                                <span className="font-medium text-zinc-400">
                                  {item.qr?.usedForEntry ? "Returned" : "Exited"} ·{" "}
                                </span>
                              )}
                              {formatDateTime(item.createdAt)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: pending requests (feature card) + quick links */}
          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div
              className="relative overflow-hidden rounded-3xl border border-orange-500/20 p-5 sm:p-6 shadow-card"
              style={{ background: "linear-gradient(160deg, #fff3f0 0%, #ffe1d9 55%, #ffd2c7 100%)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-medium text-zinc-100">Pending requests</h2>
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-zinc-300 border border-white">
                  {stats.pendingCount > 0 ? "Needs review" : "All caught up"}
                </span>
              </div>
              <p className="mt-4 text-5xl font-light leading-none tracking-tight text-zinc-100">{stats.pendingCount}</p>
              <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
                {stats.pendingCount > 0
                  ? "Hostel students are waiting for your approval."
                  : "No requests are waiting. Scan a hostel pass when a student reaches the hostel."}
              </p>
              {stats.pendingCount > 0 ? (
                <Link
                  href="/warden/requests"
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Review {stats.pendingCount} Pending
                </Link>
              ) : (
                <Link
                  href="/warden/requests"
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  View all requests
                </Link>
              )}
            </div>

            <Card>
              <CardContent className="p-5 sm:p-6 space-y-3">
                <h2 className="text-base font-medium text-zinc-100">Quick links</h2>
                {[
                  { href: "/warden/requests", label: "Review Requests", hint: "Approve or reject hostel requests", icon: <ClipboardCheck className="h-4 w-4" /> },
                  { href: "/warden/students", label: "Hostel Students", hint: "View assigned students", icon: <Users className="h-4 w-4" /> },
                  { href: "/warden/scan?scan=1", label: "Scan Hostel Pass", hint: "Mark students who reached the hostel", icon: <ScanLine className="h-4 w-4" /> },
                  { href: "/warden/activity", label: "Activity", hint: "Your students' passes, by date", icon: <Clock className="h-4 w-4" /> },
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

      <Modal
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        title="Request Details"
      >
        {selectedActivity && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Student</dt>
              <dd className="mt-1 text-sm text-zinc-200 break-words">{selectedActivity.student?.profile?.name}</dd>
              <dd className="text-xs text-zinc-500">{selectedActivity.student?.studentRoll}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Status</dt>
              <dd className="mt-1"><StatusBadge status={selectedActivity.status} /></dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Purpose</dt>
              <dd className="mt-1 text-sm text-zinc-200 break-words">{selectedActivity.purpose}</dd>
            </div>
            {selectedActivity.destination && (
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Destination</dt>
                <dd className="mt-1 text-sm text-zinc-200 break-words">{selectedActivity.destination}</dd>
              </div>
            )}
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Expected Exit</dt>
              <dd className="mt-1 text-sm text-zinc-200">
                {selectedActivity.expectedExit ? formatDateTime(selectedActivity.expectedExit) : "None"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Expected Return</dt>
              <dd className="mt-1 text-sm text-zinc-200">
                {selectedActivity.expectedReturn ? formatDateTime(selectedActivity.expectedReturn) : "None"}
              </dd>
            </div>
            {gateMarkText(selectedActivity.qr) && (
              <div className="min-w-0 sm:col-span-2 rounded-2xl bg-zinc-950 p-3.5">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Gate
                </dt>
                <dd className="mt-1 text-sm text-zinc-200 break-words">{gateMarkText(selectedActivity.qr)}</dd>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </>
  );
}

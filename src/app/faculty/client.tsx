"use client";

import { StatGroup, StatCard, StatusBadge } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { gateMarkText } from "@/lib/pass-dates";
import { Users, Clock, CheckCircle2, MapPin, ClipboardCheck, LogIn, LogOut, QrCode } from "lucide-react";
import { facultyRequestTypeLabel } from "@/lib/registers/definitions";
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
  const myPasses = useAppStore((s) => s.data.myPasses) as any[] | undefined;

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  if (!dashboardData) {
    return (
        <p className="text-zinc-500">Faculty record not found.</p>
    );
  }

  const { faculty, stats, recentActivity } = dashboardData;

  const filteredActivity = recentActivity?.filter((item: any) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "PENDING") return item.status === "PENDING";
    if (activeTab === "ACCEPTED") return item.status === "APPROVED" || item.status === "COMPLETED" || item.status === "EXITED";
    if (activeTab === "REJECTED") return item.status === "REJECTED";
    return true;
  }).slice(0, 10) || [];

  // The faculty member's own pass right now (for the feature card)
  const passes: any[] = myPasses || [];
  const pendingPass = passes.find((p) => p.status === "PENDING");
  const approvedPass = passes.find(
    (p) => p.status === "APPROVED" && p.qr?.active && (!p.qr?.expiresAt || new Date(p.qr.expiresAt) > new Date())
  );
  // Out on an exit pass: the same QR is scanned again at the gate for the return
  const outPass = passes.find(
    (p) => p.status === "EXITED" && p.type !== "ENTRY" && !(p.movements ?? []).some((m: any) => m.type === "ENTRY")
  );
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
          <p className="mt-1.5 text-sm text-zinc-500">
            {[faculty.department, faculty.designation].filter(Boolean).join(" • ") || "Faculty"}
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          {/* Left: stats + students */}
          <div className="xl:col-span-2 space-y-4 lg:space-y-6 min-w-0">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-4">
              <StatGroup title="Your students" gridClassName="grid-cols-1">
                <StatCard title="My Students" value={stats.totalStudents} icon={<Users />} description="Assigned to you" />
              </StatGroup>
              <StatGroup title="Today" className="lg:col-span-3" gridClassName="sm:grid-cols-3">
                <StatCard
                  title="Approved"
                  className="col-span-2 sm:col-span-1"
                  value={stats.approvedToday}
                  icon={<CheckCircle2 />}
                  description={`${stats.rejectedToday} rejected today`}
                />
                <StatCard title="Exits" value={stats.exitsToday} icon={<LogOut />} description="Gate scans" />
                <StatCard title="Entries" value={stats.entriesToday} icon={<LogIn />} description="Gate scans" />
              </StatGroup>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="font-medium">My students&apos; recent passes</CardTitle>
                  <div className="inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none" role="tablist" aria-label="Filter passes">
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
                        {tab === "ALL" ? "All" : tab === "ACCEPTED" ? "Approved" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {filteredActivity.length === 0 ? (
                  <p className="text-center text-sm text-zinc-500 py-10">
                    No {activeTab === "ALL" ? "recent" : activeTab === "ACCEPTED" ? "approved" : activeTab.toLowerCase()} passes.
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
                            <span className="text-[11px] text-zinc-500">{formatDateTime(item.createdAt)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: my gate pass (feature card) + quick links */}
          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div
              className="relative overflow-hidden rounded-3xl border border-orange-500/20 p-5 sm:p-6 shadow-card"
              style={{ background: "linear-gradient(160deg, #fff3f0 0%, #ffe1d9 55%, #ffd2c7 100%)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-medium text-zinc-100">My gate pass</h2>
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-zinc-300 border border-white">
                  {outPass ? "You're out" : pendingPass ? "Pending" : approvedPass ? "Approved" : "No active pass"}
                </span>
              </div>
              <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
                {outPass
                  ? "You're out on your pass. When you come back, show the same QR at the gate so security records your return."
                  : pendingPass
                  ? `Your ${facultyRequestTypeLabel(pendingPass.requestType) || "pass"} request is waiting for approval.`
                  : approvedPass
                  ? "Your pass is approved. Open it and show the QR code at the gate."
                  : "Need to step out? Request a pass. Your HOD or Dean approves it, and the QR is ready for the gate."}
              </p>
              <Link
                href="/faculty/apply"
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
              >
                {approvedPass || outPass ? <QrCode className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                {outPass ? "Show return QR" : approvedPass ? "View my QR pass" : pendingPass ? "View request" : "Apply for a pass"}
              </Link>
            </div>

            <Card>
              <CardContent className="p-5 sm:p-6 space-y-3">
                <h2 className="text-base font-medium text-zinc-100">Quick links</h2>
                {[
                  { href: "/faculty/students", label: "My students", hint: "Profiles and pass history", icon: <Users className="h-4 w-4" /> },
                  { href: "/faculty/activity", label: "Activity", hint: "Your passes and your students' passes, by date", icon: <Clock className="h-4 w-4" /> },
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
              {gateMarkText(selectedActivity.qr) && (
                <div className="col-span-2 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                   <p className="text-xs text-zinc-400 mb-1 flex items-center gap-2"><MapPin className="h-3 w-3" /> Gate</p>
                   <p className="text-sm text-zinc-200">{gateMarkText(selectedActivity.qr)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    
    </>
  );
}

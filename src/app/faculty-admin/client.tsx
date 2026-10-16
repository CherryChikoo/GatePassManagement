"use client";

import { useState } from "react";
import Link from "next/link";
import { StatCard, StatusBadge, Modal } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { gateMarkText } from "@/lib/pass-dates";
import { getDepartmentCode, getDepartmentFullName } from "@/lib/constants";
import {
  Users,
  CheckCircle2,
  MapPin,
  ClipboardCheck,
  ShieldAlert,
  ArrowRight,
  GraduationCap,
  Briefcase,
  LogIn,
  LogOut,
  Clock,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user?: { name: string; email: string; role: string; profileId: string };
}

export function FacultyAdminDashboardClient({ user }: Props) {
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<
    "ALL" | "FACULTY" | "STUDENTS" | "PENDING" | "APPROVED" | "REJECTED"
  >("ALL");

  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);
  const allRequests = useAppStore((s) => s.data.allRequests || s.data.requests);

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  if (dashboardData === null) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-center">
        <p className="text-base font-medium text-zinc-100">Your HOD account isn&apos;t fully set up</p>
        <p className="mt-2 text-sm text-zinc-400">
          No department is assigned to this account yet, so there is nothing to show or approve. Ask the administrator to
          finish setting up your HOD account.
        </p>
      </div>
    );
  }

  const faculty = dashboardData?.faculty || {
    department: "Department",
    designation: "Head of Department",
  };
  const stats = dashboardData?.stats || {
    totalStudents: 0,
    approvedToday: 0,
    rejectedToday: 0,
    exitsToday: 0,
    entriesToday: 0,
    facultyPending: 0,
    studentPending: 0,
  };

  const requestsList = allRequests || dashboardData?.recentActivity || [];

  const filteredActivity = requestsList.filter((item: any) => {
    const isFacultyPass = !!item.facultyId;
    if (activeTab === "ALL") return true;
    if (activeTab === "FACULTY") return isFacultyPass;
    if (activeTab === "STUDENTS") return !isFacultyPass;
    if (activeTab === "PENDING") return item.status === "PENDING";
    if (activeTab === "APPROVED")
      return item.status === "APPROVED" || item.status === "COMPLETED" || item.status === "EXITED";
    if (activeTab === "REJECTED") return item.status === "REJECTED";
    return true;
  }).slice(0, 10);

  // Greeting (display only)
  const displayName = user?.name || "";
  const firstName = displayName.replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").split(" ")[0] || displayName;
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  const totalPending = (Number(stats.facultyPending) || 0) + (Number(stats.studentPending) || 0);

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        {/* Greeting + primary action */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-zinc-500">{todayLabel}</p>
            <h1 className="mt-1 text-3xl sm:text-4xl font-light tracking-tight text-zinc-100 truncate">
              {firstName ? (
                <>
                  {greeting}, <span className="font-medium bg-gradient-to-r from-[#ff634a] to-[#c2381f] bg-clip-text text-transparent">{firstName}</span>
                </>
              ) : (
                <>
                  HOD <span className="font-medium">Dashboard</span>
                </>
              )}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-medium text-orange-400">
                Head of Department
              </span>
              {faculty.department && (
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
                  {getDepartmentCode(faculty.department)}
                </span>
              )}
              <span className="text-sm text-zinc-500 min-w-0">
                {faculty.department ? (
                  <>
                    <span className="text-zinc-300">{getDepartmentFullName(faculty.department)}</span>
                    {" • Oversight of Faculty & Students"}
                  </>
                ) : (
                  "All Departments • Oversight of Faculty & Students"
                )}
              </span>
            </div>
          </div>
          <Link href="/faculty-admin/requests" className="shrink-0">
            <Button className="w-full sm:w-auto">
              <ClipboardCheck className="h-4 w-4" />
              Review Requests
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          {/* Left: stats + requests */}
          <div className="xl:col-span-2 space-y-4 lg:space-y-6 min-w-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard title="Total Students" value={stats.totalStudents} icon={<Users />} description="In your department" />
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="font-medium flex items-center gap-2">
                    Department requests &amp; activity
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                      Recent 10
                    </span>
                  </CardTitle>
                  <Link
                    href="/faculty-admin/requests"
                    className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    View all requests <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="pt-3">
                  <div
                    className="inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
                    role="tablist"
                    aria-label="Filter requests"
                  >
                    {(
                      [
                        { id: "ALL", label: "All Requests" },
                        { id: "FACULTY", label: "Faculty Passes" },
                        { id: "STUDENTS", label: "Student Passes" },
                        { id: "PENDING", label: "Pending" },
                        { id: "APPROVED", label: "Approved" },
                        { id: "REJECTED", label: "Rejected" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                          activeTab === tab.id ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {filteredActivity.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-sm text-zinc-500">
                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
                      <ClipboardCheck className="h-5 w-5" />
                    </span>
                    No requests found in this category.
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-800/70">
                    {filteredActivity.map((item: any) => {
                      const isFacultyPass = !!item.facultyId;
                      const name = isFacultyPass
                        ? item.faculty?.profile?.name || "Faculty Member"
                        : item.student?.profile?.name || "Student";
                      const subtext = isFacultyPass
                        ? `${item.faculty?.designation || "Faculty"} • ${item.faculty?.department || ""}`
                        : `${item.student?.studentRoll || ""} • ${item.student?.department || ""}`;

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedActivity(item)}
                            className="w-full flex items-center gap-3 sm:gap-4 py-3 text-left rounded-2xl px-2 -mx-2 hover:bg-zinc-950 transition-colors"
                          >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 font-semibold">
                              {(name || "U").charAt(0).toUpperCase()}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium text-zinc-100 truncate">{name}</span>
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                                  {isFacultyPass ? <Briefcase className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
                                  {isFacultyPass ? "Faculty" : "Student"}
                                </span>
                              </span>
                              <span className="block text-xs text-zinc-500 truncate mt-0.5">
                                {subtext} • {item.purpose}
                              </span>
                            </span>
                            <span className="flex flex-col items-end gap-1 shrink-0">
                              <StatusBadge status={item.status} />
                              <span className="text-[11px] text-zinc-500">{formatDateTime(item.createdAt)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: pending approvals (feature card) + quick links */}
          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div
              className="relative overflow-hidden rounded-3xl border border-orange-500/20 p-5 sm:p-6 shadow-card"
              style={{ background: "linear-gradient(160deg, #fff3f0 0%, #ffe1d9 55%, #ffd2c7 100%)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-medium text-zinc-100">Pending approvals</h2>
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-zinc-300 border border-white">
                  {totalPending > 0 ? `${totalPending} waiting` : "All clear"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/70 border border-white px-3 py-3">
                  <p className="text-xs text-zinc-500">Faculty</p>
                  <p className="mt-1 text-2xl font-light text-zinc-100">{stats.facultyPending}</p>
                </div>
                <div className="rounded-2xl bg-white/70 border border-white px-3 py-3">
                  <p className="text-xs text-zinc-500">Students</p>
                  <p className="mt-1 text-2xl font-light text-zinc-100">{stats.studentPending}</p>
                </div>
              </div>

              {stats.facultyPending > 0 ? (
                <div className="mt-4 flex items-start gap-2.5">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-orange-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100">
                      {stats.facultyPending} Faculty Pass Request{stats.facultyPending > 1 ? "s" : ""} Awaiting Approval
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-300 leading-relaxed">
                      Faculty members in your department have submitted pass requests that require HOD review.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-300 leading-relaxed">
                  Review student and faculty pass requests from your department in one place.
                </p>
              )}

              <Link
                href="/faculty-admin/requests"
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
              >
                <ClipboardCheck className="h-4 w-4" />
                {stats.facultyPending > 0 ? "Review Now" : "Review Requests"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <Card>
              <CardContent className="p-5 sm:p-6 space-y-3">
                <h2 className="text-base font-medium text-zinc-100">Quick links</h2>
                {[
                  { href: "/faculty-admin/students", label: "Students", hint: "Department student profiles", icon: <GraduationCap className="h-4 w-4" /> },
                  { href: "/faculty-admin/faculty", label: "Faculty", hint: "Department faculty and their passes", icon: <Briefcase className="h-4 w-4" /> },
                  { href: "/faculty-admin/activity", label: "Activity", hint: "Department passes and gate movements, by date", icon: <Clock className="h-4 w-4" /> },
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

      {/* Request Details Modal */}
      <Modal
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        title="Request Details"
      >
        {selectedActivity && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                {selectedActivity.facultyId ? "Faculty Member" : "Student"}
              </dt>
              <dd className="text-sm font-medium text-zinc-200 break-words">
                {selectedActivity.faculty?.profile?.name ||
                  selectedActivity.student?.profile?.name ||
                  "User"}
              </dd>
              <dd className="text-xs text-zinc-500 break-words">
                {selectedActivity.faculty?.department ||
                  selectedActivity.student?.studentRoll ||
                  ""}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Status</dt>
              <dd><StatusBadge status={selectedActivity.status} /></dd>
            </div>
            <div className="sm:col-span-2 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Purpose</dt>
              <dd className="text-sm text-zinc-200 break-words">{selectedActivity.purpose}</dd>
            </div>
            {selectedActivity.destination && (
              <div className="sm:col-span-2 min-w-0">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Destination</dt>
                <dd className="text-sm text-zinc-200 break-words">{selectedActivity.destination}</dd>
              </div>
            )}
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Expected Exit</dt>
              <dd className="text-sm text-zinc-200">
                {selectedActivity.expectedExit
                  ? formatDateTime(selectedActivity.expectedExit)
                  : "None"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Expected Return</dt>
              <dd className="text-sm text-zinc-200">
                {selectedActivity.expectedReturn
                  ? formatDateTime(selectedActivity.expectedReturn)
                  : "None"}
              </dd>
            </div>
            {gateMarkText(selectedActivity.qr) && (
              <div className="sm:col-span-2 rounded-2xl bg-zinc-950 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Gate
                </dt>
                <dd className="text-sm text-zinc-200">{gateMarkText(selectedActivity.qr)}</dd>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </>
  );
}

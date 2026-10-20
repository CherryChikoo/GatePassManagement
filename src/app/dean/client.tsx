"use client";

import { useState } from "react";
import Link from "next/link";
import { StatGroup, StatCard, StatusBadge, Modal } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { getDepartmentCode, DEPARTMENTS } from "@/lib/constants";
import {
  Users,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  ShieldAlert,
  ArrowRight,
  GraduationCap,
  Briefcase,
  Shield,
  History,
  Building2,
  Clock,
  DoorOpen,
  MapPin,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user?: { name: string; email: string; role: string; profileId: string };
}

export function DeanDashboardClient({ user, title }: Props & { title?: string }) {
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");

  const [activityCategory, setActivityCategory] = useState<"ALL" | "FACULTY" | "STUDENTS">("ALL");

  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);
  const requests = useAppStore((s) => s.data.requests);
  const rawAllFaculty = useAppStore((s) => s.data.allFaculty);
  const allFaculty = rawAllFaculty || [];
  // Students per department (counted on the server; the list itself is paged)
  const studentDeptCountsData = useAppStore((s) => s.data.studentDeptCounts) as Record<string, number> | undefined;
  const rawStudentPasses = useAppStore((s) => s.data.recentStudentPasses) || dashboardData?.recentStudentPasses || [];

  // Group faculty count by department
  const deptFacultyCounts: Record<string, number> = {};
  allFaculty.forEach((f: any) => {
    const d = f.faculty?.department || "General";
    deptFacultyCounts[d] = (deptFacultyCounts[d] || 0) + 1;
  });

  // Student count by department
  const deptStudentCounts: Record<string, number> = studentDeptCountsData ?? {};

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  const faculty = dashboardData?.faculty || {
    department: "All Departments",
    designation: "Dean",
  };

  const stats = dashboardData?.stats || {
    totalFaculty: 0,
    totalHODs: 0,
    totalStudents: 0,
    approvedToday: 0,
    rejectedToday: 0,
    exitsToday: 0,
    entriesToday: 0,
    pendingFacultyPasses: 0,
  };

  const rawFacultyPasses = requests || dashboardData?.recentActivity || [];

  // Combined passes with kind indicator
  const combinedActivity: any[] = [];
  if (activityCategory === "ALL" || activityCategory === "FACULTY") {
    rawFacultyPasses.forEach((p: any) => combinedActivity.push({ ...p, kind: "FACULTY" }));
  }
  if (activityCategory === "ALL" || activityCategory === "STUDENTS") {
    rawStudentPasses.forEach((p: any) => combinedActivity.push({ ...p, kind: "STUDENT" }));
  }

  combinedActivity.sort(
    (a: any, b: any) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const filteredActivity = combinedActivity
    .filter((item: any) => {
      if (activeTab === "ALL") return true;
      if (activeTab === "PENDING") return item.status === "PENDING";
      if (activeTab === "APPROVED")
        return (
          item.status === "APPROVED" ||
          item.status === "COMPLETED" ||
          item.status === "EXITED"
        );
      if (activeTab === "REJECTED") return item.status === "REJECTED";
      return true;
    })
    .slice(0, 10);

  const firstName =
    (user?.name || "").replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").split(" ")[0] || user?.name || title || "Dean";
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());

  const segBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
      active ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
    }`;

  const quickLinks = [
    { href: "/dean/requests", label: "Faculty Passes", hint: "Review and authorize campus faculty gate pass requests", icon: <ClipboardCheck className="h-4 w-4" /> },
    { href: "/dean/students", label: "All Students", hint: "Campus-wide student registry, cohorts & hostel details", icon: <GraduationCap className="h-4 w-4" /> },
    { href: "/dean/hods", label: "All HODs", hint: "Heads of department directory and leadership records", icon: <Shield className="h-4 w-4" /> },
    { href: "/dean/faculty", label: "Faculty Directory", hint: "Campus-wide faculty directory across all academic departments", icon: <Users className="h-4 w-4" /> },
    { href: "/dean/activity", label: "Activity Logs", hint: "Track faculty pass approvals and recorded gate movements", icon: <History className="h-4 w-4" /> },
  ];

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        {/* Greeting */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-zinc-500">{todayLabel}</p>
            <h1 className="mt-1 text-3xl sm:text-4xl font-light tracking-tight text-zinc-100 truncate">
              {greeting}, <span className="font-medium bg-gradient-to-r from-[#ff634a] to-[#c2381f] bg-clip-text text-transparent">{firstName}</span>
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              <span className="font-medium text-zinc-300">{title ?? "Dean Dashboard"}</span> · Academic Leadership · All Departments
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Faculty oversight, department coordination, and faculty pass authorizations
            </p>
          </div>
          <Link href="/dean/requests" className="shrink-0">
            <Button className="w-full sm:w-auto">
              <ClipboardCheck className="h-4 w-4" />
              Faculty Passes
              {stats.pendingFacultyPasses > 0 && (
                <span className="ml-0.5 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                  {stats.pendingFacultyPasses}
                </span>
              )}
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          {/* Left: stats + recent passes */}
          <div className="xl:col-span-2 space-y-4 lg:space-y-6 min-w-0">
            <StatGroup title="Faculty passes" gridClassName="sm:grid-cols-3">
              <StatCard title="Pending" value={stats.pendingFacultyPasses} icon={<ClipboardCheck />} description="Awaiting Dean review" />
              <StatCard
                title="Approved Today"
                value={stats.approvedToday}
                icon={<CheckCircle2 />}
                description="Your faculty passes approved today"
              />
              <StatCard
                title="Rejected Today"
                value={stats.rejectedToday}
                icon={<XCircle />}
                description="Your faculty passes rejected today"
              />
            </StatGroup>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-4">
              <StatGroup title="Gate today" className="lg:col-span-2">
                <StatCard title="Faculty Exits" value={stats.exitsToday} icon={<DoorOpen />} description="Exits on passes sent to you" />
                <StatCard title="Faculty Entries" value={stats.entriesToday} icon={<MapPin />} description="Returns on passes sent to you" />
              </StatGroup>
              <StatGroup title="People" className="lg:col-span-3" gridClassName="sm:grid-cols-3">
                <StatCard title="Faculty" value={stats.totalFaculty} icon={<Briefcase />} description="Active teaching faculty" />
                <StatCard title="HODs" value={stats.totalHODs} icon={<Shield />} description="Department heads" />
                <StatCard title="Students" value={stats.totalStudents} icon={<GraduationCap />} description="Campus enrolled" />
              </StatGroup>
            </div>

            {/* Recent gate passes */}
            <Card>
              <CardHeader className="pb-2">
                <div className="min-w-0">
                  <CardTitle className="font-medium">Recent Gate Passes</CardTitle>
                  <p className="mt-1 text-xs text-zinc-500">
                    Latest gate passes and permissions requested across campus divisions
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {/* Category Filter: All / Faculty / Students */}
                  <div
                    className="inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
                    role="tablist"
                    aria-label="Filter by requester"
                  >
                    <button
                      role="tab"
                      aria-selected={activityCategory === "ALL"}
                      onClick={() => setActiveTab("ALL")}
                      className={segBtn(activityCategory === "ALL")}
                      onClickCapture={() => setActivityCategory("ALL")}
                    >
                      All
                    </button>
                    <button
                      role="tab"
                      aria-selected={activityCategory === "FACULTY"}
                      className={segBtn(activityCategory === "FACULTY")}
                      onClick={() => setActivityCategory("FACULTY")}
                    >
                      <Briefcase className="h-3 w-3" /> Faculty
                    </button>
                    <button
                      role="tab"
                      aria-selected={activityCategory === "STUDENTS"}
                      className={segBtn(activityCategory === "STUDENTS")}
                      onClick={() => setActivityCategory("STUDENTS")}
                    >
                      <GraduationCap className="h-3 w-3" /> Students
                    </button>
                  </div>

                  {/* Status Tabs */}
                  <div
                    className="inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
                    role="tablist"
                    aria-label="Filter by status"
                  >
                    {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((tab) => (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={activeTab === tab}
                        onClick={() => setActiveTab(tab)}
                        className={segBtn(activeTab === tab)}
                      >
                        {tab === "ALL" ? "All Status" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {filteredActivity.length === 0 ? (
                  <p className="py-12 text-center text-sm text-zinc-500">
                    No pass activity found matching the selected filter.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-800/70">
                    {filteredActivity.map((item: any) => {
                      const isStudent = !!item.student;
                      const requesterName = isStudent
                        ? item.student.profile?.name || "Student"
                        : item.faculty?.profile?.name || "Faculty Member";
                      const dept = isStudent
                        ? item.student.department || "Department"
                        : item.faculty?.department || "Department";
                      const desig = isStudent
                        ? "Student"
                        : item.faculty?.designation || (item.faculty?.profile?.role === "FACULTY_ADMIN" ? "HOD" : "Faculty");
                      const idTag = isStudent
                        ? item.student.studentRoll
                        : item.faculty?.employeeId || "N/A";

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedActivity(item)}
                            className="w-full flex items-center gap-3 sm:gap-4 py-3 text-left rounded-2xl px-2 -mx-2 hover:bg-zinc-950 transition-colors"
                          >
                            <span
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                                isStudent ? "bg-zinc-950 text-zinc-400" : "bg-orange-500/10 text-orange-400"
                              }`}
                            >
                              {isStudent ? <GraduationCap className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium text-zinc-100 truncate">
                                {requesterName}
                                {idTag && <span className="text-zinc-500 font-normal"> · {idTag}</span>}
                              </span>
                              <span className="mt-1 flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    isStudent ? "bg-zinc-950 text-zinc-400 border border-zinc-800" : "bg-orange-500/10 text-orange-400"
                                  }`}
                                >
                                  {isStudent ? "Student" : "Faculty"}
                                </span>
                                <span className="shrink-0 rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                  {getDepartmentCode(dept)}
                                </span>
                                <span className="min-w-0 truncate text-xs text-zinc-500">
                                  {desig} • Purpose: {item.purpose || "Official"}
                                  {item.destination && ` • Destination: ${item.destination}`}
                                </span>
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

          {/* Right: faculty passes (feature card) + quick links */}
          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div
              className="relative overflow-hidden rounded-3xl border border-orange-500/20 p-5 sm:p-6 shadow-card"
              style={{ background: "linear-gradient(160deg, #fff3f0 0%, #ffe1d9 55%, #ffd2c7 100%)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-medium text-zinc-100">Faculty Passes</h2>
                <span className="shrink-0 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-zinc-300 border border-white">
                  {stats.pendingFacultyPasses} pending
                </span>
              </div>
              {stats.pendingFacultyPasses > 0 ? (
                <>
                  <p className="mt-3 text-sm font-medium text-zinc-200">
                    {stats.pendingFacultyPasses} Faculty Pass Request{stats.pendingFacultyPasses > 1 ? "s" : ""} Pending Approval
                  </p>
                  <p className="mt-1 text-sm text-zinc-300 leading-relaxed">
                    Faculty members from academic departments are awaiting Dean review.
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
                  Review and authorize campus faculty gate pass requests
                </p>
              )}
              <Link
                href="/dean/requests"
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
              >
                {stats.pendingFacultyPasses > 0 ? "Review Now" : "Faculty Passes"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <Card>
              <CardContent className="p-5 sm:p-6 space-y-3">
                <h2 className="text-base font-medium text-zinc-100">Quick links</h2>
                {quickLinks.map((l) => (
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

        {/* Academic Departments Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-orange-400" />
              Academic Departments Breakdown
            </CardTitle>
            <p className="text-xs text-zinc-500">
              Departmental staffing and student enrollment overview across academic divisions
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {DEPARTMENTS.map((dept) => {
                const facCount = deptFacultyCounts[dept.name] || deptFacultyCounts[dept.code] || 0;
                const stuCount = deptStudentCounts[dept.name] || deptStudentCounts[dept.code] || 0;

                return (
                  <div key={dept.code} className="min-w-0 rounded-2xl border border-zinc-800 p-3.5 sm:p-4">
                    <span className="inline-flex rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-semibold text-orange-400">
                      {dept.code}
                    </span>
                    <p className="mt-2 text-xs font-medium text-zinc-200 truncate" title={dept.name}>
                      {dept.name}
                    </p>
                    <p className="text-[11px] text-zinc-500">Academic Department</p>
                    <div className="mt-3 flex items-end gap-4">
                      <div>
                        <span className="block text-xl font-light leading-none text-zinc-100">{facCount}</span>
                        <span className="mt-1 block text-[10px] text-zinc-500">Faculty</span>
                      </div>
                      <div className="border-l border-zinc-800 pl-4">
                        <span className="block text-xl font-light leading-none text-zinc-100">{stuCount}</span>
                        <span className="mt-1 block text-[10px] text-zinc-500">Students</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Detail Modal */}
      {selectedActivity && (
        <Modal
          open={!!selectedActivity}
          onClose={() => setSelectedActivity(null)}
          title="Gate Pass Request Details"
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-zinc-950 p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  {selectedActivity.student ? "Student Applicant" : "Faculty Member"}
                </span>
                <StatusBadge status={selectedActivity.status} />
              </div>
              <p className="text-base font-medium text-zinc-100 break-words">
                {selectedActivity.student?.profile?.name ||
                  selectedActivity.faculty?.profile?.name ||
                  "Requester"}
              </p>
              <p className="text-xs text-zinc-500">
                {selectedActivity.student
                  ? `Roll: ${selectedActivity.student.studentRoll} • Department of ${selectedActivity.student.department || "General"}`
                  : `${selectedActivity.faculty?.designation || "Faculty"} • Department of ${selectedActivity.faculty?.department || "General"}`}
              </p>
              {(selectedActivity.student?.profile?.phone || selectedActivity.faculty?.profile?.phone) && (
                <p className="text-xs text-zinc-500">
                  Phone: {selectedActivity.student?.profile?.phone || selectedActivity.faculty?.profile?.phone}
                </p>
              )}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-800 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Purpose</dt>
                <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedActivity.purpose || "N/A"}</dd>
              </div>
              <div className="rounded-2xl border border-zinc-800 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Destination</dt>
                <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedActivity.destination || "N/A"}</dd>
              </div>
              <div className="rounded-2xl border border-zinc-800 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Requested At</dt>
                <dd className="mt-0.5 text-sm text-zinc-200 break-words">{formatDateTime(selectedActivity.createdAt)}</dd>
              </div>
              <div className="rounded-2xl border border-zinc-800 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Approver Role</dt>
                <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedActivity.approverType || "DEAN"}</dd>
              </div>
            </dl>

            {selectedActivity.status === "PENDING" && !selectedActivity.student && (
              <div className="pt-2">
                <Link href="/dean/requests" className="block">
                  <Button className="w-full">
                    Go to Pass Review to Approve / Reject
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

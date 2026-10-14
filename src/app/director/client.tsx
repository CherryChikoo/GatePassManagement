"use client";

import { useState } from "react";
import Link from "next/link";
import { StatCard, StatusBadge, Modal } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { getDepartmentCode, DEPARTMENTS } from "@/lib/constants";
import {
  Users,
  CheckCircle2,
  XCircle,
  MapPin,
  ClipboardCheck,
  ArrowRight,
  GraduationCap,
  Briefcase,
  Shield,
  Eye,
  History,
  Building2,
  DoorOpen,
  Calendar,
  Clock,
  User,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user?: { name: string; email: string; role: string; profileId: string };
}

export function DirectorDashboardClient({ user, title }: Props & { title?: string }) {
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "FACULTY" | "PENDING" | "APPROVED" | "REJECTED">("ALL");

  const [activityCategory, setActivityCategory] = useState<"ALL" | "FACULTY" | "STUDENTS">("ALL");

  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);
  const requests = useAppStore((s) => s.data.requests);
  const rawAllHODs = useAppStore((s) => s.data.allHODs);
  const allHODs = rawAllHODs || [];
  const rawAllFaculty = useAppStore((s) => s.data.allFaculty);
  const allFaculty = rawAllFaculty || [];
  const rawAllMovements = useAppStore((s) => s.data.allMovements);
  const allMovements = rawAllMovements || [];
  const rawStudents = useAppStore((s) => s.data.students);
  const allStudents = rawStudents || [];
  const rawStudentPasses = useAppStore((s) => s.data.recentStudentPasses) || dashboardData?.recentStudentPasses || [];

  // Group faculty count by department
  const deptFacultyCounts: Record<string, number> = {};
  allFaculty.forEach((f: any) => {
    const d = f.faculty?.department || "General";
    deptFacultyCounts[d] = (deptFacultyCounts[d] || 0) + 1;
  });

  // Group student count by department
  const deptStudentCounts: Record<string, number> = {};
  allStudents.forEach((s: any) => {
    const d = s.department || "General";
    deptStudentCounts[d] = (deptStudentCounts[d] || 0) + 1;
  });

  if (!isReady || dashboardData === undefined) {
    return <DashboardSkeleton />;
  }

  const faculty = dashboardData?.faculty || {
    department: "All Departments",
    designation: "Director",
  };

  const stats = dashboardData?.stats || {
    totalFaculty: 0,
    totalHODs: 0,
    totalStudents: 0,
    totalWardens: 0,
    totalSecurity: 0,
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

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5 flex-wrap">
              {title ?? "Director Dashboard"}
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                Campus Executive
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                All Departments
              </span>
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Full campus oversight across faculty, staff, students, wardens & security infrastructure
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/director/activity">
              <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-600/20">
                <History className="h-4 w-4 mr-1.5" />
                View Activity
              </Button>
            </Link>
          </div>
        </div>

        {/* Primary Metric Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Faculty"
            value={stats.totalFaculty}
            icon={<Briefcase className="h-5 w-5 text-emerald-400" />}
            description="Active teaching staff"
          />
          <StatCard
            title="Total HODs"
            value={stats.totalHODs}
            icon={<Shield className="h-5 w-5 text-indigo-400" />}
            description="Department heads"
          />
          <StatCard
            title="Total Students"
            value={stats.totalStudents}
            icon={<GraduationCap className="h-5 w-5 text-blue-400" />}
            description="Campus enrolled"
          />
          <StatCard
            title="Wardens & Security"
            value={stats.totalWardens + stats.totalSecurity}
            icon={<Building2 className="h-5 w-5 text-amber-400" />}
            description={`${stats.totalWardens} Wardens • ${stats.totalSecurity} Security`}
          />
          <StatCard
            title="Pending Faculty Passes"
            value={stats.pendingFacultyPasses}
            icon={<ClipboardCheck className="h-5 w-5 text-purple-400" />}
            description="Awaiting HOD / Dean"
          />
        </div>

        {/* Daily Movement & Pass Activity Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            title="Approved Today"
            value={stats.approvedToday}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            description="Passes granted today"
          />
          <StatCard
            title="Rejected Today"
            value={stats.rejectedToday}
            icon={<XCircle className="h-5 w-5 text-red-400" />}
            description="Passes denied today"
          />
          <StatCard
            title="Exits Today"
            value={stats.exitsToday}
            icon={<DoorOpen className="h-5 w-5 text-orange-400" />}
            description="Scanned gate exits"
          />
          <StatCard
            title="Entries Today"
            value={stats.entriesToday}
            icon={<MapPin className="h-5 w-5 text-cyan-400" />}
            description="Scanned gate returns"
          />
        </div>

        {/* Quick Hub Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/director/activity" className="group">
            <Card className="border-zinc-800 bg-zinc-900/60 hover:border-purple-500/40 hover:bg-zinc-900/90 transition-all duration-200 h-full">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-105 transition-transform">
                  <History className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                    Activity <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Past pass requests, approvals and gate movements across campus
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/director/hods" className="group">
            <Card className="border-zinc-800 bg-zinc-900/60 hover:border-indigo-500/40 hover:bg-zinc-900/90 transition-all duration-200 h-full">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition-transform">
                  <Shield className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                    HOD Directory <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Department heads directory, contact and departmental oversight
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/director/faculty" className="group">
            <Card className="border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/40 hover:bg-zinc-900/90 transition-all duration-200 h-full">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                    Faculty Directory <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Campus-wide faculty records across all academic departments
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/director/students" className="group">
            <Card className="border-zinc-800 bg-zinc-900/60 hover:border-purple-500/40 hover:bg-zinc-900/90 transition-all duration-200 h-full">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-105 transition-transform">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                    All Students Directory <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Campus-wide student registry, academic cohorts, mentors & hostel accommodation
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Academic Departments Breakdown */}
        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-400" />
              Academic Departments Breakdown
            </CardTitle>
            <p className="text-xs text-zinc-400">
              Departmental staffing, student enrollment, and HOD leadership overview across campus
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DEPARTMENTS.map((dept) => {
                const facCount = deptFacultyCounts[dept.name] || deptFacultyCounts[dept.code] || 0;
                const stuCount = deptStudentCounts[dept.name] || deptStudentCounts[dept.code] || 0;
                const hodProfile = allHODs.find(
                  (h: any) =>
                    h.faculty?.department === dept.name || h.faculty?.department === dept.code
                );

                return (
                  <div
                    key={dept.code}
                    className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {dept.code}
                        </span>
                        <span className="text-xs font-semibold text-zinc-200">{dept.name}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                        <Shield className="h-3 w-3 text-amber-400" />
                        {hodProfile ? `HOD: ${hodProfile.name}` : "No HOD Appointed"}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <span className="text-base font-extrabold text-zinc-100">{facCount}</span>
                        <span className="block text-[10px] text-zinc-400 font-medium">Faculty</span>
                      </div>
                      <div className="pl-2.5 border-l border-zinc-800">
                        <span className="text-base font-extrabold text-purple-400">{stuCount}</span>
                        <span className="block text-[10px] text-zinc-400 font-medium">Students</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Pass Activity Section */}
        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader className="flex flex-col lg:flex-row lg:items-center justify-between pb-3 gap-3">
            <div>
              <CardTitle className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <History className="h-5 w-5 text-purple-400" />
                Recent Gate Passes
              </CardTitle>
              <p className="text-xs text-zinc-400 mt-0.5">
                Latest gate passes and permissions requested across campus departments
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Category Filter: All / Faculty / Students */}
              <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => setActivityCategory("ALL")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    activityCategory === "ALL"
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActivityCategory("FACULTY")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                    activityCategory === "FACULTY"
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Briefcase className="h-3 w-3" /> Faculty
                </button>
                <button
                  onClick={() => setActivityCategory("STUDENTS")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                    activityCategory === "STUDENTS"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <GraduationCap className="h-3 w-3" /> Students
                </button>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      activeTab === tab
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {tab === "ALL" ? "All Status" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredActivity.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-sm">
                No pass activity found matching the selected filter.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
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
                    <div
                      key={item.id}
                      onClick={() => setSelectedActivity(item)}
                      className="p-4 flex items-center justify-between gap-4 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 ${
                            isStudent
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                              : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                          }`}
                        >
                          {isStudent ? (
                            <GraduationCap className="h-5 w-5" />
                          ) : (
                            <Briefcase className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-zinc-100 truncate">{requesterName}</p>
                            {idTag && (
                              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                {idTag}
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                                isStudent
                                  ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                                  : "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                              }`}
                            >
                              {isStudent ? "Student" : "Faculty"}
                            </span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {getDepartmentCode(dept)}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 mt-0.5 truncate">
                            {desig} • <span className="text-zinc-300">Purpose: {item.purpose || "Official"}</span>
                            {item.destination && ` • Destination: ${item.destination}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={item.status} />
                        <span className="text-xs text-zinc-500 hidden sm:inline">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                  {selectedActivity.student ? "Student Applicant" : "Faculty Member"}
                </span>
                <StatusBadge status={selectedActivity.status} />
              </div>
              <p className="text-base font-bold text-zinc-100">
                {selectedActivity.student?.profile?.name ||
                  selectedActivity.faculty?.profile?.name ||
                  "Requester"}
              </p>
              <p className="text-xs text-zinc-400">
                {selectedActivity.student
                  ? `Roll: ${selectedActivity.student.studentRoll} • Department of ${selectedActivity.student.department || "General"}`
                  : `${selectedActivity.faculty?.designation || "Faculty"} • Department of ${selectedActivity.faculty?.department || "General"}`}
              </p>
              {(selectedActivity.student?.profile?.phone || selectedActivity.faculty?.profile?.phone) && (
                <p className="text-xs text-zinc-400">
                  Phone: {selectedActivity.student?.profile?.phone || selectedActivity.faculty?.profile?.phone}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-500 block">Purpose</span>
                <span className="text-zinc-200 font-medium">{selectedActivity.purpose || "N/A"}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-500 block">Destination</span>
                <span className="text-zinc-200 font-medium">{selectedActivity.destination || "N/A"}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-500 block">Requested At</span>
                <span className="text-zinc-200 font-medium">{formatDateTime(selectedActivity.createdAt)}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-500 block">Approver Role</span>
                <span className="text-zinc-200 font-medium">
                  {selectedActivity.approverType === "FACULTY_ADMIN" ? "HOD" : selectedActivity.approverType || "—"}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { StatCard, StatusBadge, Modal } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { getDepartmentCode, getDepartmentFullName } from "@/lib/constants";
import {
  Users,
  CheckCircle2,
  XCircle,
  MapPin,
  ClipboardCheck,
  ShieldAlert,
  ArrowRight,
  GraduationCap,
  Briefcase,
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

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2 flex-wrap">
              HOD Dashboard
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                Head of Department
              </span>
              {faculty.department && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {getDepartmentCode(faculty.department)}
                </span>
              )}
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              {faculty.department ? (
                <>
                  <span className="text-zinc-200 font-medium">{getDepartmentFullName(faculty.department)}</span>
                  <span className="text-zinc-500"> • Oversight of Faculty & Students</span>
                </>
              ) : (
                "All Departments • Oversight of Faculty & Students"
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/faculty-admin/requests">
              <Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white">
                <ClipboardCheck className="h-4 w-4" />
                Review Requests
              </Button>
            </Link>
          </div>
        </div>

        {/* Pending Alerts Banner if there are pending faculty requests */}
        {stats.facultyPending > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-200">
                  {stats.facultyPending} Faculty Pass Request{stats.facultyPending > 1 ? "s" : ""} Awaiting Approval
                </p>
                <p className="text-xs text-amber-400/80">
                  Faculty members in your department have submitted pass requests that require HOD review.
                </p>
              </div>
            </div>
            <Link href="/faculty-admin/requests">
              <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20">
                Review Now <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}

        {/* Stats KPIs */}
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

        {/* Requests Activity */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                Department Requests & Activity
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  Recent 10
                </span>
              </CardTitle>
              <Link href="/faculty-admin/requests" className="text-xs text-orange-400 hover:underline flex items-center gap-1">
                View all requests <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none">
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
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-zinc-100 text-zinc-900 border-zinc-200"
                      : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {filteredActivity.length === 0 ? (
              <p className="text-center text-sm text-zinc-500 py-8">
                No requests found in this category.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredActivity.map((item: any) => {
                  const isFacultyPass = !!item.facultyId;
                  const name = isFacultyPass
                    ? item.faculty?.profile?.name || "Faculty Member"
                    : item.student?.profile?.name || "Student";
                  const subtext = isFacultyPass
                    ? `${item.faculty?.designation || "Faculty"} • ${item.faculty?.department || ""}`
                    : `${item.student?.studentRoll || ""} • ${item.student?.department || ""}`;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedActivity(item)}
                      className="flex items-center justify-between rounded-xl bg-zinc-800/30 px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isFacultyPass
                              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          }`}
                        >
                          {isFacultyPass ? (
                            <Briefcase className="h-4 w-4" />
                          ) : (
                            <GraduationCap className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-zinc-200 truncate">
                              {name}
                            </p>
                            <span
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                isFacultyPass
                                  ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                                  : "bg-blue-500/10 text-blue-300 border-blue-500/30"
                              }`}
                            >
                              {isFacultyPass ? "Faculty" : "Student"}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            {subtext} • {item.purpose}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                        <StatusBadge status={item.status} />
                        <span className="text-[10px] text-zinc-500">
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

      {/* Request Details Modal */}
      <Modal
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        title="Request Details"
      >
        {selectedActivity && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-1">
                  {selectedActivity.facultyId
                    ? "Faculty Member"
                    : "Student"}
                </p>
                <p className="text-sm font-medium text-zinc-200">
                  {selectedActivity.faculty?.profile?.name ||
                    selectedActivity.student?.profile?.name ||
                    "User"}
                </p>
                <p className="text-xs text-zinc-400">
                  {selectedActivity.faculty?.department ||
                    selectedActivity.student?.studentRoll ||
                    ""}
                </p>
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
                  {selectedActivity.expectedExit
                    ? formatDateTime(selectedActivity.expectedExit)
                    : "None"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Expected Return</p>
                <p className="text-sm text-zinc-200">
                  {selectedActivity.expectedReturn
                    ? formatDateTime(selectedActivity.expectedReturn)
                    : "None"}
                </p>
              </div>
              {selectedActivity.qr?.usedForExit && (
                <div className="col-span-2 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <p className="text-xs text-zinc-400 mb-1 flex items-center gap-2">
                    <MapPin className="h-3 w-3" /> Gate Scan Status
                  </p>
                  <p className="text-sm text-zinc-200">
                    {selectedActivity.qr.usedForEntry
                      ? "User has exited and returned."
                      : "User is currently outside campus."}
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

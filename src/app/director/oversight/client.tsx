"use client";

import React from "react";
import { useAppStore } from "@/stores/app-store";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/primitives";
import { DEPARTMENTS, getDepartmentCode } from "@/lib/constants";
import {
  Shield,
  Users,
  Building2,
  DoorOpen,
  MapPin,
  CheckCircle2,
  XCircle,
  GraduationCap,
  Briefcase,
  Eye,
  Activity,
} from "lucide-react";

export function DirectorOversightClient() {
  const isReady = useStoreReady();
  const dashboardData = useAppStore((s) => s.data.dashboard);
  const rawAllFaculty = useAppStore((s) => s.data.allFaculty);
  const allFaculty = rawAllFaculty || [];
  const rawAllHODs = useAppStore((s) => s.data.allHODs);
  const allHODs = rawAllHODs || [];
  const rawAllMovements = useAppStore((s) => s.data.allMovements);
  const allMovements = rawAllMovements || [];

  if (!isReady || !dashboardData) {
    return <DashboardSkeleton />;
  }

  const stats = dashboardData.stats || {
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

  // Group faculty count by department
  const deptFacultyCounts: Record<string, number> = {};
  allFaculty.forEach((f: any) => {
    const d = f.faculty?.department || "General";
    deptFacultyCounts[d] = (deptFacultyCounts[d] || 0) + 1;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
          <span>Campus Executive Oversight</span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            Full Operations View
          </span>
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Macro indicators of institutional movement, personnel, departments, and gate security
        </p>
      </div>

      {/* Campus Population Snapshot */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-purple-400" />
          Campus Population & Personnel
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            title="Enrolled Students"
            value={stats.totalStudents}
            icon={<GraduationCap className="h-5 w-5 text-blue-400" />}
            description="Undergraduate & Postgrad"
          />
          <StatCard
            title="Teaching Faculty"
            value={stats.totalFaculty}
            icon={<Briefcase className="h-5 w-5 text-emerald-400" />}
            description="Across all divisions"
          />
          <StatCard
            title="Department Heads"
            value={stats.totalHODs}
            icon={<Shield className="h-5 w-5 text-indigo-400" />}
            description="HOD leadership"
          />
          <StatCard
            title="Hostel Wardens"
            value={stats.totalWardens}
            icon={<Building2 className="h-5 w-5 text-amber-400" />}
            description="Hostel administration"
          />
          <StatCard
            title="Gate Security Staff"
            value={stats.totalSecurity}
            icon={<DoorOpen className="h-5 w-5 text-red-400" />}
            description="Active security guards"
          />
        </div>
      </div>

      {/* Today's Movement & Flow Metrics */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          Today&apos;s Gate Movement & Authorizations
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            title="Passes Approved Today"
            value={stats.approvedToday}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            description="Authorized departures"
          />
          <StatCard
            title="Passes Denied Today"
            value={stats.rejectedToday}
            icon={<XCircle className="h-5 w-5 text-red-400" />}
            description="Rejected requests"
          />
          <StatCard
            title="Recorded Gate Exits"
            value={stats.exitsToday}
            icon={<DoorOpen className="h-5 w-5 text-orange-400" />}
            description="Exit scans registered"
          />
          <StatCard
            title="Recorded Gate Entries"
            value={stats.entriesToday}
            icon={<MapPin className="h-5 w-5 text-cyan-400" />}
            description="Return scans registered"
          />
        </div>
      </div>

      {/* Department Distribution Grid */}
      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-400" />
            Academic Departments Breakdown
          </CardTitle>
          <p className="text-xs text-zinc-400">
            Faculty staffing and HOD assignment overview by department
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DEPARTMENTS.map((dept) => {
              const count = deptFacultyCounts[dept.name] || deptFacultyCounts[dept.code] || 0;
              const hasHOD = allHODs.some(
                (h: any) =>
                  h.faculty?.department === dept.name || h.faculty?.department === dept.code
              );

              return (
                <div
                  key={dept.code}
                  className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {dept.code}
                      </span>
                      <span className="text-xs font-semibold text-zinc-200">{dept.name}</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {hasHOD ? "HOD Appointed" : "No HOD Assigned"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-extrabold text-zinc-100">{count}</span>
                    <span className="block text-[10px] text-zinc-400 font-medium">Faculty</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">Campus Executive Oversight</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-400">
            <Eye className="h-3 w-3" aria-hidden="true" />
            Full Operations View
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Macro indicators of institutional movement, personnel, departments, and gate security
        </p>
      </div>

      {/* Campus Population Snapshot */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-400">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Campus Population & Personnel
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard title="Enrolled Students" value={stats.totalStudents} icon={<GraduationCap />} description="Undergraduate & Postgrad" />
          <StatCard title="Teaching Faculty" value={stats.totalFaculty} icon={<Briefcase />} description="Across all divisions" />
          <StatCard title="Department Heads" value={stats.totalHODs} icon={<Shield />} description="HOD leadership" />
          <StatCard title="Hostel Wardens" value={stats.totalWardens} icon={<Building2 />} description="Hostel administration" />
          <StatCard
            title="Gate Security Staff"
            value={stats.totalSecurity}
            icon={<DoorOpen />}
            description="Active security guards"
            className="col-span-2 sm:col-span-2 lg:col-span-1"
          />
        </div>
      </section>

      {/* Today's Movement & Flow Metrics */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-400">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Today&apos;s Gate Movement & Authorizations
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard title="Passes Approved Today" value={stats.approvedToday} icon={<CheckCircle2 />} description="Authorized departures" />
          <StatCard title="Passes Denied Today" value={stats.rejectedToday} icon={<XCircle />} description="Rejected requests" />
          <StatCard title="Recorded Gate Exits" value={stats.exitsToday} icon={<DoorOpen />} description="Exit scans registered" />
          <StatCard title="Recorded Gate Entries" value={stats.entriesToday} icon={<MapPin />} description="Return scans registered" />
        </div>
      </section>

      {/* Department Distribution Grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-orange-400" />
            Academic Departments Breakdown
          </CardTitle>
          <p className="text-xs text-zinc-500">
            Faculty staffing and HOD assignment overview by department
          </p>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {DEPARTMENTS.map((dept) => {
              const count = deptFacultyCounts[dept.name] || deptFacultyCounts[dept.code] || 0;
              const hasHOD = allHODs.some(
                (h: any) =>
                  h.faculty?.department === dept.name || h.faculty?.department === dept.code
              );

              return (
                <div key={dept.code} className="min-w-0 rounded-2xl border border-zinc-800 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-semibold text-orange-400">
                      {dept.code}
                    </span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${hasHOD ? "bg-emerald-500" : "bg-zinc-700"}`} aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-xs font-medium text-zinc-200 truncate" title={dept.name}>
                    {dept.name}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {hasHOD ? "HOD Appointed" : "No HOD Assigned"}
                  </p>
                  <div className="mt-3">
                    <span className="block text-xl font-light leading-none text-zinc-100">{count}</span>
                    <span className="mt-1 block text-[10px] text-zinc-500">Faculty</span>
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

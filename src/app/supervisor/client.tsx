"use client";

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  DoorOpen,
  GraduationCap,
  History,
  Hourglass,
  LogIn,
  Users,
  XCircle,
} from "lucide-react";
import { StatGroup, StatCard, EmptyState } from "@/components/ui/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";
import { useAppStore } from "@/stores/app-store";
import { RequestCard } from "./request-card";

export function SupervisorDashboardClient({ user }: { user: { name: string } }) {
  const isReady = useStoreReady();
  const dashboard = useAppStore((s) => s.data.dashboard);

  if (!isReady || !dashboard?.stats) return <DashboardSkeleton />;

  const s = dashboard.stats;
  const recent: any[] = dashboard.recentRequests ?? [];

  const links = [
    { href: "/supervisor/requests", icon: ClipboardCheck, title: "Requests", text: "Today's student and faculty passes" },
    { href: "/supervisor/students", icon: GraduationCap, title: "Students", text: "Student details, status and assignments" },
    { href: "/supervisor/faculty", icon: Users, title: "Faculty", text: "Faculty and HOD details" },
    { href: "/supervisor/activity", icon: History, title: "Activity", text: "Past passes and gate movements by date" },
  ];

  const firstName = (user.name || "").replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").split(" ")[0] || user.name;
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      {/* Greeting */}
      <div className="min-w-0">
        <p className="text-sm text-zinc-500">{todayLabel}</p>
        <h1 className="mt-1 text-3xl sm:text-4xl font-light tracking-tight text-zinc-100 truncate">
          {greeting}, <span className="font-medium bg-gradient-to-r from-[#ff634a] to-[#c2381f] bg-clip-text text-transparent">{firstName}</span>
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-zinc-500">
          <span className="font-medium text-zinc-300">Security Supervisor</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Campus-wide overview of student and faculty passes. Approvals are handled by HODs, wardens and the Dean.
        </p>
      </div>

      <div className="space-y-6">
        <StatGroup title="Pass requests today" gridClassName="lg:grid-cols-5">
          <StatCard title="Requests" value={s.requestsToday} icon={<ClipboardCheck />} description="Student + faculty" />
          <StatCard title="Pending (Students)" value={s.pendingStudent} icon={<Hourglass />} description="Awaiting HOD / warden" />
          <StatCard title="Pending (Faculty)" value={s.pendingFaculty} icon={<Hourglass />} description="Awaiting HOD / Dean" />
          <StatCard title="Approved" value={s.approvedToday} icon={<CheckCircle2 />} description="Passes approved" />
          <StatCard title="Rejected" value={s.rejectedToday} icon={<XCircle />} description="Requests rejected" />
        </StatGroup>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-4">
          <StatGroup title="Gate today" className="lg:col-span-3" gridClassName="sm:grid-cols-3">
            <StatCard title="Exits" value={s.exitsToday} icon={<DoorOpen />} description="Gate scans" />
            <StatCard title="Entries" value={s.entriesToday} icon={<LogIn />} description="Gate scans" />
            <StatCard title="Visitors inside" value={s.visitorsInside} icon={<Users />} description="Not checked out" />
          </StatGroup>
          <StatGroup title="People" className="lg:col-span-2">
            <StatCard title="Students" value={s.totalStudents} icon={<GraduationCap />} />
            <StatCard title="Faculty & HODs" value={s.totalFaculty} icon={<Briefcase />} />
          </StatGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
        {/* Left: recent requests */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="font-medium">Recent requests</CardTitle>
              <Link
                href="/supervisor/requests"
                className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium text-orange-400 hover:bg-orange-500/10 transition-colors"
              >
                View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {recent.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="h-6 w-6" />}
                title="No requests today"
                description="Student and faculty pass requests will appear here."
              />
            ) : (
              <div className="space-y-3">
                {recent.map((r) => (
                  <RequestCard key={r.id} r={r} compact />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: quick links */}
        <div className="min-w-0">
          <Card>
            <CardContent className="p-5 sm:p-6 space-y-3">
              <h2 className="text-base font-medium text-zinc-100">Quick links</h2>
              {links.map(({ href, icon: Icon, title, text }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-800 px-3 py-3 hover:bg-zinc-950 transition-colors"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-zinc-400">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-zinc-100">{title}</span>
                    <span className="block text-xs text-zinc-500 truncate">{text}</span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

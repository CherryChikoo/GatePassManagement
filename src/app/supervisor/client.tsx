"use client";

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  DoorOpen,
  Eye,
  GraduationCap,
  History,
  Hourglass,
  LogIn,
  Users,
  XCircle,
} from "lucide-react";
import { StatCard, EmptyState } from "@/components/ui/primitives";
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5 flex-wrap">
          Security Supervisor
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-teal-500/15 text-teal-300 border-teal-500/30">
            <Eye className="h-3 w-3" aria-hidden="true" /> View only
          </span>
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Welcome, {user.name}. Campus-wide overview of student and faculty passes. Approvals are handled by HODs,
          wardens and the Dean.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Requests Today" value={s.requestsToday} icon={<ClipboardCheck className="h-5 w-5 text-teal-400" />} description="Student + faculty" />
        <StatCard title="Pending (Students)" value={s.pendingStudent} icon={<Hourglass className="h-5 w-5 text-amber-400" />} description="Awaiting HOD / warden" />
        <StatCard title="Pending (Faculty)" value={s.pendingFaculty} icon={<Hourglass className="h-5 w-5 text-amber-400" />} description="Awaiting HOD / Dean" />
        <StatCard title="Approved Today" value={s.approvedToday} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} />
        <StatCard title="Rejected Today" value={s.rejectedToday} icon={<XCircle className="h-5 w-5 text-red-400" />} />
        <StatCard title="Exits Today" value={s.exitsToday} icon={<DoorOpen className="h-5 w-5 text-orange-400" />} description="Gate scans" />
        <StatCard title="Entries Today" value={s.entriesToday} icon={<LogIn className="h-5 w-5 text-cyan-400" />} description="Gate scans" />
        <StatCard title="Students" value={s.totalStudents} icon={<GraduationCap className="h-5 w-5 text-blue-400" />} />
        <StatCard title="Faculty & HODs" value={s.totalFaculty} icon={<Briefcase className="h-5 w-5 text-indigo-400" />} />
        <StatCard title="Visitors Inside" value={s.visitorsInside} icon={<Users className="h-5 w-5 text-zinc-300" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {links.map(({ href, icon: Icon, title, text }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-teal-500/40 transition-colors"
          >
            <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
              <Icon className="h-4 w-4 text-teal-400" aria-hidden="true" />
              {title}
              <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
            </div>
            <p className="text-xs text-zinc-400 mt-1">{text}</p>
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Recent requests</h2>
          <Link href="/supervisor/requests" className="text-xs text-teal-400 hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
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
      </section>
    </div>
  );
}

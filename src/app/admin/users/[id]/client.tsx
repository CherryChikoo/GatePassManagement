"use client";
import { ThemedSelect } from "@/components/ui/themed-select";
import { DateField } from "@/components/ui/date-field";
import { ResetPasswordButton } from "@/components/users/reset-password-button";
import { UserEditModal } from "@/components/users/user-edit-modal";
import { PagerBar } from "@/components/ui/pager-bar";
import { dt } from "@/components/ui/data-table";
import { PassFullDetails, prefetchPassDetails } from "@/components/passes/pass-full-details";
import { istDateString } from "@/lib/time/ist";
import { scheduledNote } from "@/lib/pass-dates";
import { actionErrorMessage } from "@/lib/deployment";
import { adminNavItems, facultyNavItems, wardenNavItems, securityNavItems } from "@/components/dashboard/layout";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  Badge,
  StatusBadge,
  StatCard,
  EmptyState,
  Modal,
} from "@/components/ui/primitives";
import {
  formatDateTime,
  formatDate,
  getRelativeTime,
  getStatusColor,
  cn,
} from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import {
  toggleUserActive,
} from "@/server/actions/admin";
import { BackButton } from "@/components/ui/back-button";
import {
  ArrowLeft,
  Pencil,
  History,
  DoorOpen,
  ClipboardCheck,
  Calendar,
  MapPin,
  User,
  GraduationCap,
  Building2,
  Users,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Power,
  Phone,
  Mail,
  Search,
  ExternalLink,
  ChevronRight,
  Info,
  Layers,
  AlertCircle,
  LogIn,
  LogOut,
} from "lucide-react";

interface Props {
  currentUser: { name: string; email: string; role: string };
  targetUser: any;
  faculty: any[];
  wardens: any[];
  gates: any[];
}

export function UserDetailClient({
  currentUser,
  targetUser,
  faculty,
  wardens,
  gates,
}: Props) {
  const router = useRouter();
  const [user, setUser] = useState(targetUser);
  // Saved in the Edit window → the page reloads its data: show the new details
  const [shownTarget, setShownTarget] = useState(targetUser);
  if (targetUser !== shownTarget) {
    setShownTarget(targetUser);
    setUser(targetUser);
  }
  const [activeTab, setActiveTab] = useState<
    "overview" | "activity" | "permissions" | "movements"
  >("overview");
  const [permissionFilter, setPermissionFilter] = useState("ALL");
  const [movementFilter, setMovementFilter] = useState("ALL");
  const [permSearch, setPermSearch] = useState("");
  const [movSearch, setMovSearch] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  // A pass opened from "Past Permissions Taken"
  const [openPassId, setOpenPassId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // The Edit window (the same one as in Admin → Users)
  const [editOpen, setEditOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState("ALL"); // ALL, TODAY, WEEK, MONTH, DATE
  const [specificDate, setSpecificDate] = useState(() => istDateString());
  const [permPage, setPermPage] = useState(1);
  const PERM_PAGE_SIZE = 10;

  // Determine back link and nav items based on viewer's role
  const backHref =
    currentUser.role === "FACULTY"
      ? "/faculty/students"
      : currentUser.role === "WARDEN"
        ? "/warden/requests"
        : "/admin/users";

  const navItems =
    currentUser.role === "FACULTY"
      ? facultyNavItems
      : currentUser.role === "WARDEN"
        ? wardenNavItems
        : adminNavItems;

  const isStudent = user.role === "STUDENT";
  const student = user.student;
  const permissions: any[] = student?.permissions || [];
  const movements: any[] = student?.movements || [];

  // Computed stats for student
  const totalPermissions = permissions.length;
  const approvedPermissions = permissions.filter((p) =>
    ["APPROVED", "EXITED", "COMPLETED"].includes(p.status),
  ).length;
  const pendingPermissions = permissions.filter(
    (p) => p.status === "PENDING",
  ).length;
  const rejectedPermissions = permissions.filter(
    (p) => p.status === "REJECTED",
  ).length;
  const totalMovements = movements.length;
  const totalExits = movements.filter((m) => m.type === "EXIT").length;
  const totalEntries = movements.filter((m) => m.type === "ENTRY").length;

  // Date Filtering Helper
  const isWithinDate = (dateString: string) => {
    if (dateFilter === "ALL") return true;
    if (!dateString) return true;
    // A specific IST day
    if (dateFilter === "DATE") return !specificDate || istDateString(new Date(dateString)) === specificDate;
    const date = new Date(dateString);
    const now = new Date();
    if (dateFilter === "TODAY") {
      return date.toDateString() === now.toDateString();
    }
    if (dateFilter === "WEEK") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= weekAgo;
    }
    if (dateFilter === "MONTH") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return date >= monthAgo;
    }
    return true;
  };

  // Filtered permissions
  const filteredPermissions = permissions.filter((p) => {
    if (!isWithinDate(p.createdAt)) return false;
    const matchesFilter =
      permissionFilter === "ALL"
        ? true
        : permissionFilter === "APPROVED"
          ? ["APPROVED", "EXITED", "COMPLETED"].includes(p.status)
          : p.status === permissionFilter;

    const q = permSearch.toLowerCase();
    const matchesSearch =
      !q ||
      p.purpose?.toLowerCase().includes(q) ||
      p.destination?.toLowerCase().includes(q) ||
      p.status?.toLowerCase().includes(q);

    return matchesFilter && matchesSearch;
  });

  // 10 passes per page (filters reset to page 1)
  const permPages = Math.max(1, Math.ceil(filteredPermissions.length / PERM_PAGE_SIZE));
  const safePermPage = Math.min(permPage, permPages);
  const pagedPermissions = filteredPermissions.slice((safePermPage - 1) * PERM_PAGE_SIZE, safePermPage * PERM_PAGE_SIZE);

  // Filtered movements
  const filteredMovements = movements.filter((m) => {
    if (!isWithinDate(m.createdAt)) return false;
    const matchesFilter =
      movementFilter === "ALL" ? true : m.type === movementFilter;
    const q = movSearch.toLowerCase();
    const matchesSearch =
      !q ||
      m.gate?.name?.toLowerCase().includes(q) ||
      m.securityUser?.profile?.name?.toLowerCase().includes(q) ||
      m.permission?.purpose?.toLowerCase().includes(q);

    return matchesFilter && matchesSearch;
  });

  // Handle active status toggle
  async function handleToggleStatus() {
    const wasActive = user.active;
    setToggling(true);
    setToggleError(null);
    setSuccess(null);
    try {
      const res = await toggleUserActive(user.id);
      if (res?.error) {
        setToggleError(res.error);
      } else {
        setUser((prev: any) => ({ ...prev, active: !wasActive }));
        setSuccess(wasActive ? `${user.name} is disabled and can no longer sign in.` : `${user.name} can sign in again.`);
        router.refresh();
      }
    } catch (err: any) {
      setToggleError(actionErrorMessage(err, "Could not change the account status. Please try again."));
    } finally {
      setToggling(false);
    }
  }

  // Handle save edit details
  // Who may set this person's login password (same rules as the server)
  const canEdit =
    (currentUser.role === "ADMIN" && user.role !== "ADMIN") ||
    (["FACULTY_ADMIN", "WARDEN", "FACULTY"].includes(currentUser.role) && user.role === "STUDENT");
  const canSetPassword =
    (currentUser.role === "ADMIN" && user.role !== "ADMIN") ||
    (currentUser.role === "FACULTY_ADMIN" && (user.role === "STUDENT" || user.role === "FACULTY")) ||
    (currentUser.role === "WARDEN" && user.role === "STUDENT");

  // ── Visual helpers (markup only) ─────────────────────────────
  const labelCls = "text-[11px] font-medium uppercase tracking-wider text-zinc-500";
  const valueCls = "mt-0.5 text-sm text-zinc-200 break-words";
  const pillSelectCls =
    "h-10 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10";
  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 sm:py-1.5 rounded-full transition-colors whitespace-nowrap ${
      active ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
    }`;
  const cardHeading = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-3 pb-4 border-b border-zinc-800/70">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
        {icon}
      </span>
      <h3 className="text-base font-medium text-zinc-100">{title}</h3>
    </div>
  );

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8 pb-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Breadcrumb Navigation */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500 min-w-0">
            <BackButton href={backHref} label="Back to Users" className="-ml-3" />
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
            <span className="text-zinc-300 font-medium truncate max-w-[12rem] sm:max-w-xs">{user.name}</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
            <span className="text-orange-400 font-medium">
              Activity & Permissions
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemedSelect
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPermPage(1);
              }}
              aria-label="Date range"
              className={`${pillSelectCls} flex-1 sm:flex-none`}
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="WEEK">Last 7 Days</option>
              <option value="MONTH">Last 30 Days</option>
              <option value="DATE">Pick a date…</option>
            </ThemedSelect>
            {dateFilter === "DATE" && (
              <DateField
                aria-label="Date"
                value={specificDate}
                max={istDateString()}
                onChange={(e) => {
                  setSpecificDate(e.target.value);
                  setPermPage(1);
                }}
                className={`${pillSelectCls} flex-1 sm:flex-none [color-scheme:light]`}
              />
            )}
          </div>
        </div>

        {/* Success Alert */}
        {success && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 animate-scale-in">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}
        {toggleError && (
          <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 animate-scale-in">
            {toggleError}
          </div>
        )}

        {/* Profile header */}
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              {/* Left: User Identity */}
              <div className="flex items-start gap-4 sm:gap-5 min-w-0">
                <div className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-xl sm:text-2xl font-semibold">
                  {user.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>

                <div className="space-y-2 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 break-words">
                    {user.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    {student?.studentRoll && (
                      <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 font-mono text-xs text-zinc-300">
                        {student.studentRoll}
                      </span>
                    )}
                    <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-medium text-orange-400">
                      {user.role === "FACULTY_ADMIN" ? "HOD" : user.role}
                    </span>
                    {student && (
                      <Badge variant={student.studentType === "HOSTELLER" ? "info" : "default"}>
                        {student.studentType === "HOSTELLER"
                          ? "Hosteller"
                          : "Day Scholar"}
                      </Badge>
                    )}
                    <Badge variant={user.active ? "success" : "danger"}>
                      {user.active ? "Active Account" : "Account Disabled"}
                    </Badge>
                  </div>

                  {/* Secondary info */}
                  <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs sm:text-sm text-zinc-500">
                    <span className="flex items-center gap-1.5 text-zinc-300 min-w-0 break-all">
                      <Mail className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                      {user.email}
                    </span>
                    {user.phone && (
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <Phone className="h-3.5 w-3.5 text-zinc-500" />
                        {user.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Joined {formatDate(user.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Quick Actions */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
                {canEdit && (
                  <Button onClick={() => setEditOpen(true)} variant="outline" size="sm" className="h-10 sm:h-9">
                    <Pencil className="h-3.5 w-3.5 text-orange-400" />
                    Edit details
                  </Button>
                )}
                {(currentUser.role === "ADMIN" || (currentUser.role === "FACULTY_ADMIN" && user.role === "STUDENT")) && (
                  <Button
                    onClick={handleToggleStatus}
                    loading={toggling}
                    variant="outline"
                    size="sm"
                    className="h-10 sm:h-9"
                  >
                    <Power className="h-3.5 w-3.5" />
                    {user.active ? "Disable" : "Enable"}
                  </Button>
                )}
                {canSetPassword && (
                  <ResetPasswordButton profileId={user.id} name={user.name} className="col-span-2 sm:col-span-1" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Summary Cards */}
        {isStudent ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatCard
              title="Total Requests"
              value={totalPermissions}
              icon={<ClipboardCheck />}
            />
            <StatCard
              title="Accepted"
              value={approvedPermissions}
              icon={<CheckCircle2 />}
            />
            <StatCard
              title="Rejected"
              value={rejectedPermissions}
              icon={<AlertCircle />}
            />
            <StatCard
              title="Exits"
              value={totalExits}
              icon={<LogOut />}
            />
            <StatCard
              title="Entries"
              value={totalEntries}
              icon={<LogIn />}
              className="col-span-2 lg:col-span-1"
            />
          </div>
        ) : user.role === "FACULTY" ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Assigned Students"
              value={user.faculty?.assignedStudents?.length || 0}
              icon={<Users />}
            />
            <StatCard
              title="Approvals Handled"
              value={user.faculty?.permissionApprovals?.length || 0}
              icon={<ClipboardCheck />}
            />
            <StatCard
              title="Department"
              value={user.faculty?.department || "General"}
              icon={<GraduationCap />}
            />
            <StatCard
              title="Designation"
              value={user.faculty?.designation || "Faculty"}
              icon={<User />}
            />
          </div>
        ) : user.role === "WARDEN" ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Assigned Hostellers"
              value={user.warden?.assignedHostellers?.length || 0}
              icon={<Users />}
            />
            <StatCard
              title="Hostel Block"
              value={
                user.warden?.hostelBlock
                  ? `Block ${user.warden.hostelBlock}`
                  : "All"
              }
              icon={<Building2 />}
            />
            <StatCard
              title="Approvals Handled"
              value={user.warden?.permissionApprovals?.length || 0}
              icon={<ClipboardCheck />}
            />
            <StatCard
              title="Employee ID"
              value={user.warden?.employeeId || "N/A"}
              icon={<Shield />}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <StatCard
              title="Movements Processed"
              value={user.securityStaff?.movements?.length || 0}
              icon={<DoorOpen />}
            />
            <StatCard
              title="Assigned Gate"
              value={user.securityStaff?.gate?.name || "Unassigned"}
              icon={<MapPin />}
            />
            <StatCard
              title="Employee ID"
              value={user.securityStaff?.employeeId || "N/A"}
              icon={<Shield />}
              className="col-span-2 lg:col-span-1"
            />
          </div>
        )}

        {/* Tab Navigation */}
        <div
          className="inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="User sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
            className={tabCls(activeTab === "overview")}
          >
            <Info className="h-3.5 w-3.5" />
            Full Details & Overview
          </button>

          {isStudent && (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "activity"}
                onClick={() => setActiveTab("activity")}
                className={tabCls(activeTab === "activity")}
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Permissions & Gate Activity
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${activeTab === "activity" ? "bg-orange-500/10 text-orange-400" : "bg-zinc-900 text-zinc-500"}`}>
                  {totalPermissions + totalMovements}
                </span>
              </button>
            </>
          )}

        </div>

        {/* Tab 1: Full Details & Overview */}
        {activeTab === "overview" && (
          <div className="space-y-4 lg:space-y-6 animate-fade-in">
            {isStudent ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                {/* Academic Cohort Card */}
                <Card>
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    {cardHeading(<GraduationCap className="h-4 w-4" />, "Academic Cohort")}
                    <div className="space-y-3">
                      <div>
                        <span className={labelCls}>Roll Number</span>
                        <p className="mt-0.5 font-mono text-base font-medium text-zinc-100">
                          {student?.studentRoll || "Unassigned"}
                        </p>
                      </div>
                      <div>
                        <span className={labelCls}>Department</span>
                        <p className={valueCls}>
                          {student?.department || "General Department"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className={labelCls}>Academic Year</span>
                          <p className={valueCls}>
                            {student?.year ? `Year ${student.year}` : "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className={labelCls}>Section</span>
                          <p className={valueCls}>
                            {student?.section
                              ? `Section ${student.section}`
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Residency & Hostel Card */}
                <Card>
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    {cardHeading(<Building2 className="h-4 w-4" />, "Residency & Housing")}
                    <div className="space-y-3">
                      <div>
                        <span className={labelCls}>Student Type</span>
                        <div className="mt-1.5">
                          <Badge variant={student?.studentType === "HOSTELLER" ? "info" : "default"}>
                            {student?.studentType === "HOSTELLER"
                              ? "Hosteller (Campus Resident)"
                              : "Day Scholar (Commuter)"}
                          </Badge>
                        </div>
                      </div>
                      {student?.studentType === "HOSTELLER" ? (
                        <>
                          <div>
                            <span className={labelCls}>Hostel Block</span>
                            <p className={valueCls}>
                              {student.hostelBlock
                                ? `Block ${student.hostelBlock}`
                                : "Block not assigned"}
                            </p>
                          </div>
                          <div>
                            <span className={labelCls}>Room Number</span>
                            <p className={valueCls}>
                              {student.roomNumber
                                ? `Room ${student.roomNumber}`
                                : "Room not assigned"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-zinc-500 pt-1">
                          This student is a Day Scholar and commutes daily to
                          campus.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Mentorship & Supervision */}
                <Card className="md:col-span-2 xl:col-span-1">
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    {cardHeading(<Users className="h-4 w-4" />, "Mentors & Supervision")}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3">
                      <div className="rounded-2xl bg-zinc-950 p-3.5 space-y-1 min-w-0">
                        <span className={labelCls}>Faculty Advisor</span>
                        <p className="text-sm font-medium text-zinc-100">
                          {student?.faculty?.profile?.name ||
                            "No Faculty Assigned"}
                        </p>
                        {student?.faculty?.profile?.email && (
                          <p className="text-xs text-zinc-500 break-all">
                            {student.faculty.profile.email}
                          </p>
                        )}
                        {student?.faculty?.profile?.phone && (
                          <p className="text-xs text-zinc-500">
                            {student.faculty.profile.phone}
                          </p>
                        )}
                      </div>

                      {student?.studentType === "HOSTELLER" && (
                        <div className="rounded-2xl bg-zinc-950 p-3.5 space-y-1 min-w-0">
                          <span className={labelCls}>Hostel Warden</span>
                          <p className="text-sm font-medium text-zinc-100">
                            {student?.warden?.profile?.name ||
                              "No Warden Assigned"}
                          </p>
                          {student?.warden?.profile?.email && (
                            <p className="text-xs text-zinc-500 break-all">
                              {student.warden.profile.email}
                            </p>
                          )}
                          {student?.warden?.profile?.phone && (
                            <p className="text-xs text-zinc-500">
                              {student.warden.profile.phone}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* Non-Student Profile Details */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                <Card>
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    {cardHeading(<Shield className="h-4 w-4" />, "Staff Information")}
                    <div className="space-y-3">
                      <div>
                        <span className={labelCls}>Employee ID</span>
                        <p className="mt-0.5 font-mono text-sm font-medium text-zinc-100">
                          {user.faculty?.employeeId ||
                            user.warden?.employeeId ||
                            user.securityStaff?.employeeId ||
                            "N/A"}
                        </p>
                      </div>
                      {user.role === "FACULTY" && (
                        <>
                          <div>
                            <span className={labelCls}>Department</span>
                            <p className={valueCls}>
                              {user.faculty?.department || "N/A"}
                            </p>
                          </div>
                          <div>
                            <span className={labelCls}>Designation</span>
                            <p className={valueCls}>
                              {user.faculty?.designation || "Faculty"}
                            </p>
                          </div>
                        </>
                      )}
                      {user.role === "WARDEN" && (
                        <div>
                          <span className={labelCls}>Hostel Block</span>
                          <p className={valueCls}>
                            {user.warden?.hostelBlock
                              ? `Block ${user.warden.hostelBlock}`
                              : "All Blocks"}
                          </p>
                        </div>
                      )}
                      {user.role === "SECURITY" && (
                        <div>
                          <span className={labelCls}>Assigned Gate</span>
                          <p className={valueCls}>
                            {user.securityStaff?.gate?.name
                              ? `${user.securityStaff.gate.name} (${user.securityStaff.gate.location || "Main"})`
                              : "Unassigned Gate"}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    {cardHeading(<User className="h-4 w-4" />, "Account & Contact")}
                    <div className="space-y-3">
                      <div>
                        <span className={labelCls}>Full Name</span>
                        <p className={valueCls}>{user.name}</p>
                      </div>
                      <div>
                        <span className={labelCls}>Email Address</span>
                        <p className="mt-0.5 text-sm text-zinc-200 break-all">
                          {user.email}
                        </p>
                      </div>
                      <div>
                        <span className={labelCls}>Phone Number</span>
                        <p className={valueCls}>
                          {user.phone || "Not provided"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Quick Preview of Recent Permissions & Recent Movements */}
            {isStudent && (
              <Card>
                <div className="flex items-center gap-2 px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
                  <History className="h-4 w-4 text-orange-400" />
                  <h3 className="text-base font-medium text-zinc-100">
                    Unified Activity Timeline
                  </h3>
                </div>
                <CardContent className="px-5 sm:px-6 pb-3 sm:pb-4">
                  <ul className="divide-y divide-zinc-800/70">
                    {[
                      ...permissions.map((p) => ({
                        ...p,
                        activityType: "PERMISSION",
                      })),
                      ...movements.map((m) => ({
                        ...m,
                        activityType: "MOVEMENT",
                      })),
                    ]
                      .sort(
                        (a, b) =>
                          new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime(),
                      )
                      .slice(0, 8)
                      .map((item: any) => (
                        <li
                          key={`${item.activityType}-${item.id}`}
                          className="flex items-center gap-3 sm:gap-4 py-3"
                        >
                          {item.activityType === "PERMISSION" ? (
                            <>
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                                <ClipboardCheck className="h-4 w-4" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-100 break-words">
                                  Pass Requested: {item.purpose}
                                </p>
                                <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5 min-w-0">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {item.destination || "Not specified"} •
                                    Exit: {formatDateTime(item.exitDate)}
                                  </span>
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <StatusBadge status={item.status} />
                                <p className="text-[11px] text-zinc-500">
                                  {getRelativeTime(item.createdAt)}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <span
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                                  item.type === "EXIT"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-emerald-500/10 text-emerald-400"
                                }`}
                              >
                                <DoorOpen className="h-4 w-4" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                                      item.type === "EXIT"
                                        ? "bg-amber-500/10 text-amber-400"
                                        : "bg-emerald-500/10 text-emerald-400"
                                    }`}
                                  >
                                    {item.type}
                                  </span>
                                  <p className="text-sm font-medium text-zinc-200 truncate">
                                    {item.gate?.name || "Gate"}
                                  </p>
                                </div>
                                <p className="text-xs text-zinc-500 mt-0.5 truncate">
                                  Officer:{" "}
                                  {item.securityUser?.profile?.name ||
                                    "Security Staff"}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs text-zinc-300">
                                  {formatDateTime(item.createdAt)}
                                </p>
                                <p className="text-[11px] text-zinc-500 mt-0.5">
                                  {getRelativeTime(item.createdAt)}
                                </p>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    {permissions.length === 0 && movements.length === 0 && (
                      <li className="py-12 text-center text-sm text-zinc-500">
                        No activity recorded yet.
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Tab 2: Permissions & Gate Activity */}
        {activeTab === "activity" && isStudent && (
          <div className="animate-fade-in">
            <Card className="overflow-hidden">
              {/* Header: title, status filter, search */}
              <div className="space-y-4 px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
                <h3 className="text-base font-medium text-zinc-100 flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-orange-400" />
                  Past Permissions Taken
                </h3>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div
                    className="inline-flex max-w-full self-start rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
                    role="tablist"
                    aria-label="Filter permissions"
                  >
                    {["ALL", "APPROVED", "PENDING", "REJECTED", "EXITED"].map(
                      (status) => (
                        <button
                          key={status}
                          type="button"
                          role="tab"
                          aria-selected={permissionFilter === status}
                          onClick={() => setPermissionFilter(status)}
                          className={tabCls(permissionFilter === status)}
                        >
                          {status.charAt(0) + status.slice(1).toLowerCase()}
                        </button>
                      ),
                    )}
                  </div>

                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                    <input
                      value={permSearch}
                      onChange={(e) => setPermSearch(e.target.value)}
                      placeholder="Filter permissions..."
                      aria-label="Filter permissions"
                      className="h-10 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
                    />
                  </div>
                </div>
              </div>

              {/* Phone: stacked pass cards */}
              {pagedPermissions.length > 0 && (
                <ul className="md:hidden divide-y divide-zinc-800/70 border-t border-zinc-800/70 px-5">
                  {pagedPermissions.map((p) => {
                    const exitMove = p.movements?.find(
                      (m: any) => m.type === "EXIT",
                    );
                    const entryMove = p.movements?.find(
                      (m: any) => m.type === "ENTRY",
                    );
                    return (
                      <li
                        key={p.id}
                        onPointerDown={() => prefetchPassDetails(p.id)} onClick={() => setOpenPassId(p.id)}
                        className="py-4 space-y-3 cursor-pointer transition-colors active:bg-zinc-950/70"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-100 break-words">{p.purpose}</p>
                            {p.destination && (
                              <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="break-words">{p.destination}</span>
                              </p>
                            )}
                          </div>
                          <div className="shrink-0">
                            <StatusBadge status={p.status} />
                          </div>
                        </div>
                        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-zinc-950 p-3 text-xs">
                          <div className="min-w-0">
                            <dt className={labelCls}>Exit Schedule</dt>
                            <dd className="mt-0.5 text-zinc-200">{formatDateTime(p.exitDate)}</dd>
                            {p.expectedExit && (
                              <dd className="text-[11px] text-zinc-500">Target: {formatDateTime(p.expectedExit)}</dd>
                            )}
                          </div>
                          <div className="min-w-0">
                            <dt className={labelCls}>Expected Return</dt>
                            <dd className="mt-0.5 text-zinc-200">
                              {p.expectedReturn ? formatDateTime(p.expectedReturn) : <span className="text-zinc-500 italic">Same Day Return</span>}
                            </dd>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <dt className={labelCls}>Review & Approval</dt>
                            <dd className="mt-0.5">
                              <ApprovalSummary p={p} />
                            </dd>
                          </div>
                        </dl>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          {exitMove || entryMove ? (
                            <>
                              {exitMove && (
                                <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-amber-400">
                                  Exited: {formatDateTime(exitMove.createdAt)} ({exitMove.gate?.name || "Gate"})
                                </span>
                              )}
                              {entryMove && (
                                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-emerald-400">
                                  Returned: {formatDateTime(entryMove.createdAt)} ({entryMove.gate?.name || "Gate"})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-zinc-500 italic">No gate scan yet</span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          Requested {formatDateTime(p.createdAt)}{scheduledNote(p)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Tablet & desktop: table */}
              <div className={`hidden md:block ${dt.wrap}`}>
                <table className={cn(dt.table, "min-w-[900px]")}>
                  <thead>
                    <tr>
                      <th className={dt.th}>Purpose & Destination</th>
                      <th className={dt.th}>Exit Schedule</th>
                      <th className={dt.th}>Expected Return</th>
                      <th className={dt.th}>Review & Approval</th>
                      <th className={dt.th}>Status</th>
                      <th className={dt.thRight}>Gate Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPermissions.map((p) => {
                      const exitMove = p.movements?.find(
                        (m: any) => m.type === "EXIT",
                      );
                      const entryMove = p.movements?.find(
                        (m: any) => m.type === "ENTRY",
                      );

                      return (
                        <tr key={p.id} className={dt.trClickable} onPointerDown={() => prefetchPassDetails(p.id)} onClick={() => setOpenPassId(p.id)}>
                          {/* Purpose & Destination */}
                          <td className={dt.td}>
                            <p className="font-medium text-zinc-100">
                              {p.purpose}
                            </p>
                            {p.destination && (
                              <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {p.destination}
                              </p>
                            )}
                            <p className="text-[11px] text-zinc-500 mt-1">
                              Requested {formatDateTime(p.createdAt)}{scheduledNote(p)}
                            </p>
                          </td>

                          {/* Exit Schedule */}
                          <td className={`${dt.td} text-xs`}>
                            <p className="text-zinc-200 tabular-nums">
                              {formatDateTime(p.exitDate)}
                            </p>
                            {p.expectedExit && (
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                Target: {formatDateTime(p.expectedExit)}
                              </p>
                            )}
                          </td>

                          {/* Expected Return */}
                          <td className={`${dt.td} text-xs`}>
                            {p.expectedReturn ? (
                              <p className="text-zinc-200 tabular-nums">
                                {formatDateTime(p.expectedReturn)}
                              </p>
                            ) : (
                              <span className="text-zinc-500 italic">
                                Same Day Return
                              </span>
                            )}
                          </td>

                          {/* Review & Approval */}
                          <td className={`${dt.td} text-xs`}>
                            <ApprovalSummary p={p} />
                          </td>

                          {/* Status */}
                          <td className={dt.td}>
                            <StatusBadge status={p.status} />
                          </td>

                          {/* Gate Movement linked */}
                          <td className={`${dt.td} text-right text-xs`}>
                            {exitMove || entryMove ? (
                              <div className="flex flex-col items-end gap-1">
                                {exitMove && (
                                  <span className="inline-block rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-400">
                                    Exited:{" "}
                                    {formatDateTime(exitMove.createdAt)} (
                                    {exitMove.gate?.name || "Gate"})
                                  </span>
                                )}
                                {entryMove && (
                                  <span className="inline-block rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-400">
                                    Returned:{" "}
                                    {formatDateTime(entryMove.createdAt)} (
                                    {entryMove.gate?.name || "Gate"})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-500 text-xs italic">
                                No gate scan yet
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <PagerBar page={safePermPage} pageSize={PERM_PAGE_SIZE} total={filteredPermissions.length} onPageChange={setPermPage} itemLabel="passes" />

              {filteredPermissions.length === 0 && (
                <div className="border-t border-zinc-800/70">
                  <EmptyState
                    icon={
                      <ClipboardCheck className="h-8 w-8 text-zinc-500" />
                    }
                    title="No permissions match this filter"
                    description="Try adjusting your status filter or search query."
                  />
                </div>
              )}
            </Card>
          </div>
        )}

      </div>

      <UserEditModal
        user={editOpen ? user : null}
        onClose={() => setEditOpen(false)}
        onSaved={(message) => {
          setEditOpen(false);
          setSuccess(message);
          router.refresh();
          setTimeout(() => setSuccess(null), 4000);
        }}
        faculty={faculty}
        wardens={wardens}
        gates={gates}
        canSetPassword={canSetPassword}
      />

      {/* A pass from "Past Permissions Taken": every detail */}
      <Modal open={!!openPassId} onClose={() => setOpenPassId(null)} title="Pass Details" className="max-w-2xl">
        {openPassId && (
          <PassFullDetails
            permissionId={openPassId}
            preview={{ ...(student ? { student: { profile: { name: user.name }, studentRoll: student.studentRoll } } : {}), ...permissions.find((x) => x.id === openPassId) }}
          />
        )}
      </Modal>
    </>
  );
}

const APPROVER_ROLE: Record<string, string> = {
  FACULTY: "Faculty mentor",
  FACULTY_ADMIN: "HOD",
  WARDEN: "Warden",
  DEAN: "Dean",
  DIRECTOR: "Director",
};

/** Review & Approval, from the pass's real state (not only the approval record). */
function ApprovalSummary({ p }: { p: any }) {
  const who = p.approval?.faculty?.profile?.name || p.approval?.warden?.profile?.name || null;
  const role = APPROVER_ROLE[p.approval?.approverType ?? p.approverType] ?? null;
  const approvedStates = ["APPROVED", "EXITED", "COMPLETED"];
  if (p.status === "REJECTED" || p.approval?.approved === false) {
    return (
      <div className="space-y-0.5">
        <p className="font-medium text-red-400">Rejected{who ? ` by ${who}` : ""}</p>
        {(p.rejectionReason || p.approval?.reason) && (
          <p className="text-red-400/80 italic break-words">&ldquo;{p.rejectionReason || p.approval?.reason}&rdquo;</p>
        )}
      </div>
    );
  }
  if (p.approval?.approved || p.approvedAt || approvedStates.includes(p.status)) {
    return (
      <div className="space-y-0.5">
        <p className="font-medium text-emerald-500">
          Approved{who ? ` by ${who}` : role ? ` · ${role}` : ""}
        </p>
        {who && role && <p className="text-zinc-500">{role}</p>}
        {p.approvedAt && <p className="text-zinc-500 tabular-nums">{formatDateTime(p.approvedAt)}</p>}
        {p.approval?.reason && <p className="text-zinc-500 break-words">Note: {p.approval.reason}</p>}
      </div>
    );
  }
  if (p.status === "CANCELLED") return <span className="text-zinc-500">Cancelled</span>;
  if (p.status === "EXPIRED") return <span className="text-zinc-500">Expired before approval</span>;
  return <span className="text-amber-400 italic">Pending review</span>;
}

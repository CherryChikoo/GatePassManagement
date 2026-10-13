"use client";
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
} from "@/components/ui/primitives";
import {
  formatDateTime,
  formatDate,
  getRelativeTime,
  getStatusColor,
} from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import {
  toggleUserActive,
  updateStudentDetails,
  updateUserDetails,
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
  AlertTriangle,
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
  const [activeTab, setActiveTab] = useState<
    "overview" | "activity" | "permissions" | "movements" | "edit"
  >("overview");
  const [permissionFilter, setPermissionFilter] = useState("ALL");
  const [movementFilter, setMovementFilter] = useState("ALL");
  const [permSearch, setPermSearch] = useState("");
  const [movSearch, setMovSearch] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState("ALL"); // ALL, TODAY, WEEK, MONTH
  const [editStudentType, setEditStudentType] = useState(targetUser?.student?.studentType || "DAY_SCHOLAR");

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
    setToggling(true);
    setUser((prev: any) => ({ ...prev, active: !prev.active }));
    await toggleUserActive(user.id);
    setToggling(false);
    router.refresh();
  }

  // Handle save edit details
  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditLoading(true);
    setEditError(null);

    const formData = new FormData(e.currentTarget);

    try {
      if (isStudent && student) {
        const res = await updateStudentDetails(student.id, {
          name: formData.get("name") as string,
          phone: formData.get("phone") as string,
          studentRoll: formData.get("studentRoll") as string,
          department: formData.get("department") as string,
          year: formData.get("year") ? Number(formData.get("year")) : null,
          section: formData.get("section") as string,
          studentType: formData.get("studentType") as any,
          facultyId: (formData.get("facultyId") as string) || null,
          wardenId: (formData.get("wardenId") as string) || null,
          roomNumber: (formData.get("roomNumber") as string) || null,
          hostelBlock: (formData.get("hostelBlock") as string) || null,
        });

        if (res?.error) {
          setEditError(res.error);
          setEditLoading(false);
          return;
        }
      } else {
        const res = await updateUserDetails(user.id, {
          name: formData.get("name") as string,
          phone: formData.get("phone") as string,
          employeeId: formData.get("employeeId") as string,
          department: formData.get("department") as string,
          designation: formData.get("designation") as string,
          hostelBlock: formData.get("hostelBlock") as string,
          gateId: formData.get("gateId") as string,
        });

        if (res?.error) {
          setEditError(res.error);
          setEditLoading(false);
          return;
        }
      }

      setSuccess("User details updated successfully!");
      setActiveTab("overview");
      router.refresh();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setEditError(err.message || "Failed to update user");
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <>
      <div className="space-y-6 pb-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <BackButton href={backHref} label="Back to Users" />
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
            <span className="text-zinc-300 font-semibold">{user.name}</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
            <span className="text-orange-400 font-medium">
              Activity & Permissions
            </span>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-8 px-2.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="WEEK">Last 7 Days</option>
              <option value="MONTH">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Success Alert */}
        {success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3 text-emerald-400 text-sm animate-scale-in">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Hero User Banner */}
        <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/80 to-zinc-950 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              {/* Left: User Identity */}
              <div className="flex items-start sm:items-center gap-4 sm:gap-6">
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gradient-to-br from-orange-500/20 via-amber-500/20 to-orange-600/30 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold text-xl sm:text-2xl shadow-xl shadow-orange-500/10 shrink-0">
                  {user.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
                      {user.name}
                    </h1>
                    {student?.studentRoll && (
                      <span className="px-2.5 py-0.5 rounded-lg bg-orange-500/15 border border-orange-500/30 font-mono text-xs sm:text-sm font-bold text-orange-400">
                        {student.studentRoll}
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                        user.role === "STUDENT"
                          ? "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                          : user.role === "FACULTY"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : user.role === "FACULTY_ADMIN"
                              ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                              : user.role === "DIRECTOR"
                                ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                : user.role === "DEAN"
                                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                  : user.role === "WARDEN"
                                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                    : "bg-red-500/15 text-red-300 border border-red-500/30"
                      }`}
                    >
                      {user.role === "FACULTY_ADMIN" ? "HOD" : user.role}
                    </span>
                    {student && (
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                          student.studentType === "HOSTELLER"
                            ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                            : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                        }`}
                      >
                        {student.studentType === "HOSTELLER"
                          ? "Hosteller"
                          : "Day Scholar"}
                      </span>
                    )}
                  </div>

                  {/* Secondary info chips */}
                  <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs sm:text-sm text-zinc-400">
                    <span className="flex items-center gap-1.5 font-mono text-zinc-300">
                      <Mail className="h-3.5 w-3.5 text-zinc-500" />
                      {user.email}
                    </span>
                    {user.phone && (
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <Phone className="h-3.5 w-3.5 text-zinc-500" />
                        {user.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-zinc-500">
                      <Calendar className="h-3.5 w-3.5" />
                      Joined {formatDate(user.createdAt)}
                    </span>
                  </div>

                  {/* Status Pills */}
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant={user.active ? "success" : "danger"}>
                      {user.active ? "Active Account" : "Account Disabled"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Right: Quick Actions */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <Button
                  onClick={() =>
                    setActiveTab(activeTab === "edit" ? "overview" : "edit")
                  }
                  variant={activeTab === "edit" ? "default" : "outline"}
                  size="sm"
                  className={
                    activeTab === "edit"
                      ? "bg-orange-600 hover:bg-orange-500 text-white"
                      : "border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200"
                  }
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5 text-orange-400" />
                  {activeTab === "edit" ? "View Details" : "Edit Profile"}
                </Button>
                {currentUser.role === "ADMIN" && (
                  <Button
                    onClick={handleToggleStatus}
                    loading={toggling}
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300"
                  >
                    <Power className="h-3.5 w-3.5 mr-1.5" />
                    {user.active ? "Disable" : "Enable"}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Summary Cards */}
        {isStudent ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            <StatCard
              title="Total Requests"
              value={totalPermissions}
              icon={<ClipboardCheck className="h-5 w-5 text-blue-400" />}
            />
            <StatCard
              title="Accepted"
              value={approvedPermissions}
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            />
            <StatCard
              title="Rejected"
              value={rejectedPermissions}
              icon={<AlertCircle className="h-5 w-5 text-red-400" />}
            />
            <StatCard
              title="Exits"
              value={totalExits}
              icon={<LogOut className="h-5 w-5 text-amber-400" />}
            />
            <StatCard
              title="Entries"
              value={totalEntries}
              icon={<LogIn className="h-5 w-5 text-cyan-400" />}
            />
          </div>
        ) : user.role === "FACULTY" ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <StatCard
              title="Assigned Students"
              value={user.faculty?.assignedStudents?.length || 0}
              icon={<Users className="h-5 w-5 text-emerald-400" />}
            />
            <StatCard
              title="Approvals Handled"
              value={user.faculty?.permissionApprovals?.length || 0}
              icon={<ClipboardCheck className="h-5 w-5 text-blue-400" />}
            />
            <StatCard
              title="Department"
              value={user.faculty?.department || "General"}
              icon={<GraduationCap className="h-5 w-5 text-purple-400" />}
            />
            <StatCard
              title="Designation"
              value={user.faculty?.designation || "Faculty"}
              icon={<User className="h-5 w-5 text-amber-400" />}
            />
          </div>
        ) : user.role === "WARDEN" ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <StatCard
              title="Assigned Hostellers"
              value={user.warden?.assignedHostellers?.length || 0}
              icon={<Users className="h-5 w-5 text-amber-400" />}
            />
            <StatCard
              title="Hostel Block"
              value={
                user.warden?.hostelBlock
                  ? `Block ${user.warden.hostelBlock}`
                  : "All"
              }
              icon={<Building2 className="h-5 w-5 text-purple-400" />}
            />
            <StatCard
              title="Approvals Handled"
              value={user.warden?.permissionApprovals?.length || 0}
              icon={<ClipboardCheck className="h-5 w-5 text-emerald-400" />}
            />
            <StatCard
              title="Employee ID"
              value={user.warden?.employeeId || "N/A"}
              icon={<Shield className="h-5 w-5 text-blue-400" />}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            <StatCard
              title="Movements Processed"
              value={user.securityStaff?.movements?.length || 0}
              icon={<DoorOpen className="h-5 w-5 text-red-400" />}
            />
            <StatCard
              title="Assigned Gate"
              value={user.securityStaff?.gate?.name || "Unassigned"}
              icon={<MapPin className="h-5 w-5 text-amber-400" />}
            />
            <StatCard
              title="Employee ID"
              value={user.securityStaff?.employeeId || "N/A"}
              icon={<Shield className="h-5 w-5 text-blue-400" />}
            />
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800/80 gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === "overview"
                ? "border-orange-500 text-orange-400 bg-orange-500/5 rounded-t-lg"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Info className="h-4 w-4" />
            Full Details & Overview
          </button>

          {isStudent && (
            <>
              <button
                onClick={() => setActiveTab("activity")}
                className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
                  activeTab === "activity"
                    ? "border-orange-500 text-orange-400 bg-orange-500/5 rounded-t-lg"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <ClipboardCheck className="h-4 w-4" />
                Permissions & Gate Activity
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-300">
                  {totalPermissions + totalMovements}
                </span>
              </button>
            </>
          )}

          <button
            onClick={() => setActiveTab("edit")}
            className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === "edit"
                ? "border-orange-500 text-orange-400 bg-orange-500/5 rounded-t-lg"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Pencil className="h-4 w-4" />
            Edit Profile
          </button>
        </div>

        {/* Tab 1: Full Details & Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            {isStudent ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* Academic Cohort Card */}
                <Card className="border-zinc-800 bg-zinc-900/60 shadow-lg">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800/80">
                      <div className="h-8 w-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <h3 className="font-bold text-zinc-100 text-base">
                        Academic Cohort
                      </h3>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                          Roll Number
                        </span>
                        <p className="font-mono font-bold text-orange-400 text-base mt-0.5">
                          {student?.studentRoll || "Unassigned"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                          Department
                        </span>
                        <p className="text-zinc-200 font-medium mt-0.5">
                          {student?.department || "General Department"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                            Academic Year
                          </span>
                          <p className="text-zinc-200 font-medium mt-0.5">
                            {student?.year ? `Year ${student.year}` : "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                            Section
                          </span>
                          <p className="text-zinc-200 font-medium mt-0.5">
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
                <Card className="border-zinc-800 bg-zinc-900/60 shadow-lg">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800/80">
                      <div className="h-8 w-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <h3 className="font-bold text-zinc-100 text-base">
                        Residency & Housing
                      </h3>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                          Student Type
                        </span>
                        <div className="mt-1">
                          <span
                            className={`px-2.5 py-1 rounded text-xs font-bold ${
                              student?.studentType === "HOSTELLER"
                                ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                            }`}
                          >
                            {student?.studentType === "HOSTELLER"
                              ? "Hosteller (Campus Resident)"
                              : "Day Scholar (Commuter)"}
                          </span>
                        </div>
                      </div>
                      {student?.studentType === "HOSTELLER" ? (
                        <>
                          <div>
                            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                              Hostel Block
                            </span>
                            <p className="text-zinc-200 font-medium mt-0.5">
                              {student.hostelBlock
                                ? `Block ${student.hostelBlock}`
                                : "Block not assigned"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                              Room Number
                            </span>
                            <p className="text-zinc-200 font-medium mt-0.5">
                              {student.roomNumber
                                ? `Room ${student.roomNumber}`
                                : "Room not assigned"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-zinc-400 text-xs italic pt-2">
                          This student is a Day Scholar and commutes daily to
                          campus.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Mentorship & Supervision */}
                <Card className="border-zinc-800 bg-zinc-900/60 shadow-lg">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800/80">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Users className="h-4 w-4" />
                      </div>
                      <h3 className="font-bold text-zinc-100 text-base">
                        Mentors & Supervision
                      </h3>
                    </div>
                    <div className="space-y-4 text-sm">
                      <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60 space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                          Faculty Advisor
                        </span>
                        <p className="font-semibold text-emerald-300 text-sm">
                          {student?.faculty?.profile?.name ||
                            "No Faculty Assigned"}
                        </p>
                        {student?.faculty?.profile?.email && (
                          <p className="text-xs text-zinc-400 font-mono">
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
                        <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60 space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                            Hostel Warden
                          </span>
                          <p className="font-semibold text-amber-300 text-sm">
                            {student?.warden?.profile?.name ||
                              "No Warden Assigned"}
                          </p>
                          {student?.warden?.profile?.email && (
                            <p className="text-xs text-zinc-400 font-mono">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Card className="border-zinc-800 bg-zinc-900/60 shadow-lg">
                  <CardContent className="p-5 space-y-3 text-sm">
                    <h3 className="font-bold text-zinc-100 text-base pb-3 border-b border-zinc-800">
                      Staff Information
                    </h3>
                    <div>
                      <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                        Employee ID
                      </span>
                      <p className="font-mono font-bold text-zinc-200 mt-0.5">
                        {user.faculty?.employeeId ||
                          user.warden?.employeeId ||
                          user.securityStaff?.employeeId ||
                          "N/A"}
                      </p>
                    </div>
                    {user.role === "FACULTY" && (
                      <>
                        <div>
                          <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                            Department
                          </span>
                          <p className="text-zinc-200 font-medium mt-0.5">
                            {user.faculty?.department || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                            Designation
                          </span>
                          <p className="text-zinc-200 font-medium mt-0.5">
                            {user.faculty?.designation || "Faculty"}
                          </p>
                        </div>
                      </>
                    )}
                    {user.role === "WARDEN" && (
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                          Hostel Block
                        </span>
                        <p className="text-zinc-200 font-medium mt-0.5">
                          {user.warden?.hostelBlock
                            ? `Block ${user.warden.hostelBlock}`
                            : "All Blocks"}
                        </p>
                      </div>
                    )}
                    {user.role === "SECURITY" && (
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                          Assigned Gate
                        </span>
                        <p className="text-zinc-200 font-medium mt-0.5">
                          {user.securityStaff?.gate?.name
                            ? `${user.securityStaff.gate.name} (${user.securityStaff.gate.location || "Main"})`
                            : "Unassigned Gate"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-zinc-800 bg-zinc-900/60 shadow-lg">
                  <CardContent className="p-5 space-y-3 text-sm">
                    <h3 className="font-bold text-zinc-100 text-base pb-3 border-b border-zinc-800">
                      Account & Contact
                    </h3>
                    <div>
                      <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                        Full Name
                      </span>
                      <p className="text-zinc-200 font-medium mt-0.5">
                        {user.name}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                        Email Address
                      </span>
                      <p className="text-zinc-200 font-mono mt-0.5">
                        {user.email}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                        Phone Number
                      </span>
                      <p className="text-zinc-200 font-medium mt-0.5">
                        {user.phone || "Not provided"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Quick Preview of Recent Permissions & Recent Movements */}
            {isStudent && (
              <div className="pt-2">
                <Card className="border-zinc-800 bg-zinc-900/60 shadow-lg">
                  <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2">
                      <History className="h-4 w-4 text-orange-400" />
                      Unified Activity Timeline
                    </h3>
                  </div>
                  <CardContent className="p-0">
                    <div className="divide-y divide-zinc-800/60">
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
                          <div
                            key={`${item.activityType}-${item.id}`}
                            className="p-4 flex items-center justify-between gap-3 hover:bg-zinc-800/30 transition-colors"
                          >
                            {item.activityType === "PERMISSION" ? (
                              <>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2.5">
                                    <ClipboardCheck className="h-4 w-4 text-orange-400" />
                                    <p className="font-medium text-zinc-100 text-sm">
                                      Pass Requested: {item.purpose}
                                    </p>
                                  </div>
                                  <p className="text-xs text-zinc-400 flex items-center gap-1.5 pl-6">
                                    <MapPin className="h-3 w-3 text-zinc-500" />
                                    {item.destination || "Not specified"} •
                                    Exit: {formatDateTime(item.exitDate)}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <StatusBadge status={item.status} />
                                  <p className="text-[11px] text-zinc-500 mt-1">
                                    {getRelativeTime(item.createdAt)}
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex items-center justify-center shrink-0 ${
                                      item.type === "EXIT"
                                        ? "text-amber-400"
                                        : "text-emerald-400"
                                    }`}
                                  >
                                    <DoorOpen className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2.5">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                          item.type === "EXIT"
                                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                            : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                        }`}
                                      >
                                        {item.type}
                                      </span>
                                      <p className="text-sm font-medium text-zinc-200">
                                        {item.gate?.name || "Gate"}
                                      </p>
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-1">
                                      Officer:{" "}
                                      {item.securityUser?.profile?.name ||
                                        "Security Staff"}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-zinc-300 font-medium">
                                    {formatDateTime(item.createdAt)}
                                  </p>
                                  <p className="text-[11px] text-zinc-500 mt-0.5">
                                    {getRelativeTime(item.createdAt)}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      {permissions.length === 0 && movements.length === 0 && (
                        <div className="p-6 text-center text-sm text-zinc-500">
                          No activity recorded yet.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Permissions & Gate Activity */}
        {activeTab === "activity" && isStudent && (
          <div className="space-y-8 animate-fade-in">
            {/* Section A: Permissions */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-orange-400" />
                Past Permissions Taken
              </h3>
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                  {["ALL", "APPROVED", "PENDING", "REJECTED", "EXITED"].map(
                    (status) => (
                      <Button
                        key={status}
                        variant={
                          permissionFilter === status ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setPermissionFilter(status)}
                        className={
                          permissionFilter === status
                            ? "bg-orange-600 hover:bg-orange-500 text-white text-xs h-8 border-transparent"
                            : "border-zinc-800 text-xs h-8 text-zinc-400 hover:text-zinc-200"
                        }
                      >
                        {status}
                      </Button>
                    ),
                  )}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                  <Input
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    placeholder="Filter permissions..."
                    className="pl-8 bg-zinc-950/80 border-zinc-800 text-xs h-8"
                  />
                </div>
              </div>

              {/* Permissions Table */}
              <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800/80 bg-zinc-950/40">
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">
                            Purpose & Destination
                          </th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">
                            Exit Schedule
                          </th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">
                            Expected Return
                          </th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">
                            Review & Approval
                          </th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">
                            Status
                          </th>
                          <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">
                            Gate Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {filteredPermissions.map((p) => {
                          const exitMove = p.movements?.find(
                            (m: any) => m.type === "EXIT",
                          );
                          const entryMove = p.movements?.find(
                            (m: any) => m.type === "ENTRY",
                          );

                          return (
                            <tr
                              key={p.id}
                              className="table-row-hover transition-colors"
                            >
                              {/* Purpose & Destination */}
                              <td className="px-5 py-4">
                                <p className="font-semibold text-zinc-100">
                                  {p.purpose}
                                </p>
                                {p.destination && (
                                  <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                                    <MapPin className="h-3 w-3 text-zinc-500" />
                                    {p.destination}
                                  </p>
                                )}
                                <p className="text-[11px] text-zinc-500 mt-1">
                                  Requested {formatDateTime(p.createdAt)}
                                </p>
                              </td>

                              {/* Exit Schedule */}
                              <td className="px-5 py-4 text-xs">
                                <p className="font-medium text-zinc-200">
                                  {formatDateTime(p.exitDate)}
                                </p>
                                {p.expectedExit && (
                                  <p className="text-[11px] text-zinc-400 mt-0.5">
                                    Target: {formatDateTime(p.expectedExit)}
                                  </p>
                                )}
                              </td>

                              {/* Expected Return */}
                              <td className="px-5 py-4 text-xs">
                                {p.expectedReturn ? (
                                  <p className="font-medium text-zinc-200">
                                    {formatDateTime(p.expectedReturn)}
                                  </p>
                                ) : (
                                  <span className="text-zinc-500 italic">
                                    Same Day Return
                                  </span>
                                )}
                              </td>

                              {/* Review & Approval */}
                              <td className="px-5 py-4 text-xs">
                                {p.approval ? (
                                  <div className="space-y-0.5">
                                    <p className="text-zinc-300">
                                      <span className="text-zinc-500">
                                        By:{" "}
                                      </span>
                                      {p.approval.faculty?.profile?.name ||
                                        p.approval.warden?.profile?.name ||
                                        p.approverType}
                                    </p>
                                    {p.rejectionReason && (
                                      <p className="text-xs text-red-400 mt-0.5 italic">
                                        &ldquo;{p.rejectionReason}&rdquo;
                                      </p>
                                    )}
                                    {p.approval.reason && (
                                      <p className="text-xs text-zinc-400 mt-0.5">
                                        Note: {p.approval.reason}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-amber-400 italic">
                                    Pending Review
                                  </span>
                                )}
                              </td>

                              {/* Status */}
                              <td className="px-5 py-4">
                                <StatusBadge status={p.status} />
                              </td>

                              {/* Gate Movement linked */}
                              <td className="px-5 py-4 text-right text-xs">
                                {exitMove || entryMove ? (
                                  <div className="space-y-1">
                                    {exitMove && (
                                      <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono">
                                        Exited:{" "}
                                        {formatDateTime(exitMove.createdAt)} (
                                        {exitMove.gate?.name || "Gate"})
                                      </span>
                                    )}
                                    {entryMove && (
                                      <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-mono">
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

                  {filteredPermissions.length === 0 && (
                    <div className="py-12 text-center">
                      <EmptyState
                        icon={
                          <ClipboardCheck className="h-8 w-8 text-zinc-500" />
                        }
                        title="No permissions match this filter"
                        description="Try adjusting your status filter or search query."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Tab 4: Edit Profile Form */}
        {activeTab === "edit" && (
          <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl max-w-3xl animate-fade-in">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800 flex items-center gap-2">
                <Pencil className="h-4 w-4 text-orange-400" />
                Edit {user.name}&rsquo;s Details
              </h2>

              {editError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 mb-6 text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-400">
                      Full Name *
                    </label>
                    <Input
                      name="name"
                      defaultValue={user.name}
                      required
                      className="bg-zinc-950 border-zinc-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-400">
                      Phone Number
                    </label>
                    <Input
                      name="phone"
                      defaultValue={user.phone || ""}
                      placeholder="+91-9876543210"
                      className="bg-zinc-950 border-zinc-800"
                    />
                  </div>

                  {isStudent && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Roll Number *
                        </label>
                        <Input
                          name="studentRoll"
                          defaultValue={student?.studentRoll || ""}
                          required
                          className="bg-zinc-950 border-zinc-800 font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Department
                        </label>
                        <Input
                          name="department"
                          defaultValue={student?.department || ""}
                          placeholder="e.g. Computer Science"
                          className="bg-zinc-950 border-zinc-800"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Academic Year
                        </label>
                        <Input
                          name="year"
                          type="number"
                          min={1}
                          max={5}
                          defaultValue={student?.year || 1}
                          className="bg-zinc-950 border-zinc-800"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Section
                        </label>
                        <Input
                          name="section"
                          defaultValue={student?.section || "A"}
                          className="bg-zinc-950 border-zinc-800"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Student Type
                        </label>
                        <Select
                          name="studentType"
                          value={editStudentType}
                          onChange={(e) => setEditStudentType(e.target.value)}
                          className="bg-zinc-950 border-zinc-800"
                        >
                          <option value="DAY_SCHOLAR">Day Scholar</option>
                          <option value="HOSTELLER">Hosteller</option>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Assigned Faculty Advisor
                        </label>
                        <Select
                          name="facultyId"
                          defaultValue={student?.facultyId || ""}
                          className="bg-zinc-950 border-zinc-800"
                        >
                          <option value="">-- None --</option>
                          {faculty.map((f: any) => (
                            <option key={f.id} value={f.id}>
                              {f.profile?.name} ({f.department || "No Dept"})
                            </option>
                          ))}
                        </Select>
                      </div>

                      {editStudentType === "HOSTELLER" && (
                        <>
                          <div className="space-y-1.5 animate-fade-in">
                            <label className="text-xs font-semibold text-zinc-400">
                              Assigned Warden (Hostellers)
                            </label>
                            <Select
                              name="wardenId"
                              defaultValue={student?.wardenId || ""}
                              className="bg-zinc-950 border-zinc-800"
                            >
                              <option value="">-- None --</option>
                              {wardens.map((w: any) => (
                                <option key={w.id} value={w.id}>
                                  {w.profile?.name} (Block {w.hostelBlock || "N/A"})
                                </option>
                              ))}
                            </Select>
                          </div>

                          <div className="space-y-1.5 animate-fade-in">
                            <label className="text-xs font-semibold text-zinc-400">
                              Hostel Block
                            </label>
                            <Input
                              name="hostelBlock"
                              defaultValue={student?.hostelBlock || ""}
                              placeholder="e.g. Block A"
                              className="bg-zinc-950 border-zinc-800"
                            />
                          </div>

                          <div className="space-y-1.5 animate-fade-in">
                            <label className="text-xs font-semibold text-zinc-400">
                              Room Number
                            </label>
                            <Input
                              name="roomNumber"
                              defaultValue={student?.roomNumber || ""}
                              placeholder="e.g. 204"
                              className="bg-zinc-950 border-zinc-800"
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {!isStudent && user.role === "FACULTY" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Employee ID
                        </label>
                        <Input
                          name="employeeId"
                          defaultValue={user.faculty?.employeeId || ""}
                          className="bg-zinc-950 border-zinc-800 font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Department
                        </label>
                        <Input
                          name="department"
                          defaultValue={user.faculty?.department || ""}
                          className="bg-zinc-950 border-zinc-800"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Designation
                        </label>
                        <Input
                          name="designation"
                          defaultValue={user.faculty?.designation || ""}
                          className="bg-zinc-950 border-zinc-800"
                        />
                      </div>
                    </>
                  )}

                  {!isStudent && user.role === "WARDEN" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Employee ID
                        </label>
                        <Input
                          name="employeeId"
                          defaultValue={user.warden?.employeeId || ""}
                          className="bg-zinc-950 border-zinc-800 font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Hostel Block
                        </label>
                        <Input
                          name="hostelBlock"
                          defaultValue={user.warden?.hostelBlock || ""}
                          placeholder="e.g. A"
                          className="bg-zinc-950 border-zinc-800"
                        />
                      </div>
                    </>
                  )}

                  {!isStudent && user.role === "SECURITY" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Employee ID
                        </label>
                        <Input
                          name="employeeId"
                          defaultValue={user.securityStaff?.employeeId || ""}
                          className="bg-zinc-950 border-zinc-800 font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Assigned Gate
                        </label>
                        <Select
                          name="gateId"
                          defaultValue={user.securityStaff?.gateId || ""}
                          className="bg-zinc-950 border-zinc-800"
                        >
                          <option value="">-- None --</option>
                          {gates.map((g: any) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("overview")}
                    disabled={editLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={editLoading}
                    className="bg-orange-600 hover:bg-orange-500 text-white"
                  >
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    
    </>
  );
}

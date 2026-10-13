"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Modal, Select, Badge, EmptyState } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { logoutAction } from "@/server/actions/auth";
import { 
  createUser, 
  toggleUserActive, 
  deleteUser,
  getUserDetails,
  assignFacultyToStudent,
  assignWardenToStudent,
  assignGateToSecurity,
  updateStudentDetails,
  updateUserDetails,
} from "@/server/actions/admin";
import { Search, 
  UserPlus,
  Users,
  Shield,
  Power,
  ArrowLeft,
  Mail,
  Lock,
  Phone,
  GraduationCap,
  BookOpen,
  Building2,
  Trash2,
  AlertTriangle,
  User,
  Pencil,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";
import { DEPARTMENTS, getDepartmentCode, getDepartmentFullName } from "@/lib/constants";

interface Props {
  user: { name: string; email: string; role: string };
  initialUsers: { users: any[]; total: number };
  faculty: any[];
  wardens: any[];
  gates: any[];
  currentPage: number;
  currentRole: string;
}

export function UserManagementClient({
  user,
  initialUsers,
  faculty,
  wardens,
  gates,
  currentPage,
  currentRole,
}: Props) {
  const router = useRouter();
  const [usersData, setUsersData] = useState(initialUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNavigatingRole, startRoleTransition] = useTransition();
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, any>>({});
  
  // Sync state if props change from server
  useEffect(() => {
    // eslint-disable-next-line
    setUsersData(initialUsers);
    setPendingRole(null);
  }, [initialUsers]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState("STUDENT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [selectedUserDetails, setSelectedUserDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [navigatingUserId, setNavigatingUserId] = useState<string | null>(null);
  const [isNavigatingId, startIdTransition] = useTransition();

  function navigateToHistory(userId: string) {
    setNavigatingUserId(userId);
    startIdTransition(() => {
      router.push(`/admin/users/${userId}`);
    });
  }

  const [createStudentType, setCreateStudentType] = useState("DAY_SCHOLAR");
  const [editStudentType, setEditStudentType] = useState("DAY_SCHOLAR");
  const [createDept, setCreateDept] = useState("CSE");
  const [createCustomDept, setCreateCustomDept] = useState("");
  const [editDept, setEditDept] = useState("CSE");
  const [editCustomDept, setEditCustomDept] = useState("");

  function handleOpenEdit(u: any) {
    setEditingUser(u);
    if (u.role === "STUDENT" && u.student) {
      setEditStudentType(u.student.studentType || "DAY_SCHOLAR");
      const currentDept = u.student.department || "";
      const matched = DEPARTMENTS.find(
        (d) =>
          d.code.toLowerCase() === currentDept.toLowerCase() ||
          d.name.toLowerCase() === currentDept.toLowerCase() ||
          d.aliases.some((a) => a.toLowerCase() === currentDept.toLowerCase())
      );
      if (matched) {
        setEditDept(matched.code);
        setEditCustomDept("");
      } else if (currentDept) {
        setEditDept("OTHER");
        setEditCustomDept(currentDept);
      } else {
        setEditDept("CSE");
        setEditCustomDept("");
      }
    } else if ((u.role === "FACULTY" || u.role === "FACULTY_ADMIN") && u.faculty) {
      const currentDept = u.faculty.department || "";
      const matched = DEPARTMENTS.find(
        (d) =>
          d.code.toLowerCase() === currentDept.toLowerCase() ||
          d.name.toLowerCase() === currentDept.toLowerCase() ||
          d.aliases.some((a) => a.toLowerCase() === currentDept.toLowerCase())
      );
      if (matched) {
        setEditDept(matched.code);
        setEditCustomDept("");
      } else if (currentDept) {
        setEditDept("OTHER");
        setEditCustomDept(currentDept);
      } else {
        setEditDept("CSE");
        setEditCustomDept("");
      }
    }
    setEditError(null);
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    setEditError(null);

    const formData = new FormData(e.currentTarget);
    const resolvedDept = editDept === "OTHER" ? ((formData.get("customDepartment") as string) || editCustomDept).trim() : editDept;

    try {
      if (editingUser.role === "STUDENT") {
        const studentId = editingUser.student?.id;
        if (!studentId) {
          setEditError("Student record ID is missing");
          setEditLoading(false);
          return;
        }

        const res = await updateStudentDetails(studentId, {
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          phone: formData.get("phone") as string,
          studentRoll: formData.get("studentRoll") as string,
          department: resolvedDept,
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
        const res = await updateUserDetails(editingUser.id, {
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          phone: formData.get("phone") as string,
          employeeId: formData.get("employeeId") as string,
          department: resolvedDept,
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
      setEditingUser(null);
      router.refresh();
    } catch (err: any) {
      setEditError(err.message || "Failed to update user");
    } finally {
      setEditLoading(false);
    }
  }

  function handleRoleFilter(role: string) {
    setPendingRole(role);
    startRoleTransition(() => {
      if (role === "ALL") {
        router.push(`/admin/users?page=1`);
      } else {
        router.push(`/admin/users?role=${role}&page=1`);
      }
    });
  }

  async function handleCreateUser(formData: FormData) {
    setLoading(true);
    setError(null);
    if (formData.get("department") === "OTHER") {
      const custom = ((formData.get("customDepartment") as string) || createCustomDept).trim();
      if (custom) formData.set("department", custom);
    }
    const result = await createUser(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("User created successfully!");
      setShowCreateModal(false);
      setCreateDept("CSE");
      setCreateCustomDept("");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleToggle(profileId: string) {
    setToggling(profileId);
    
    // Optimistic UI update
    setUsersData((prev) => ({
      ...prev,
      users: prev.users.map((u) => 
        u.id === profileId ? { ...u, active: !u.active } : u
      ),
    }));

    await toggleUserActive(profileId);
    setToggling(null);
    router.refresh();
  }

  function handleDeleteClick(profileId: string) {
    setUserToDelete(profileId);
  }

  async function confirmDelete() {
    if (!userToDelete) return;
    setDeleting(userToDelete);
    await deleteUser(userToDelete);
    setDeleting(null);
    setUserToDelete(null);
    router.refresh();
  }

  async function handleViewDetails(profileId: string, role: string) {
    if (detailsCache[profileId]) {
      setSelectedUserDetails({ role, details: detailsCache[profileId] });
      return;
    }
    setLoadingDetails(profileId);
    const details = await getUserDetails(profileId, role);
    if (details) {
      setDetailsCache((prev) => ({ ...prev, [profileId]: details }));
    }
    setSelectedUserDetails({ role, details });
    setLoadingDetails(null);
  }

  async function handleAssign(type: 'faculty' | 'warden' | 'gate', targetId: string, assigneeId: string) {
    setAssigning(true);
    if (type === 'faculty') {
      await assignFacultyToStudent(targetId, assigneeId);
    } else if (type === 'warden') {
      await assignWardenToStudent(targetId, assigneeId);
    } else if (type === 'gate') {
      await assignGateToSecurity(targetId, assigneeId);
    }
    
    // Refresh details silently
    if (selectedUserDetails?.details?.profile?.id) {
      const freshDetails = await getUserDetails(selectedUserDetails.details.profile.id, selectedUserDetails.role);
      setSelectedUserDetails({ role: selectedUserDetails.role, details: freshDetails });
    }
    setAssigning(false);
  }

  const roleColors: Record<string, string> = {
    ADMIN: "bg-violet-500",
    STUDENT: "bg-blue-500",
    FACULTY: "bg-emerald-500",
    FACULTY_ADMIN: "bg-indigo-500",
    WARDEN: "bg-amber-500",
    SECURITY: "bg-red-500",
    DIRECTOR: "bg-purple-500",
    DEAN: "bg-cyan-500",
  };

  const ROLES = ["STUDENT", "FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN", "WARDEN", "SECURITY"];

  const filteredUsers = usersData.users.filter((u: any) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q) ||
      u.student?.studentRoll?.toLowerCase().includes(q) ||
      u.faculty?.employeeId?.toLowerCase().includes(q) ||
      u.warden?.employeeId?.toLowerCase().includes(q) ||
      u.securityStaff?.employeeId?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="space-y-8 pb-12">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <BackButton href="/admin" label="Back to Dashboard" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              User Management
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {initialUsers.total} registered users
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <UserPlus className="h-4 w-4" />
            Create User
          </Button>
        </div>

        {success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 animate-fade-in">
            {success}
          </div>
        )}

        {/* Role Navigation Filters & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">

          {ROLES.map((role) => (
            <Button
              key={role}
              variant={currentRole === role ? "default" : "outline"}
              size="default"
              loading={isNavigatingRole && pendingRole === role}
              onClick={() => handleRoleFilter(role)}
              className={
                currentRole === role 
                  ? "bg-orange-600 hover:bg-orange-500 text-white border-transparent capitalize" 
                  : isNavigatingRole && pendingRole === role
                    ? "border-orange-500/50 text-orange-400 bg-orange-500/10 disabled:opacity-100 capitalize"
                    : "border-zinc-700/50 capitalize"
              }
            >
              {role === "FACULTY" ? "Faculty" : role === "FACULTY_ADMIN" ? "HOD" : role === "SECURITY" ? "Security" : role === "DIRECTOR" ? "Director" : role === "DEAN" ? "Dean" : `${role.toLowerCase()}s`}
            </Button>
          ))}
          </div>
          
          <div className="relative w-full sm:w-80 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by name, email, roll no..."
              className="pl-9 h-10 bg-zinc-900 border-zinc-800 text-sm focus-visible:ring-orange-500/30 w-full"
            />
          </div>
        </div>

        {/* Users by Role */}
        <div className="space-y-10">
          {ROLES.map((role) => {
            const roleUsers = filteredUsers.filter((u) => u.role === role);
            if (roleUsers.length === 0) return null;

            return (
              <div key={role} className="space-y-4">
                <h2 className="text-lg font-semibold text-zinc-100 font-heading border-b border-zinc-800/50 pb-2 flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${roleColors[role]}`}></div>
                  {role === "FACULTY" ? "FACULTY" : role === "FACULTY_ADMIN" ? "HOD (HEAD OF DEPARTMENT)" : role === "SECURITY" ? "SECURITY" : role === "DIRECTOR" ? "DIRECTOR" : role === "DEAN" ? "DEAN" : `${role}S`}
                </h2>
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[650px] text-sm">
                        <thead>
                          <tr className="border-b border-zinc-800/50 bg-zinc-900/30">
                            {role === "STUDENT" ? (
                              <>
                                <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Student</th>
                                <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Email</th>
                                <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Status</th>
                                <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Actions</th>
                              </>
                            ) : (
                              <>
                                <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Name & Contact</th>
                                <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Employee ID</th>
                                <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Assignment / Dept</th>
                                <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Status</th>
                                <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Actions</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/30">
                          {roleUsers.map((u) => {
                            const isExpanded = expandedUserId === u.id;

                            return (
                              <React.Fragment key={u.id}>
                                <tr 
                                  onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                                  className={`table-row-hover transition-colors cursor-pointer select-none ${
                                    isExpanded ? "bg-zinc-850/60" : ""
                                  }`}
                                  title="Click row to view full details"
                                >
                                  {role === "STUDENT" ? (
                                    <>
                                      {/* Student Column 1: Student Name & Roll */}
                                      <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 font-semibold text-xs shrink-0">
                                            {u.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
                                          </div>
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <p className="font-semibold text-zinc-100 hover:text-orange-400 transition-colors">{u.name}</p>
                                              {u.student?.studentRoll && (
                                                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                                                  {u.student.studentRoll}
                                                </span>
                                              )}
                                            </div>
                                            {u.phone && (
                                              <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                                                <Phone className="h-3 w-3 text-zinc-500" />
                                                {u.phone}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </td>

                                      {/* Student Column 2: Email */}
                                      <td className="px-5 py-3.5">
                                        <p className="text-xs text-zinc-300 font-mono">{u.email}</p>
                                      </td>

                                      {/* Student Column 3: Status */}
                                      <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-2">
                                          <Badge variant={u.active ? "success" : "danger"}>
                                            {u.active ? "Active" : "Disabled"}
                                          </Badge>

                                        </div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      {/* Non-student Column 1: Name & Contact */}
                                      <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-2">
                                          <p className="font-semibold text-zinc-100">{u.name}</p>
                                        </div>
                                        <p className="text-xs text-zinc-400 mt-0.5">{u.email}</p>
                                        {u.phone && <p className="text-xs text-zinc-500">{u.phone}</p>}
                                      </td>

                                      {/* Non-student Column 2: Employee ID */}
                                      <td className="px-5 py-3.5">
                                        <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-xs font-medium text-zinc-300">
                                          {u.faculty?.employeeId || u.warden?.employeeId || u.securityStaff?.employeeId || "N/A"}
                                        </span>
                                      </td>

                                      {/* Non-student Column 3: Assignment */}
                                      <td className="px-5 py-3.5 text-xs">
                                        {(role === "FACULTY" || role === "FACULTY_ADMIN" || role === "DIRECTOR" || role === "DEAN") && (
                                          <>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              {u.faculty?.department ? (
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                                  role === "DIRECTOR"
                                                    ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                                    : role === "DEAN"
                                                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                                                    : role === "FACULTY_ADMIN"
                                                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                }`}>
                                                  {getDepartmentCode(u.faculty.department)}
                                                </span>
                                              ) : null}
                                              <span className="font-medium text-zinc-200">
                                                {u.faculty?.department || "No Department"}
                                              </span>
                                            </div>
                                            <p className="text-zinc-400 mt-0.5">
                                              {u.faculty?.designation || (role === "DIRECTOR" ? "Director" : role === "DEAN" ? "Dean" : role === "FACULTY_ADMIN" ? "Head of Department" : "Faculty")}
                                            </p>
                                          </>
                                        )}
                                        {role === "WARDEN" && (
                                          <>
                                            <p className="font-medium text-zinc-200">
                                              {u.warden?.hostelBlock ? `Hostel Block ${u.warden.hostelBlock}` : "All Blocks"}
                                            </p>
                                            <p className="text-zinc-400 mt-0.5">Warden</p>
                                          </>
                                        )}
                                        {role === "SECURITY" && (
                                          <>
                                            <p className="font-medium text-zinc-200">
                                              {u.securityStaff?.gate?.name ? `Assigned: ${u.securityStaff.gate.name}` : "Unassigned Gate"}
                                            </p>
                                            <p className="text-zinc-400 mt-0.5">Security Personnel</p>
                                          </>
                                        )}
                                        {role === "ADMIN" && (
                                          <p className="text-zinc-400">System Administrator</p>
                                        )}
                                      </td>

                                      {/* Non-student Column 4: Status */}
                                      <td className="px-5 py-3.5">
                                        <Badge variant={u.active ? "success" : "danger"}>
                                          {u.active ? "Active" : "Disabled"}
                                        </Badge>
                                      </td>
                                    </>
                                  )}

                                  {/* Actions Column */}
                                  <td className="px-5 py-3.5 text-right">
                                    {u.role !== "ADMIN" && (
                                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                          variant="ghost"
                                          loading={isNavigatingId && navigatingUserId === u.id}
                                          onClick={() => navigateToHistory(u.id)}
                                          className="inline-flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 px-2.5 h-8 text-xs font-medium rounded-md transition-colors"
                                          title="View full user details, permissions & activity"
                                        >
                                          {(!isNavigatingId || navigatingUserId !== u.id) && <History className="h-3.5 w-3.5 mr-1 text-orange-400" />}
                                          All Data
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleOpenEdit(u)}
                                          className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 px-2.5 h-8 text-xs font-medium"
                                          title="Edit Details"
                                        >
                                          <Pencil className="h-3.5 w-3.5 mr-1" />
                                          Edit
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleToggle(u.id)}
                                          loading={toggling === u.id}
                                          disabled={deleting === u.id}
                                          className="px-2.5 h-8 text-xs font-medium"
                                        >
                                          <Power className="h-3.5 w-3.5 mr-1" />
                                          {u.active ? "Disable" : "Enable"}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteClick(u.id)}
                                          loading={deleting === u.id}
                                          disabled={toggling === u.id}
                                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2.5 h-8 text-xs font-medium"
                                        >
                                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                                          Delete
                                        </Button>
                                        <button
                                          type="button"
                                          onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                                          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors ml-1"
                                          title={isExpanded ? "Collapse details" : "Click to view full details"}
                                        >
                                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${
                                            isExpanded ? "rotate-180 text-orange-400" : ""
                                          }`} />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>

                                {/* Expanded Details Row for Student */}
                                {isExpanded && role === "STUDENT" && (
                                  <tr className="bg-zinc-950/80 border-b border-zinc-800/80 animate-fade-in">
                                    <td colSpan={4} className="p-5 bg-gradient-to-b from-zinc-900/70 to-zinc-950/95 border-l-2 border-l-orange-500">
                                      <div className="space-y-4">
                                        {/* Top Info Bar */}
                                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
                                          <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold">
                                              <GraduationCap className="h-5 w-5" />
                                            </div>
                                            <div>
                                              <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="font-bold text-zinc-100 text-base">{u.name}</h4>
                                                {u.student?.studentRoll && (
                                                  <span className="px-2 py-0.5 rounded bg-orange-500/15 border border-orange-500/30 font-mono text-xs font-bold text-orange-400">
                                                    {u.student.studentRoll}
                                                  </span>
                                                )}
                                                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                                  u.student?.studentType === "HOSTELLER"
                                                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                                    : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                                                }`}>
                                                  {u.student?.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
                                                </span>

                                              </div>
                                              <p className="text-xs text-zinc-400 mt-0.5">
                                                {u.email} {u.phone ? `• ${u.phone}` : ""}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                              variant="outline"
                                              loading={isNavigatingId && navigatingUserId === u.id}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigateToHistory(u.id);
                                              }}
                                              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 text-xs font-semibold shadow-sm transition-all"
                                            >
                                              {(!isNavigatingId || navigatingUserId !== u.id) && <History className="h-3.5 w-3.5 text-orange-400" />}
                                              All Data
                                            </Button>
                                            <Button
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenEdit(u);
                                              }}
                                              className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8 shadow-lg shadow-orange-600/20"
                                            >
                                              <Pencil className="h-3.5 w-3.5 mr-1.5" />
                                              Edit Student Details
                                            </Button>
                                          </div>
                                        </div>

                                        {/* 4 Detail Grid Cards */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                          {/* Card 1: Roll & Academic Cohort */}
                                          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                              <GraduationCap className="h-3.5 w-3.5 text-orange-400" />
                                              Academic Cohort
                                            </span>
                                            <p className="text-sm font-semibold text-zinc-200">
                                              {u.student?.department || "General Department"}
                                            </p>
                                            <p className="text-xs text-zinc-400">
                                              {u.student?.year ? `Year ${u.student.year}` : "Year N/A"}
                                              {u.student?.section ? ` • Section ${u.student.section}` : ""}
                                            </p>
                                          </div>

                                          {/* Card 2: Residency & Accommodation */}
                                          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                              <Building2 className="h-3.5 w-3.5 text-purple-400" />
                                              Residency & Hostel
                                            </span>
                                            <p className="text-sm font-semibold text-zinc-200">
                                              {u.student?.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
                                            </p>
                                            <p className="text-xs text-zinc-400">
                                              {u.student?.studentType === "HOSTELLER" ? (
                                                <>
                                                  {u.student?.hostelBlock ? `Block: ${u.student.hostelBlock}` : "Block not assigned"}
                                                  {u.student?.roomNumber ? ` • Room: ${u.student.roomNumber}` : ""}
                                                </>
                                              ) : (
                                                "Lives Off-Campus"
                                              )}
                                            </p>
                                          </div>

                                          {/* Card 3: Assigned Mentors */}
                                          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                              <Users className="h-3.5 w-3.5 text-emerald-400" />
                                              Assigned Mentors
                                            </span>
                                            <div className="text-xs space-y-1">
                                              <p className="text-zinc-300">
                                                <span className="text-zinc-500">Faculty: </span>
                                                {u.student?.faculty?.profile?.name ? (
                                                  <span className="font-medium text-emerald-300">{u.student.faculty.profile.name}</span>
                                                ) : (
                                                  <span className="text-zinc-500 italic">Unassigned</span>
                                                )}
                                              </p>
                                              {u.student?.studentType === "HOSTELLER" && (
                                                <p className="text-zinc-300">
                                                  <span className="text-zinc-500">Warden: </span>
                                                  {u.student?.warden?.profile?.name ? (
                                                    <span className="font-medium text-amber-300">{u.student.warden.profile.name}</span>
                                                  ) : (
                                                    <span className="text-zinc-500 italic">Unassigned</span>
                                                  )}
                                                </p>
                                              )}
                                            </div>
                                          </div>

                                          {/* Card 4: Movement & Account Status */}
                                          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                              <Shield className="h-3.5 w-3.5 text-blue-400" />
                                              Campus & Account
                                            </span>
                                            <div className="flex items-center gap-2 pt-0.5">
                                              <Badge variant={u.active ? "success" : "danger"}>
                                                {u.active ? "Active" : "Disabled"}
                                              </Badge>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}

                                {/* Expanded Details Row for Non-Student */}
                                {isExpanded && role !== "STUDENT" && (
                                  <tr className="bg-zinc-950/80 border-b border-zinc-800/80 animate-fade-in">
                                    <td colSpan={5} className="p-5 bg-gradient-to-b from-zinc-900/70 to-zinc-950/95 border-l-2 border-l-orange-500">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="space-y-1">
                                          <h4 className="font-bold text-zinc-100 text-sm flex items-center gap-2">
                                            {u.name}
                                            <span className="text-xs font-mono text-zinc-400">
                                              ({u.faculty?.employeeId || u.warden?.employeeId || u.securityStaff?.employeeId || "No Employee ID"})
                                            </span>
                                          </h4>
                                          <p className="text-xs text-zinc-400">
                                            Email: <span className="text-zinc-200">{u.email}</span>
                                            {u.phone ? ` • Phone: ${u.phone}` : ""}
                                          </p>
                                          {(role === "FACULTY" || role === "FACULTY_ADMIN") && u.faculty && (
                                            <p className={`text-xs ${role === "FACULTY_ADMIN" ? "text-indigo-400" : "text-emerald-400"}`}>
                                              {u.faculty.department ? `Department: ${getDepartmentFullName(u.faculty.department)} (${getDepartmentCode(u.faculty.department)})` : "No Department"} • {u.faculty.designation || (role === "FACULTY_ADMIN" ? "Head of Department" : "Faculty Member")} {role === "FACULTY" ? `• ${u.faculty._count?.assignedStudents || 0} Assigned Students` : ""}
                                            </p>
                                          )}
                                          {role === "WARDEN" && u.warden && (
                                            <p className="text-xs text-amber-400">
                                              {u.warden.hostelBlock ? `Hostel Block ${u.warden.hostelBlock}` : "All Hostel Blocks"} • {u.warden._count?.assignedHostellers || 0} Hostellers
                                            </p>
                                          )}
                                          {role === "SECURITY" && u.securityStaff && (
                                            <p className="text-xs text-blue-400">
                                              {u.securityStaff.gate?.name ? `Gate: ${u.securityStaff.gate.name}` : "Unassigned Gate"}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            variant="outline"
                                            loading={isNavigatingId && navigatingUserId === u.id}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigateToHistory(u.id);
                                            }}
                                            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 text-xs font-semibold shadow-sm transition-all"
                                          >
                                            {(!isNavigatingId || navigatingUserId !== u.id) && <History className="h-3.5 w-3.5 text-orange-400" />}
                                            All Data
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenEdit(u);
                                            }}
                                            className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
                                          >
                                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                                            Edit Details
                                          </Button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No users found"
              description="There are currently no users for this role. You can create a new one using the button above."
            />
          )}
        </div>

      </div>

      {/* Pagination Controls */}
      {usersData.total > 15 && (
        <div className="fixed bottom-0 left-0 lg:left-72 right-0 z-50 flex justify-between items-center py-3 px-4 lg:px-8 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">
          <p className="text-sm text-zinc-400 font-medium">
            Showing {(currentPage - 1) * 15 + 1} to {Math.min(currentPage * 15, usersData.total)} of {usersData.total} users
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              Page {currentPage} of {Math.ceil(usersData.total / 15)}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => router.push(`/admin/users?page=${currentPage - 1}${currentRole !== "ALL" ? `&role=${currentRole}` : ""}`)}
                className="h-8 px-3"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage * 15 >= usersData.total}
                onClick={() => router.push(`/admin/users?page=${currentPage + 1}${currentRole !== "ALL" ? `&role=${currentRole}` : ""}`)}
                className="h-8 px-3"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add bottom padding to account for fixed pagination */}
      {usersData.total > 25 && <div className="h-20"></div>}

      {/* Create User Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setError(null);
        }}
        title="Create New User"
        className="max-w-2xl"
      >
        <form action={handleCreateUser} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Account Credentials Section */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Users className="h-4 w-4" /> Account Credentials
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input name="name" label="Full Name *" required id="create-name" icon={<Users className="h-4 w-4" />} />
              <Input name="email" type="email" label="Email *" required id="create-email" icon={<Mail className="h-4 w-4" />} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input name="password" type="password" label="Password *" required id="create-password" icon={<Lock className="h-4 w-4" />} />
              <Input name="phone" type="tel" label="Phone" id="create-phone" icon={<Phone className="h-4 w-4" />} />
            </div>
          </div>

          <div className="h-px w-full bg-zinc-800/50"></div>

          {/* Role Configuration */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Shield className="h-4 w-4" /> Role & Permissions
            </h3>
            <Select
              label="Role *"
              name="role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              id="create-role"
            >
              <option value="STUDENT">Student</option>
              <option value="FACULTY">Faculty</option>
              <option value="FACULTY_ADMIN">HOD (Head of Department)</option>
              <option value="DEAN">Dean</option>
              <option value="DIRECTOR">Director</option>
              <option value="WARDEN">Warden</option>
              <option value="SECURITY">Security</option>
            </Select>

            {/* Student-specific fields */}
            {selectedRole === "STUDENT" && (
              <div className="space-y-4 rounded-xl border border-zinc-800/50 p-5 mt-4 bg-zinc-900/50">
                <p className="text-sm font-medium text-blue-400 flex items-center gap-2 mb-4">
                  <GraduationCap className="h-4 w-4" />
                  Student-Specific Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input name="studentRoll" label="Roll Number *" required id="create-roll" />
                  <Select
                    name="department"
                    label="Department"
                    id="create-department"
                    value={createDept}
                    onChange={(e) => setCreateDept(e.target.value)}
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                    <option value="OTHER">Other / Custom Department</option>
                  </Select>
                </div>
                {createDept === "OTHER" && (
                  <Input
                    name="customDepartment"
                    label="Custom Department Name"
                    id="create-student-custom-dept"
                    placeholder="e.g. Biomedical Engineering"
                    value={createCustomDept}
                    onChange={(e) => setCreateCustomDept(e.target.value)}
                  />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input name="year" type="number" label="Year" id="create-year" />
                  <Input name="section" label="Section" id="create-section" />
                  <Select name="studentType" label="Type" id="create-student-type" value={createStudentType} onChange={(e) => setCreateStudentType(e.target.value)}>
                    <option value="DAY_SCHOLAR">Day Scholar</option>
                    <option value="HOSTELLER">Hosteller</option>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select name="assignedFacultyId" label="Assigned Faculty" id="create-faculty">
                    <option value="">None</option>
                    {faculty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.profile.name} {f.department ? `(${f.department})` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                
                {createStudentType === "HOSTELLER" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input name="roomNumber" label="Room Number" id="create-room" />
                      <Input name="hostelBlock" label="Hostel Block" id="create-hostel" />
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <Select name="assignedWardenId" label="Assigned Warden" id="create-warden">
                        <option value="">None</option>
                        {wardens.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.profile.name} {w.hostelBlock ? `(Block ${w.hostelBlock})` : ""}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Faculty-specific */}
            {selectedRole === "FACULTY" && (
              <div className="space-y-4 rounded-xl border border-zinc-800/50 p-5 mt-4 bg-zinc-900/50">
                <p className="text-sm font-medium text-emerald-400 flex items-center gap-2 mb-4">
                  <BookOpen className="h-4 w-4" />
                  Faculty-Specific Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input name="employeeId" label="Employee ID *" required id="create-fac-emp" />
                  <Select
                    name="department"
                    label="Department *"
                    required
                    id="create-fac-dept"
                    value={createDept}
                    onChange={(e) => setCreateDept(e.target.value)}
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                    <option value="OTHER">Other / Custom Department</option>
                  </Select>
                </div>
                {createDept === "OTHER" && (
                  <Input
                    name="customDepartment"
                    label="Custom Department Name"
                    id="create-fac-custom-dept"
                    placeholder="e.g. Biomedical Engineering"
                    value={createCustomDept}
                    onChange={(e) => setCreateCustomDept(e.target.value)}
                  />
                )}
                <Input name="designation" label="Designation" defaultValue="Assistant Professor" id="create-designation" />
              </div>
            )}

            {/* HOD-specific */}
            {selectedRole === "FACULTY_ADMIN" && (
              <div className="space-y-4 rounded-xl border border-zinc-800/50 p-5 mt-4 bg-zinc-900/50">
                <p className="text-sm font-medium text-indigo-400 flex items-center gap-2 mb-4">
                  <Shield className="h-4 w-4" />
                  HOD (Head of Department) Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input name="employeeId" label="Employee ID *" required id="create-hod-emp" defaultValue={`HOD-${Date.now().toString().slice(-4)}`} />
                  <Select
                    name="department"
                    label="Department *"
                    required
                    id="create-hod-dept"
                    value={createDept}
                    onChange={(e) => setCreateDept(e.target.value)}
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                    <option value="OTHER">Other / Custom Department</option>
                  </Select>
                </div>
                {createDept === "OTHER" && (
                  <Input
                    name="customDepartment"
                    label="Custom Department Name *"
                    required
                    id="create-hod-custom-dept"
                    placeholder="e.g. Biomedical Engineering"
                    value={createCustomDept}
                    onChange={(e) => setCreateCustomDept(e.target.value)}
                  />
                )}
                <Input name="designation" label="Designation" defaultValue="Head of Department" id="create-hod-designation" />
              </div>
            )}

            {/* Director-specific */}
            {selectedRole === "DIRECTOR" && (
              <div className="space-y-4 rounded-xl border border-zinc-800/50 p-5 mt-4 bg-zinc-900/50">
                <p className="text-sm font-medium text-purple-400 flex items-center gap-2 mb-4">
                  <Shield className="h-4 w-4" />
                  Director Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input name="employeeId" label="Employee ID *" required id="create-dir-emp" defaultValue={`DIR-${Date.now().toString().slice(-4)}`} />
                  <Input name="department" label="Department" defaultValue="All Departments" id="create-dir-dept" />
                </div>
                <Input name="designation" label="Designation" defaultValue="Director" id="create-dir-designation" />
              </div>
            )}

            {/* Dean-specific */}
            {selectedRole === "DEAN" && (
              <div className="space-y-4 rounded-xl border border-zinc-800/50 p-5 mt-4 bg-zinc-900/50">
                <p className="text-sm font-medium text-cyan-400 flex items-center gap-2 mb-4">
                  <Shield className="h-4 w-4" />
                  Dean Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input name="employeeId" label="Employee ID *" required id="create-dean-emp" defaultValue={`DEAN-${Date.now().toString().slice(-4)}`} />
                  <Input name="department" label="Department" defaultValue="All Departments" id="create-dean-dept" />
                </div>
                <Input name="designation" label="Designation" defaultValue="Dean" id="create-dean-designation" />
              </div>
            )}

            {/* Warden-specific */}
            {selectedRole === "WARDEN" && (
              <div className="space-y-4 rounded-xl border border-zinc-800/50 p-5 mt-4 bg-zinc-900/50">
                <p className="text-sm font-medium text-amber-400 flex items-center gap-2 mb-4">
                  <Building2 className="h-4 w-4" />
                  Warden-Specific Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input name="employeeId" label="Employee ID *" required id="create-warden-emp" />
                  <Input name="wardenHostelBlock" label="Hostel Block" id="create-warden-block" />
                </div>
              </div>
            )}

            {/* Security-specific */}
            {selectedRole === "SECURITY" && (
              <div className="space-y-4 rounded-xl border border-zinc-800/50 p-5 mt-4 bg-zinc-900/50">
                <p className="text-sm font-medium text-red-400 flex items-center gap-2 mb-4">
                  <Shield className="h-4 w-4" />
                  Security-Specific Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input name="employeeId" label="Employee ID *" required id="create-sec-emp" />
                  <Select name="assignedGateId" label="Assigned Gate" id="create-sec-gate">
                    <option value="">None</option>
                    {gates?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-zinc-800/50 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              <UserPlus className="h-4 w-4" />
              Create User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!userToDelete}
        onClose={() => !deleting && setUserToDelete(null)}
        className="max-w-md"
      >
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="mb-4 rounded-full bg-red-500/10 p-3 text-red-500">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-zinc-100">Delete User?</h2>
          <p className="mb-6 text-sm text-zinc-400">
            Are you sure you want to permanently delete this user? This action cannot be undone and will erase all associated records.
          </p>
          <div className="flex w-full gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setUserToDelete(null)}
              disabled={!!deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 bg-red-600 hover:bg-red-500 text-white"
              onClick={confirmDelete}
              loading={!!deleting}
            >
              Yes, Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        open={!!editingUser}
        onClose={() => !editLoading && setEditingUser(null)}
        title={editingUser ? `Edit ${editingUser.role === 'STUDENT' ? 'Student' : editingUser.role} Details` : "Edit User"}
        className="max-w-xl"
      >
        {editingUser && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {editError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Full Name</label>
                <Input
                  name="name"
                  defaultValue={editingUser.name}
                  required
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Email Address</label>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={editingUser.email}
                    required
                    className="bg-zinc-900 border-zinc-800"
                  />
                </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Phone Number</label>
                <Input
                  name="phone"
                  defaultValue={editingUser.phone || ""}
                  placeholder="+91-9876543210"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>

              {editingUser.role === "STUDENT" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Roll Number</label>
                    <Input
                      name="studentRoll"
                      defaultValue={editingUser.student?.studentRoll || ""}
                      required
                      className="bg-zinc-900 border-zinc-800 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Department</label>
                    <Select
                      name="department"
                      value={editDept}
                      onChange={(e) => setEditDept(e.target.value)}
                      className="bg-zinc-900 border-zinc-800"
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code} - {d.name}
                        </option>
                      ))}
                      <option value="OTHER">Other / Custom Department</option>
                    </Select>
                  </div>
                  {editDept === "OTHER" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">Custom Department</label>
                      <Input
                        name="customDepartment"
                        value={editCustomDept}
                        onChange={(e) => setEditCustomDept(e.target.value)}
                        placeholder="Enter department name"
                        className="bg-zinc-900 border-zinc-800"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Year</label>
                    <Input
                      name="year"
                      type="number"
                      min={1}
                      max={5}
                      defaultValue={editingUser.student?.year || 1}
                      className="bg-zinc-900 border-zinc-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Section</label>
                    <Input
                      name="section"
                      defaultValue={editingUser.student?.section || "A"}
                      className="bg-zinc-900 border-zinc-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Student Type</label>
                    <Select
                      name="studentType"
                      value={editStudentType}
                      onChange={(e) => setEditStudentType(e.target.value)}
                      className="bg-zinc-900 border-zinc-800"
                    >
                      <option value="DAY_SCHOLAR">Day Scholar</option>
                      <option value="HOSTELLER">Hosteller</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Assigned Faculty Advisor</label>
                    <Select
                      name="facultyId"
                      defaultValue={editingUser.student?.facultyId || ""}
                      className="bg-zinc-900 border-zinc-800"
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
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-400">Assigned Warden (Hostellers)</label>
                        <Select
                          name="wardenId"
                          defaultValue={editingUser.student?.wardenId || ""}
                          className="bg-zinc-900 border-zinc-800"
                        >
                          <option value="">-- None --</option>
                          {wardens.map((w: any) => (
                            <option key={w.id} value={w.id}>
                              {w.profile?.name} (Block {w.hostelBlock || "N/A"})
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-400">Hostel Block</label>
                        <Input
                          name="hostelBlock"
                          defaultValue={editingUser.student?.hostelBlock || ""}
                          placeholder="e.g. Block A"
                          className="bg-zinc-900 border-zinc-800"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-400">Room Number</label>
                        <Input
                          name="roomNumber"
                          defaultValue={editingUser.student?.roomNumber || ""}
                          placeholder="e.g. 204"
                          className="bg-zinc-900 border-zinc-800"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {(editingUser.role === "FACULTY" || editingUser.role === "FACULTY_ADMIN" || editingUser.role === "DIRECTOR" || editingUser.role === "DEAN") && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Employee ID</label>
                    <Input
                      name="employeeId"
                      defaultValue={editingUser.faculty?.employeeId || ""}
                      className="bg-zinc-900 border-zinc-800 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Department</label>
                    <Select
                      name="department"
                      value={editDept}
                      onChange={(e) => setEditDept(e.target.value)}
                      className="bg-zinc-900 border-zinc-800"
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code} - {d.name}
                        </option>
                      ))}
                      <option value="OTHER">Other / Custom Department</option>
                    </Select>
                  </div>
                  {editDept === "OTHER" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">Custom Department</label>
                      <Input
                        name="customDepartment"
                        value={editCustomDept}
                        onChange={(e) => setEditCustomDept(e.target.value)}
                        placeholder="Enter department name"
                        className="bg-zinc-900 border-zinc-800"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Designation</label>
                    <Input
                      name="designation"
                      defaultValue={editingUser.faculty?.designation || ""}
                      className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                </>
              )}

              {editingUser.role === "WARDEN" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Employee ID</label>
                    <Input
                      name="employeeId"
                      defaultValue={editingUser.warden?.employeeId || ""}
                      className="bg-zinc-900 border-zinc-800 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Hostel Block</label>
                    <Input
                      name="hostelBlock"
                      defaultValue={editingUser.warden?.hostelBlock || ""}
                      className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                </>
              )}

              {editingUser.role === "SECURITY" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Employee ID</label>
                    <Input
                      name="employeeId"
                      defaultValue={editingUser.securityStaff?.employeeId || ""}
                      className="bg-zinc-900 border-zinc-800 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Assigned Gate</label>
                    <Select
                      name="gateId"
                      defaultValue={editingUser.securityStaff?.gate?.id || ""}
                      className="bg-zinc-900 border-zinc-800"
                    >
                      <option value="">-- None --</option>
                      {gates?.map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
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
                onClick={() => setEditingUser(null)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={editLoading}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* View Details Modal */}
      <Modal
        open={!!selectedUserDetails}
        onClose={() => setSelectedUserDetails(null)}
        title="User Details"
        className="max-w-xl"
      >
        {selectedUserDetails?.details ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4 border-b border-zinc-800/50 pb-4">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${roleColors[selectedUserDetails.role]} bg-opacity-20`}>
                <User className={`h-6 w-6 text-zinc-200`} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-100">{selectedUserDetails.details.profile.name}</h2>
                <p className="text-sm text-zinc-400">{selectedUserDetails.details.profile.email} • {selectedUserDetails.details.profile.phone || "No phone"}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Role Info</h3>
              
              {selectedUserDetails.role === "STUDENT" && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-zinc-500">Roll Number</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.studentRoll}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Department</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.department || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Type</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.studentType}</p>
                  </div>
                  {selectedUserDetails.details.studentType === "HOSTELLER" && (
                    <div>
                      <p className="text-zinc-500">Hostel Block / Room</p>
                      <p className="text-zinc-200 font-medium">{selectedUserDetails.details.hostelBlock || "N/A"} - {selectedUserDetails.details.roomNumber || "N/A"}</p>
                    </div>
                  )}
                  
                  <div className="col-span-2 pt-4 border-t border-zinc-800/50 space-y-4">
                    <div>
                      <label className="text-sm font-medium text-zinc-300 mb-1 block">Assigned Faculty</label>
                      <div className="flex gap-2">
                        <Select
                          disabled={assigning}
                          value={selectedUserDetails.details.facultyId || ""}
                          onChange={(e) => handleAssign("faculty", selectedUserDetails.details.id, e.target.value)}
                        >
                          <option value="">None</option>
                          {faculty.map(f => (
                            <option key={f.id} value={f.id}>{f.profile.name} ({f.department || "No Dept"})</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    {selectedUserDetails.details.studentType === "HOSTELLER" && (
                      <div>
                        <label className="text-sm font-medium text-zinc-300 mb-1 block">Assigned Warden</label>
                        <div className="flex gap-2">
                          <Select
                            disabled={assigning}
                            value={selectedUserDetails.details.wardenId || ""}
                            onChange={(e) => handleAssign("warden", selectedUserDetails.details.id, e.target.value)}
                          >
                            <option value="">None</option>
                            {wardens.map(w => (
                              <option key={w.id} value={w.id}>{w.profile.name} (Block {w.hostelBlock || "N/A"})</option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(selectedUserDetails.role === "FACULTY" || selectedUserDetails.role === "FACULTY_ADMIN") && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-zinc-500">Employee ID</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.employeeId || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Department</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.department || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Designation</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.designation || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Assigned Students</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details._count.assignedStudents}</p>
                  </div>
                </div>
              )}

              {selectedUserDetails.role === "WARDEN" && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-zinc-500">Employee ID</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.employeeId || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Hostel Block</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.hostelBlock || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Assigned Hostellers</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details._count.assignedHostellers}</p>
                  </div>
                </div>
              )}

              {selectedUserDetails.role === "SECURITY" && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-zinc-500">Employee ID</p>
                    <p className="text-zinc-200 font-medium">{selectedUserDetails.details.employeeId || "N/A"}</p>
                  </div>
                  <div className="col-span-2 pt-4 border-t border-zinc-800/50">
                    <label className="text-sm font-medium text-zinc-300 mb-1 block">Assigned Gate</label>
                    <div className="flex gap-2">
                      <Select
                        disabled={assigning}
                        value={selectedUserDetails.details.gateId || ""}
                        onChange={(e) => handleAssign("gate", selectedUserDetails.details.id, e.target.value)}
                      >
                        <option value="">None</option>
                        {gates?.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-zinc-500">Failed to load details</div>
        )}
      </Modal>
    
    </>
  );
}

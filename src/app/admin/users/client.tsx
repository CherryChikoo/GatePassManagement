"use client";
import { DepartmentSelect } from "@/components/ui/department-select";
import { actionErrorMessage } from "@/lib/deployment";

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
import { useAppStore } from "@/stores/app-store";
import { AccountSyncPanel } from "./account-sync-panel";
import { Search,
  UserPlus,
  Users,
  Shield,
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
  PencilLine,
  Ban,
  CircleCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";
import { PagerBar } from "@/components/ui/pager-bar";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { DEPARTMENTS, getDepartmentCode, getDepartmentFullName } from "@/lib/constants";
import { cn } from "@/lib/utils";

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
    } else if (["FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN"].includes(u.role) && u.faculty) {
      // Director/Dean usually hold "All Departments", which is kept via the OTHER/custom branch
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
          semester: formData.get("semester") ? Number(formData.get("semester")) : null,
          section: formData.get("section") as string,
          studentType: formData.get("studentType") as any,
          hostelType: formData.get("studentType") === "HOSTELLER" ? (formData.get("hostelType") as string) || null : null,
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
          // Deans are saved as "Dean of <area>"
          designation:
            editingUser.role === "DEAN"
              ? `Dean of ${String(formData.get("deanOf") || "").trim().replace(/^dean\s+of\s+/i, "")}`
              : (formData.get("designation") as string),
          hostelBlock: formData.get("hostelBlock") as string,
          gateId: formData.get("gateId") as string,
          ...(editingUser.role === "SECURITY" ? { isHeadSecurity: formData.get("isHeadSecurity") === "on" } : {}),
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
      setEditError(actionErrorMessage(err, "Failed to update user"));
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

    const undo = () =>
      setUsersData((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === profileId ? { ...u, active: !u.active } : u)),
      }));
    try {
      const res = await toggleUserActive(profileId);
      if (res?.error) {
        undo();
        window.alert(res.error);
      }
    } catch {
      undo();
      window.alert("Failed to update the account status.");
    }
    setToggling(null);
    useAppStore.getState().refresh(true);
    router.refresh();
  }

  function handleDeleteClick(profileId: string) {
    setUserToDelete(profileId);
  }

  async function confirmDelete() {
    if (!userToDelete) return;
    setDeleting(userToDelete);
    try {
      const res = await deleteUser(userToDelete);
      if (res?.error) window.alert(res.error);
    } catch {
      window.alert("Failed to delete the user.");
    }
    setDeleting(null);
    setUserToDelete(null);
    useAppStore.getState().refresh(true);
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

  const ROLES = ["STUDENT", "FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN", "WARDEN", "SECURITY", "SECURITY_SUPERVISOR", "ADMIN"];

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

  // ── Shared visual helpers (markup only) ─────────────────────
  const sectionCls = "rounded-2xl border border-zinc-800 p-4 sm:p-5 space-y-4";
  const sectionLabelCls = "flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500";
  const fieldLabelCls = "block text-sm font-medium text-zinc-300";
  const tileLabelCls = "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500";

  function initials(name: string) {
    return name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
  }

  function employeeIdOf(u: any) {
    return u.faculty?.employeeId || u.warden?.employeeId || u.securityStaff?.employeeId || "N/A";
  }

  // Assignment / department summary for staff rows
  function renderAssignment(u: any, role: string) {
    return (
      <>
        {(role === "FACULTY" || role === "FACULTY_ADMIN" || role === "DIRECTOR" || role === "DEAN") && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {u.faculty?.department ? (
                <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-400">
                  {getDepartmentCode(u.faculty.department)}
                </span>
              ) : null}
              <span className="font-medium text-zinc-200 break-words">
                {u.faculty?.department || "No Department"}
              </span>
            </div>
            <p className="text-zinc-500 mt-0.5">
              {u.faculty?.designation || (role === "DIRECTOR" ? "Director" : role === "DEAN" ? "Dean" : role === "FACULTY_ADMIN" ? "Head of Department" : "Faculty")}
            </p>
          </>
        )}
        {role === "WARDEN" && (
          <>
            <p className="font-medium text-zinc-200">
              {u.warden?.hostelBlock ? `Hostel Block ${u.warden.hostelBlock}` : "All Blocks"}
            </p>
            <p className="text-zinc-500 mt-0.5">Warden</p>
          </>
        )}
        {role === "SECURITY" && (
          <>
            <p className="font-medium text-zinc-200">
              {u.securityStaff?.gate?.name ? `Assigned: ${u.securityStaff.gate.name}` : "Unassigned Gate"}
            </p>
            <p className="text-zinc-500 mt-0.5">Security Personnel</p>
          </>
        )}
        {role === "ADMIN" && (
          <p className="text-zinc-500">System Administrator</p>
        )}
      </>
    );
  }

  // "All Data" icon action (opens the user's page; spinner while navigating)
  function allDataAction(u: any) {
    const navigating = isNavigatingId && navigatingUserId === u.id;
    return (
      <IconAction
        label="All Data"
        icon={navigating ? <Loader2 className="animate-spin" /> : <History />}
        onClick={() => navigateToHistory(u.id)}
        disabled={navigating}
      />
    );
  }

  // Row actions (All Data / Edit / Disable / Delete, + expand toggle in the table) as icon buttons with hover labels.
  // `isExpanded` undefined = no expand toggle (the phone row itself toggles).
  // Other admins: only Disable / Enable (never delete or a password change); none on your own row
  function renderAdminActions(u: any) {
    if (u.email === user.email) return null;
    return (
      <RowActions>
        <IconAction
          label={u.active ? "Disable" : "Enable"}
          icon={toggling === u.id ? <Loader2 className="animate-spin" /> : u.active ? <Ban /> : <CircleCheck />}
          tone={u.active ? "danger" : "success"}
          onClick={() => handleToggle(u.id)}
          disabled={toggling === u.id}
        />
      </RowActions>
    );
  }

  function renderActions(u: any, isExpanded?: boolean) {
    return (
      <RowActions>
        {allDataAction(u)}
        <IconAction label="Edit" icon={<PencilLine />} tone="coral" onClick={() => handleOpenEdit(u)} />
        <IconAction
          label={u.active ? "Disable" : "Enable"}
          icon={toggling === u.id ? <Loader2 className="animate-spin" /> : u.active ? <Ban /> : <CircleCheck />}
          tone={u.active ? "danger" : "success"}
          onClick={() => handleToggle(u.id)}
          disabled={toggling === u.id || deleting === u.id}
        />
        <IconAction
          label="Delete"
          icon={deleting === u.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
          tone="danger"
          onClick={() => handleDeleteClick(u.id)}
          disabled={deleting === u.id || toggling === u.id}
        />
        {isExpanded !== undefined && (
          <IconAction
            label={isExpanded ? "Collapse details" : "View full details"}
            icon={<ChevronDown className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />}
            active={isExpanded}
            onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
          />
        )}
      </RowActions>
    );
  }

  // Expanded "full details" panel, shared by the table and the stacked list
  function renderExpanded(u: any, role: string) {
    const allDataButton = allDataAction(u);

    if (role === "STUDENT") {
      return (
        <div className="space-y-4">
          {/* Top info bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-800/70">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-medium text-zinc-100 break-words">{u.name}</h4>
                  {u.student?.studentRoll && (
                    <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-orange-400">
                      {u.student.studentRoll}
                    </span>
                  )}
                  <Badge variant={u.student?.studentType === "HOSTELLER" ? "info" : "default"}>
                    {u.student?.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 break-all">
                  {u.email} {u.phone ? `• ${u.phone}` : ""}
                </p>
              </div>
            </div>
            <RowActions className="self-end md:self-auto">
              {allDataButton}
              <IconAction label="Edit Student Details" icon={<PencilLine />} tone="coral" onClick={() => handleOpenEdit(u)} />
            </RowActions>
          </div>

          {/* Detail tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5 min-w-0">
              <span className={tileLabelCls}>
                <GraduationCap className="h-3.5 w-3.5 text-orange-400" />
                Academic Cohort
              </span>
              <p className="text-sm font-medium text-zinc-200 break-words">
                {u.student?.department || "General Department"}
              </p>
              <p className="text-xs text-zinc-500">
                {u.student?.year ? `Year ${u.student.year}` : "Year N/A"}
                {u.student?.section ? ` • Section ${u.student.section}` : ""}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5 min-w-0">
              <span className={tileLabelCls}>
                <Building2 className="h-3.5 w-3.5 text-orange-400" />
                Residency & Hostel
              </span>
              <p className="text-sm font-medium text-zinc-200">
                {u.student?.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
              </p>
              <p className="text-xs text-zinc-500">
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

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5 min-w-0">
              <span className={tileLabelCls}>
                <Users className="h-3.5 w-3.5 text-orange-400" />
                Assigned Mentors
              </span>
              <div className="text-xs space-y-1">
                <p className="text-zinc-300">
                  <span className="text-zinc-500">Faculty: </span>
                  {u.student?.faculty?.profile?.name ? (
                    <span className="font-medium text-zinc-100">{u.student.faculty.profile.name}</span>
                  ) : (
                    <span className="text-zinc-600 italic">Unassigned</span>
                  )}
                </p>
                {u.student?.studentType === "HOSTELLER" && (
                  <p className="text-zinc-300">
                    <span className="text-zinc-500">Warden: </span>
                    {u.student?.warden?.profile?.name ? (
                      <span className="font-medium text-zinc-100">{u.student.warden.profile.name}</span>
                    ) : (
                      <span className="text-zinc-600 italic">Unassigned</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5 min-w-0">
              <span className={tileLabelCls}>
                <Shield className="h-3.5 w-3.5 text-orange-400" />
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
      );
    }

    return (
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h4 className="text-sm font-medium text-zinc-100 flex flex-wrap items-center gap-x-2">
            {u.name}
            <span className="text-xs font-mono font-normal text-zinc-500">
              ({u.faculty?.employeeId || u.warden?.employeeId || u.securityStaff?.employeeId || "No Employee ID"})
            </span>
          </h4>
          <p className="text-xs text-zinc-500 break-all">
            Email: <span className="text-zinc-200">{u.email}</span>
            {u.phone ? ` • Phone: ${u.phone}` : ""}
          </p>
          {(role === "FACULTY" || role === "FACULTY_ADMIN") && u.faculty && (
            <p className="text-xs text-zinc-400">
              {u.faculty.department ? `Department: ${getDepartmentFullName(u.faculty.department)} (${getDepartmentCode(u.faculty.department)})` : "No Department"} • {u.faculty.designation || (role === "FACULTY_ADMIN" ? "Head of Department" : "Faculty Member")} {role === "FACULTY" ? `• ${u.faculty._count?.assignedStudents || 0} Assigned Students` : ""}
            </p>
          )}
          {role === "WARDEN" && u.warden && (
            <p className="text-xs text-zinc-400">
              {u.warden.hostelBlock ? `Hostel Block ${u.warden.hostelBlock}` : "All Hostel Blocks"} • {u.warden._count?.assignedHostellers || 0} Hostellers
            </p>
          )}
          {role === "SECURITY" && u.securityStaff && (
            <p className="text-xs text-zinc-400">
              {u.securityStaff.isHead && <span className="mr-1.5 rounded-full bg-orange-500/10 px-2 py-0.5 font-medium text-orange-400">Head Security</span>}
              {u.securityStaff.gate?.name ? `Gate: ${u.securityStaff.gate.name}` : "Unassigned Gate"}
            </p>
          )}
        </div>
        <RowActions className="self-end md:self-auto shrink-0">
          {allDataButton}
          <IconAction label="Edit Details" icon={<PencilLine />} tone="coral" onClick={() => handleOpenEdit(u)} />
        </RowActions>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <BackButton href="/admin" label="Back to Dashboard" className="-ml-3 mb-2" />
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
              User Management
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {initialUsers.total} registered users
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
            <UserPlus className="h-4 w-4" />
            Create User
          </Button>
        </div>

        <AccountSyncPanel />

        {success && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Role tabs & search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div
            className="inline-flex max-w-full self-start rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
            role="tablist"
            aria-label="Filter users by role"
          >
            {ROLES.map((role) => {
              const isPending = isNavigatingRole && pendingRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  aria-selected={currentRole === role}
                  disabled={isPending}
                  onClick={() => handleRoleFilter(role)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 sm:py-1.5 rounded-full transition-colors whitespace-nowrap capitalize disabled:cursor-wait ${
                    currentRole === role
                      ? "bg-zinc-900 text-zinc-100 shadow-card"
                      : isPending
                        ? "text-orange-400"
                        : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  {role === "FACULTY" ? "Faculty" : role === "FACULTY_ADMIN" ? "HOD" : role === "SECURITY" ? "Security" : role === "SECURITY_SUPERVISOR" ? "Security Supervisors" : role === "DIRECTOR" ? "Director" : role === "DEAN" ? "Dean" : `${role.toLowerCase()}s`}
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-80 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by name, email, roll no..."
              aria-label="Search users"
              className="h-10 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
          </div>
        </div>

        {/* Users by role */}
        <div className="space-y-6">
          {ROLES.map((role) => {
            const roleUsers = filteredUsers.filter((u) => u.role === role);
            if (roleUsers.length === 0) return null;

            return (
              <Card key={role} className="overflow-hidden">
                <div className="flex items-center gap-2 px-5 sm:px-6 pt-5 pb-3">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                    {role === "FACULTY" ? "FACULTY" : role === "FACULTY_ADMIN" ? "HOD (HEAD OF DEPARTMENT)" : role === "SECURITY" ? "SECURITY" : role === "SECURITY_SUPERVISOR" ? "SECURITY SUPERVISOR" : role === "DIRECTOR" ? "DIRECTOR" : role === "DEAN" ? "DEAN" : `${role}S`}
                  </h2>
                </div>

                {/* Phone & tablet: stacked rows */}
                <ul className="lg:hidden divide-y divide-zinc-800/70 px-5 sm:px-6 pb-3">
                  {roleUsers.map((u) => {
                    const isExpanded = expandedUserId === u.id;
                    return (
                      <li key={u.id} className="py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                          aria-expanded={isExpanded}
                          className="w-full flex items-center gap-3 text-left rounded-2xl px-2 -mx-2 py-1 hover:bg-zinc-950 transition-colors"
                          title={isExpanded ? "Collapse details" : "Click to view full details"}
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-sm font-semibold">
                            {initials(u.name)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-zinc-100 truncate">
                              {u.name}
                              {role === "STUDENT" && u.student?.studentRoll && (
                                <span className="font-normal text-zinc-500"> · {u.student.studentRoll}</span>
                              )}
                            </span>
                            <span className="block text-xs text-zinc-500 truncate">{u.email}</span>
                            {role === "STUDENT" ? (
                              u.phone && (
                                <span className="flex items-center gap-1 text-xs text-zinc-500 truncate">
                                  <Phone className="h-3 w-3" />
                                  {u.phone}
                                </span>
                              )
                            ) : (
                              <span className="block text-xs text-zinc-500 truncate">
                                <span className="font-mono">{employeeIdOf(u)}</span>
                                {u.phone ? ` · ${u.phone}` : ""}
                              </span>
                            )}
                          </span>
                          <span className="flex flex-col items-end gap-1.5 shrink-0">
                            <Badge variant={u.active ? "success" : "danger"}>
                              {u.active ? "Active" : "Disabled"}
                            </Badge>
                            {u.role !== "ADMIN" && (
                              <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${isExpanded ? "rotate-180 text-orange-400" : ""}`} />
                            )}
                          </span>
                        </button>

                        {role !== "STUDENT" && (
                          <div className="mt-2 pl-14 text-xs">{renderAssignment(u, role)}</div>
                        )}

                        {u.role !== "ADMIN" ? (
                          <div className="mt-2 flex justify-end">
                            {renderActions(u)}
                          </div>
                        ) : (
                          u.email !== user.email && <div className="mt-2 flex justify-end">{renderAdminActions(u)}</div>
                        )}

                        {isExpanded && (
                          <div className="mt-3 rounded-2xl bg-zinc-950 p-4 animate-fade-in">
                            {renderExpanded(u, role)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* Desktop: table */}
                <div className={`hidden lg:block ${dt.wrap}`}>
                  <table className={cn(dt.table, "min-w-[760px]")}>
                    <thead>
                      <tr>
                        {role === "STUDENT" ? (
                          <>
                            <th className={dt.th}>Student</th>
                            <th className={dt.th}>Email</th>
                            <th className={dt.th}>Status</th>
                            <th className={dt.thRight}>Actions</th>
                          </>
                        ) : (
                          <>
                            <th className={dt.th}>Name & Contact</th>
                            <th className={dt.th}>Employee ID</th>
                            <th className={dt.th}>Assignment / Dept</th>
                            <th className={dt.th}>Status</th>
                            <th className={dt.thRight}>Actions</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {roleUsers.map((u) => {
                        const isExpanded = expandedUserId === u.id;

                        return (
                          <React.Fragment key={u.id}>
                            <tr
                              onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                              className={`${dt.trClickable} select-none`}
                              title="Click row to view full details"
                            >
                              {role === "STUDENT" ? (
                                <>
                                  <td className={dt.td}>
                                    <PersonCell
                                      name={u.name}
                                      chip={u.student?.studentRoll ? <span className={`${dt.chip} shrink-0`}>{u.student.studentRoll}</span> : undefined}
                                      sub={
                                        u.phone ? (
                                          <span className="inline-flex items-center gap-1">
                                            <Phone className="h-3 w-3" />
                                            {u.phone}
                                          </span>
                                        ) : undefined
                                      }
                                    />
                                  </td>
                                  <td className={dt.tdMuted}>{u.email}</td>
                                  <td className={dt.td}>
                                    <Badge variant={u.active ? "success" : "danger"}>
                                      {u.active ? "Active" : "Disabled"}
                                    </Badge>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={dt.td}>
                                    <PersonCell
                                      name={u.name}
                                      sub={
                                        <>
                                          <span className="block truncate">{u.email}</span>
                                          {u.phone && <span className="block truncate">{u.phone}</span>}
                                        </>
                                      }
                                    />
                                  </td>
                                  <td className={dt.td}>
                                    <span className={dt.chip}>{employeeIdOf(u)}</span>
                                  </td>
                                  <td className={`${dt.td} text-xs`}>{renderAssignment(u, role)}</td>
                                  <td className={dt.td}>
                                    <Badge variant={u.active ? "success" : "danger"}>
                                      {u.active ? "Active" : "Disabled"}
                                    </Badge>
                                  </td>
                                </>
                              )}

                              {/* Actions */}
                              <td className={dt.tdActions}>
                                {u.role !== "ADMIN" ? renderActions(u, isExpanded) : renderAdminActions(u)}
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="animate-fade-in">
                                <td colSpan={role === "STUDENT" ? 4 : 5} className="px-2 pb-3">
                                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                    {renderExpanded(u, role)}
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
              </Card>
            );
          })}

          {filteredUsers.length === 0 && (
            <Card>
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="No users found"
                description="There are currently no users for this role. You can create a new one using the button above."
              />
            </Card>
          )}
        </div>

        {/* Pagination (docked at the bottom of the screen) */}
        <PagerBar
          page={currentPage}
          pageSize={15}
          total={usersData.total}
          hrefForPage={(p) => `/admin/users?page=${p}${currentRole !== "ALL" ? `&role=${currentRole}` : ""}`}
          itemLabel="users"
        />
      </div>

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
        <form
          // Not a form action: React resets action forms after submit, which would
          // wipe everything typed when the server returns an error (e.g. email taken).
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateUser(new FormData(e.currentTarget));
          }}
          className="space-y-4 sm:space-y-5"
        >
          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Account credentials */}
          <section className={sectionCls}>
            <h3 className={sectionLabelCls}>
              <Users className="h-3.5 w-3.5 text-orange-400" /> Account Credentials
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input name="name" label="Full Name *" required id="create-name" icon={<Users className="h-4 w-4" />} />
              <Input name="email" type="email" label="Email *" required id="create-email" icon={<Mail className="h-4 w-4" />} />
              <Input name="password" type="password" label="Password *" required minLength={8} maxLength={72} placeholder="At least 8 characters" id="create-password" icon={<Lock className="h-4 w-4" />} />
              <Input name="phone" type="tel" label="Phone" id="create-phone" icon={<Phone className="h-4 w-4" />} />
            </div>
          </section>

          {/* Role */}
          <section className={sectionCls}>
            <h3 className={sectionLabelCls}>
              <Shield className="h-3.5 w-3.5 text-orange-400" /> Role & Permissions
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
              <option value="HEAD_SECURITY">Head Security (takes staff attendance)</option>
              <option value="SECURITY_SUPERVISOR">Security Supervisor (view only)</option>
              <option value="ADMIN">Admin (full access)</option>
            </Select>
            {selectedRole === "ADMIN" && (
              <p className="mt-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-400">
                An admin can do everything you can: create and disable users, edit records and change settings. Give this only to people you trust.
              </p>
            )}
          </section>

          {/* Student-specific fields */}
          {selectedRole === "STUDENT" && (
            <section className={sectionCls}>
              <h3 className={sectionLabelCls}>
                <GraduationCap className="h-3.5 w-3.5 text-orange-400" />
                Student-Specific Details
              </h3>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input name="year" type="number" min={1} max={6} label="Year" id="create-year" />
                <Input name="semester" type="number" min={1} max={12} label="Semester" id="create-semester" />
                <Input name="section" label="Section" id="create-section" />
                <Select name="studentType" label="Type" id="create-student-type" value={createStudentType} onChange={(e) => setCreateStudentType(e.target.value)}>
                  <option value="DAY_SCHOLAR">Day Scholar</option>
                  <option value="HOSTELLER">Hosteller</option>
                </Select>
              </div>
              <Select name="assignedFacultyId" label="Assigned Faculty" id="create-faculty">
                <option value="">None</option>
                {faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.profile.name} {f.department ? `(${f.department})` : ""}
                  </option>
                ))}
              </Select>

              {createStudentType === "HOSTELLER" && (
                <div className="space-y-4 rounded-2xl bg-zinc-950 p-4">
                  <p className={sectionLabelCls}>
                    <Building2 className="h-3.5 w-3.5 text-orange-400" />
                    Hostel
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Select name="hostelType" label="Hostel" id="create-hostel-type" required defaultValue="">
                        <option value="" disabled>Select hostel</option>
                        <option value="BOYS">Boys Hostel</option>
                        <option value="LADIES">Ladies Hostel</option>
                      </Select>
                    </div>
                    <Input name="roomNumber" label="Room Number" id="create-room" />
                    <Input name="hostelBlock" label="Hostel Block" id="create-hostel" />
                  </div>
                  <Select name="assignedWardenId" label="Assigned Warden" id="create-warden">
                    <option value="">None</option>
                    {wardens.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.profile.name} {w.hostelBlock ? `(Block ${w.hostelBlock})` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </section>
          )}

          {/* Faculty-specific */}
          {selectedRole === "FACULTY" && (
            <section className={sectionCls}>
              <h3 className={sectionLabelCls}>
                <BookOpen className="h-3.5 w-3.5 text-orange-400" />
                Faculty-Specific Details
              </h3>
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
            </section>
          )}

          {/* HOD-specific */}
          {selectedRole === "FACULTY_ADMIN" && (
            <section className={sectionCls}>
              <h3 className={sectionLabelCls}>
                <Shield className="h-3.5 w-3.5 text-orange-400" />
                HOD (Head of Department) Details
              </h3>
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
            </section>
          )}

          {/* Director-specific */}
          {selectedRole === "DIRECTOR" && (
            <section className={sectionCls}>
              <h3 className={sectionLabelCls}>
                <Shield className="h-3.5 w-3.5 text-orange-400" />
                Director Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input name="employeeId" label="Employee ID *" required id="create-dir-emp" defaultValue={`DIR-${Date.now().toString().slice(-4)}`} />
                <div className="space-y-1.5">
                  <label htmlFor="create-dir-dept" className="block text-sm font-medium text-zinc-300">Department</label>
                  <DepartmentSelect name="department" id="create-dir-dept" defaultValue="All Departments" extraOptions={["All Departments"]} />
                </div>
              </div>
              <Input
                name="designation"
                label="Title *"
                required
                maxLength={100}
                placeholder="e.g. Managing Director"
                id="create-dir-designation"
              />
            </section>
          )}

          {/* Dean-specific */}
          {selectedRole === "DEAN" && (
            <section className={sectionCls}>
              <h3 className={sectionLabelCls}>
                <Shield className="h-3.5 w-3.5 text-orange-400" />
                Dean Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input name="employeeId" label="Employee ID *" required id="create-dean-emp" defaultValue={`DEAN-${Date.now().toString().slice(-4)}`} />
                <div className="space-y-1.5">
                  <label htmlFor="create-dean-dept" className="block text-sm font-medium text-zinc-300">Department</label>
                  <DepartmentSelect name="department" id="create-dean-dept" defaultValue="All Departments" extraOptions={["All Departments"]} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="create-dean-of" className={fieldLabelCls}>Dean of *</label>
                <div className="flex items-stretch overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700 focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/40">
                  <span className="flex items-center bg-zinc-950 px-4 text-sm font-medium text-zinc-500 border-r border-zinc-800 whitespace-nowrap">Dean of</span>
                  <input
                    id="create-dean-of"
                    name="deanOf"
                    required
                    maxLength={80}
                    placeholder="e.g. Placements, Internal Affairs, Academics"
                    className="h-12 w-full min-w-0 bg-transparent px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Warden-specific */}
          {selectedRole === "WARDEN" && (
            <section className={sectionCls}>
              <h3 className={sectionLabelCls}>
                <Building2 className="h-3.5 w-3.5 text-orange-400" />
                Warden-Specific Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input name="employeeId" label="Employee ID *" required id="create-warden-emp" />
                <Input name="wardenHostelBlock" label="Hostel Block" id="create-warden-block" />
              </div>
            </section>
          )}

          {/* Security-specific */}
          {(selectedRole === "SECURITY" || selectedRole === "HEAD_SECURITY") && (
            <section className={sectionCls}>
              <h3 className={sectionLabelCls}>
                <Shield className="h-3.5 w-3.5 text-orange-400" />
                Security-Specific Details
              </h3>
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
            </section>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setShowCreateModal(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="w-full sm:w-auto">
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
        <div className="flex flex-col items-center justify-center p-2 sm:p-4 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="mb-2 text-xl font-medium text-zinc-100">Delete User?</h2>
          <p className="mb-6 text-sm text-zinc-500 leading-relaxed">
            Are you sure you want to permanently delete this user? This action cannot be undone and will erase all associated records.
          </p>
          <div className="flex w-full flex-col-reverse sm:flex-row gap-3">
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
              variant="destructive"
              className="flex-1"
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
        className="max-w-2xl"
      >
        {editingUser && (
          <form onSubmit={handleSaveEdit} className="space-y-4 sm:space-y-5">
            {editError && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            {/* Account & contact */}
            <section className={sectionCls}>
              <h3 className={sectionLabelCls}>
                <User className="h-3.5 w-3.5 text-orange-400" /> Account & Contact
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={fieldLabelCls}>Full Name</label>
                  <Input
                    name="name"
                    defaultValue={editingUser.name}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={fieldLabelCls}>Email Address</label>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={editingUser.email}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={fieldLabelCls}>Phone Number</label>
                  <Input
                    name="phone"
                    defaultValue={editingUser.phone || ""}
                    placeholder="+91-9876543210"
                  />
                </div>
              </div>
            </section>

            {editingUser.role === "STUDENT" && (
              <section className={sectionCls}>
                <h3 className={sectionLabelCls}>
                  <GraduationCap className="h-3.5 w-3.5 text-orange-400" /> Student Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Roll Number</label>
                    <Input
                      name="studentRoll"
                      defaultValue={editingUser.student?.studentRoll || ""}
                      required
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Department</label>
                    <Select
                      name="department"
                      value={editDept}
                      onChange={(e) => setEditDept(e.target.value)}
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
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className={fieldLabelCls}>Custom Department</label>
                      <Input
                        name="customDepartment"
                        value={editCustomDept}
                        onChange={(e) => setEditCustomDept(e.target.value)}
                        placeholder="Enter department name"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Year</label>
                    <Input
                      name="year"
                      type="number"
                      min={1}
                      max={5}
                      defaultValue={editingUser.student?.year ?? ""}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Semester</label>
                    <Input
                      name="semester"
                      type="number"
                      min={1}
                      max={12}
                      defaultValue={editingUser.student?.semester ?? ""}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Section</label>
                    <Input
                      name="section"
                      defaultValue={editingUser.student?.section ?? ""}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Student Type</label>
                    <Select
                      name="studentType"
                      value={editStudentType}
                      onChange={(e) => setEditStudentType(e.target.value)}
                    >
                      <option value="DAY_SCHOLAR">Day Scholar</option>
                      <option value="HOSTELLER">Hosteller</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className={fieldLabelCls}>Assigned Faculty Advisor</label>
                    <Select
                      name="facultyId"
                      defaultValue={editingUser.student?.facultyId || ""}
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
                        <label className={fieldLabelCls}>Assigned Warden (Hostellers)</label>
                        <Select
                          name="wardenId"
                          defaultValue={editingUser.student?.wardenId || ""}
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
                        <label className={fieldLabelCls}>Hostel</label>
                        <Select
                          name="hostelType"
                          defaultValue={editingUser.student?.hostelType || ""}
                        >
                          <option value="">-- Not set --</option>
                          <option value="BOYS">Boys Hostel</option>
                          <option value="LADIES">Ladies Hostel</option>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className={fieldLabelCls}>Hostel Block</label>
                        <Input
                          name="hostelBlock"
                          defaultValue={editingUser.student?.hostelBlock || ""}
                          placeholder="e.g. Block A"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className={fieldLabelCls}>Room Number</label>
                        <Input
                          name="roomNumber"
                          defaultValue={editingUser.student?.roomNumber || ""}
                          placeholder="e.g. 204"
                        />
                      </div>
                    </>
                  )}
                </div>
              </section>
            )}

            {(editingUser.role === "FACULTY" || editingUser.role === "FACULTY_ADMIN" || editingUser.role === "DIRECTOR" || editingUser.role === "DEAN") && (
              <section className={sectionCls}>
                <h3 className={sectionLabelCls}>
                  <BookOpen className="h-3.5 w-3.5 text-orange-400" /> Role Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Employee ID</label>
                    <Input
                      name="employeeId"
                      defaultValue={editingUser.faculty?.employeeId || ""}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Department</label>
                    <Select
                      name="department"
                      value={editDept}
                      onChange={(e) => setEditDept(e.target.value)}
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
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className={fieldLabelCls}>Custom Department</label>
                      <Input
                        name="customDepartment"
                        value={editCustomDept}
                        onChange={(e) => setEditCustomDept(e.target.value)}
                        placeholder="Enter department name"
                      />
                    </div>
                  )}
                  {editingUser.role === "DEAN" ? (
                    <div className="space-y-1.5 sm:col-span-2">
                      <label htmlFor="edit-dean-of" className={fieldLabelCls}>Dean of *</label>
                      <div className="flex items-stretch overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700 focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/40">
                        <span className="flex items-center bg-zinc-950 px-4 text-sm font-medium text-zinc-500 border-r border-zinc-800 whitespace-nowrap">Dean of</span>
                        <input
                          id="edit-dean-of"
                          name="deanOf"
                          required
                          maxLength={80}
                          defaultValue={(editingUser.faculty?.designation || "").replace(/^dean(\s+of)?\s*/i, "")}
                          placeholder="e.g. Placements, Internal Affairs"
                          className="h-12 w-full min-w-0 bg-transparent px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className={fieldLabelCls}>{editingUser.role === "DIRECTOR" ? "Title *" : "Designation"}</label>
                      <Input
                        name="designation"
                        required={editingUser.role === "DIRECTOR"}
                        maxLength={100}
                        placeholder={editingUser.role === "DIRECTOR" ? "e.g. Managing Director" : undefined}
                        defaultValue={editingUser.faculty?.designation || ""}
                      />
                    </div>
                  )}
                </div>
              </section>
            )}

            {editingUser.role === "WARDEN" && (
              <section className={sectionCls}>
                <h3 className={sectionLabelCls}>
                  <Building2 className="h-3.5 w-3.5 text-orange-400" /> Warden Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Employee ID</label>
                    <Input
                      name="employeeId"
                      defaultValue={editingUser.warden?.employeeId || ""}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Hostel Block</label>
                    <Input
                      name="hostelBlock"
                      defaultValue={editingUser.warden?.hostelBlock || ""}
                    />
                  </div>
                </div>
              </section>
            )}

            {editingUser.role === "SECURITY" && (
              <section className={sectionCls}>
                <h3 className={sectionLabelCls}>
                  <Shield className="h-3.5 w-3.5 text-orange-400" /> Security Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Employee ID</label>
                    <Input
                      name="employeeId"
                      defaultValue={editingUser.securityStaff?.employeeId || ""}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={fieldLabelCls}>Assigned Gate</label>
                    <Select
                      name="gateId"
                      defaultValue={editingUser.securityStaff?.gate?.id || ""}
                    >
                      <option value="">-- None --</option>
                      {gates?.map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </Select>
                  </div>
                  <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 cursor-pointer sm:col-span-2 hover:border-zinc-700 transition-colors">
                    <input
                      type="checkbox"
                      name="isHeadSecurity"
                      defaultChecked={!!editingUser.securityStaff?.isHead}
                      className="mt-0.5 h-4 w-4 accent-orange-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-zinc-200">Head Security</span>
                      <span className="block text-xs text-zinc-500">Can see and take the staff attendance register. Everything else is the same as Security.</span>
                    </span>
                  </label>
                </div>
              </section>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 border-t border-zinc-800">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setEditingUser(null)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={editLoading}
                className="w-full sm:w-auto"
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
          <div className="space-y-5">
            <div className="flex items-center gap-4 border-b border-zinc-800 pb-4 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                <User className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-medium text-zinc-100 truncate">{selectedUserDetails.details.profile.name}</h2>
                <p className="text-sm text-zinc-500 break-all">{selectedUserDetails.details.profile.email} • {selectedUserDetails.details.profile.phone || "No phone"}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className={sectionLabelCls}>Role Info</h3>

              {selectedUserDetails.role === "STUDENT" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Roll Number</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.studentRoll}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Department</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.department || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Type</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.studentType}</p>
                  </div>
                  {selectedUserDetails.details.studentType === "HOSTELLER" && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Hostel Block / Room</p>
                      <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.hostelBlock || "N/A"} - {selectedUserDetails.details.roomNumber || "N/A"}</p>
                    </div>
                  )}

                  <div className="sm:col-span-2 pt-4 border-t border-zinc-800 space-y-4">
                    <div>
                      <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Assigned Faculty</label>
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
                        <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Assigned Warden</label>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Employee ID</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.employeeId || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Department</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.department || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Designation</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.designation || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Assigned Students</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details._count.assignedStudents}</p>
                  </div>
                </div>
              )}

              {selectedUserDetails.role === "WARDEN" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Employee ID</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.employeeId || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Hostel Block</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.hostelBlock || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Assigned Hostellers</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details._count.assignedHostellers}</p>
                  </div>
                </div>
              )}

              {selectedUserDetails.role === "SECURITY" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Employee ID</p>
                    <p className="text-sm text-zinc-200 break-words">{selectedUserDetails.details.employeeId || "N/A"}</p>
                  </div>
                  <div className="sm:col-span-2 pt-4 border-t border-zinc-800">
                    <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Assigned Gate</label>
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
          <div className="py-12 text-center text-sm text-zinc-500">Failed to load details</div>
        )}
      </Modal>
    </>
  );
}

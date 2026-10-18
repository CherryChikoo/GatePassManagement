"use client";
import { DepartmentSelect } from "@/components/ui/department-select";
import { actionErrorMessage } from "@/lib/deployment";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, Select, Badge, EmptyState } from "@/components/ui/primitives";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
import { logoutAction } from "@/server/actions/auth";
import { updateStudentDetails } from "@/server/actions/admin";
import { batchCreatePermissions } from "@/server/actions/permissions";
// Student/faculty pages load their data on hover/touch (intent), not on click
import { IntentLink as Link } from "@/components/ui/intent-link";
import { ResetPasswordButton } from "@/components/users/reset-password-button";
import {
  Users,
  Search,
  PencilLine,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Mail,
  GraduationCap,
  Building2,
  Shield,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
  /** Route prefix for student detail pages (HODs use their own area). */
  detailBasePath?: string;
}

export function FacultyStudentsClient({ user, detailBasePath = "/faculty/students" }: Props) {
  const router = useRouter();
  const isReady = useStoreReady();
  const studentsData = useAppStore((s) => s.data.students);
  const wardensData = useAppStore((s) => s.data.wardens);
  const updateData = useAppStore((s) => s.updateData);
  const refreshStore = useAppStore((s) => s.refresh);

  const [search, setSearch] = useState("");
  const [editingStudent, setEditingStudent] = useState<any>(null);
  // Hostel fields only apply to hostellers: locked and cleared for day scholars
  const [editType, setEditType] = useState<string>("DAY_SCHOLAR");
  const isHostellerEdit = editType === "HOSTELLER";
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Filter students by search term
  
  async function handleBatchGrant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedStudents.size === 0) return;
    setBatchLoading(true);
    setBatchError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await batchCreatePermissions(Array.from(selectedStudents), {
        type: formData.get("type") as "ENTRY" | "EXIT",
        purpose: formData.get("purpose") as string,
        destination: formData.get("destination") as string,
        expectedExit: formData.get("expectedExit") as string,
        expectedReturn: formData.get("expectedReturn") as string,
        contactNumber: formData.get("contactNumber") as string,
        remarks: formData.get("remarks") as string,
      });
      if (res?.error) {
        setBatchError(res.error);
        setBatchLoading(false);
        return;
      }
      setSuccess("Passes granted successfully for " + selectedStudents.size + " students!");
      setShowBatchModal(false);
      setSelectedStudents(new Set());
      refreshStore(true);
      
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setBatchError(actionErrorMessage(err, "Failed to grant passes"));
    } finally {
      setBatchLoading(false);
    }
  }

  function handleSelectStudent(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const newSet = new Set(selectedStudents);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      if (newSet.size >= 5) {
        setBatchError("You can only select up to 5 students at a time.");
        setTimeout(() => setBatchError(null), 3000);
        return;
      }
      newSet.add(id);
    }
    setSelectedStudents(newSet);
  }

  const filteredStudents = (studentsData || []).filter((s: any) => {
    const q = search.toLowerCase();
    return (
      s.profile.name.toLowerCase().includes(q) ||
      s.studentRoll.toLowerCase().includes(q) ||
      (s.department && s.department.toLowerCase().includes(q)) ||
      s.profile.email.toLowerCase().includes(q)
    );
  });

  if (!isReady || !studentsData) {
    return <DashboardSkeleton />;
  }

  const students = studentsData || [];
  const wardens = wardensData || [];

  const total = filteredStudents.length;
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleOpenEdit(student: any) {
    setEditingStudent(student);
    setEditType(student?.studentType || "DAY_SCHOLAR");
    setEditError(null);
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingStudent) return;
    setEditLoading(true);
    setEditError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await updateStudentDetails(editingStudent.id, {
        name: formData.get("name") as string,
        phone: formData.get("phone") as string,
        studentRoll: formData.get("studentRoll") as string,
        department: formData.get("department") as string,
        year: formData.get("year") ? Number(formData.get("year")) : null,
        section: formData.get("section") as string,
        studentType: formData.get("studentType") as any,
        wardenId: (formData.get("wardenId") as string) || null,
        roomNumber: (formData.get("roomNumber") as string) || null,
        hostelBlock: (formData.get("hostelBlock") as string) || null,
      });

      if (res?.error) {
        setEditError(res.error);
        setEditLoading(false);
        return;
      }

      setSuccess(`Student ${formData.get("name")} updated successfully!`);
      setEditingStudent(null);
      refreshStore(true); // Refresh Zustand store silently
      // Clear success message after 4s
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setEditError(actionErrorMessage(err, "Failed to update student"));
    } finally {
      setEditLoading(false);
    }
  }

  const initials = (name: string) =>
    name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();

  // Expanded details panel (same content for the phone list and the table)
  const renderDetails = (s: any) => (
    <div className="space-y-4">
      {/* Top Info Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-800/70">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex h-10 w-10 shrink-0 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center text-zinc-500">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-medium text-zinc-100 text-base break-words">{s.profile.name}</h4>
              {s.studentRoll && (
                <span className="px-2.5 py-0.5 rounded-full bg-orange-500/10 font-mono text-xs font-medium text-orange-400">
                  {s.studentRoll}
                </span>
              )}
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                s.studentType === "HOSTELLER"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-blue-500/10 text-blue-400"
              }`}>
                {s.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1 break-all">
              {s.profile.email} {s.profile.phone ? `• ${s.profile.phone}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Link
            href={`${detailBasePath}/${s.profile.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 px-4 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-950 hover:border-zinc-700 text-xs font-medium transition-colors"
          >
            <History className="h-3.5 w-3.5 text-zinc-500" />
            All Details & Past Activity
          </Link>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(s);
            }}
            className="h-10 sm:h-9"
          >
            <PencilLine className="h-3.5 w-3.5" />
            Edit Student Details
          </Button>
          {/* HODs can change their department students' passwords (faculty can't) */}
          {user.role === "FACULTY_ADMIN" && <ResetPasswordButton profileId={s.profile.id} name={s.profile.name} />}
        </div>
      </div>

      {/* 4 Detail Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Card 1: Roll & Academic Cohort */}
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1.5 min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" />
            Academic Cohort
          </span>
          <p className="text-sm font-medium text-zinc-200 break-words">
            {s.department || "General Department"}
          </p>
          <p className="text-xs text-zinc-500">
            {s.year ? `Year ${s.year}` : "Year N/A"}
            {s.section ? ` • Section ${s.section}` : ""}
          </p>
        </div>

        {/* Card 2: Residency & Accommodation */}
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1.5 min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Residency & Hostel
          </span>
          <p className="text-sm font-medium text-zinc-200">
            {s.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
          </p>
          <p className="text-xs text-zinc-500">
            {s.studentType === "HOSTELLER" ? (
              <>
                {s.hostelBlock ? `Block: ${s.hostelBlock}` : "Block not assigned"}
                {s.roomNumber ? ` • Room: ${s.roomNumber}` : ""}
              </>
            ) : (
              "Lives Off-Campus"
            )}
          </p>
        </div>

        {/* Card 3: Mentors & Supervision */}
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1.5 min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Faculty & Warden
          </span>
          <div className="text-xs space-y-1">
            <p className="text-zinc-300 break-words">
              <span className="text-zinc-500">Faculty: </span>
              <span className="font-medium text-zinc-200">
                {s.faculty?.profile?.name || "Unassigned"}
              </span>
            </p>
            {s.studentType === "HOSTELLER" && (
              <p className="text-zinc-300 break-words">
                <span className="text-zinc-500">Warden: </span>
                {s.warden?.profile?.name ? (
                  <span className="font-medium text-zinc-200">{s.warden.profile.name}</span>
                ) : (
                  <span className="text-zinc-500 italic">Unassigned</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Card 4: Movement & Account Status */}
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1.5 min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Campus & Account
          </span>
          <div className="flex items-center gap-2 pt-0.5">
            <Badge variant={s.profile.active ? "success" : "danger"}>
              {s.profile.active ? "Active" : "Disabled"}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );

  const fieldLabel = "block text-sm font-medium text-zinc-300";

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>My Students</span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 tracking-normal">
                {students.length} Total
              </span>
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              View and edit student information, department details, and academic cohorts.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none z-10" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search by name, roll no..."
              aria-label="Search students"
              className="h-10 rounded-full pl-10 pr-4 text-base sm:text-sm focus:ring-4 focus:ring-orange-500/10"
            />
          </div>
        </div>

        {/* Success alert */}
        {success && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-center gap-3 text-emerald-300 text-sm animate-scale-in">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Students list */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Phones: stacked rows */}
            <ul className={`sm:hidden ${dt.mobileList}`}>
              {paginatedStudents.map((s: any) => {
                const isExpanded = expandedStudentId === s.id;
                const toggle = () => setExpandedStudentId(isExpanded ? null : s.id);
                return (
                  <li key={s.id} className={isExpanded ? "bg-zinc-950/70" : ""}>
                    <button
                      type="button"
                      onClick={toggle}
                      aria-expanded={isExpanded}
                      className="w-full flex items-center gap-3 px-4 pt-3.5 pb-1 text-left"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-sm font-semibold">
                        {initials(s.profile.name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-zinc-100 truncate">{s.profile.name}</span>
                        <span className="block text-xs text-zinc-500 truncate tabular-nums">
                          {s.studentRoll}
                          {s.profile.phone ? ` · ${s.profile.phone}` : ""}
                        </span>
                        <span className="block text-xs text-zinc-500 truncate">{s.profile.email}</span>
                      </span>
                    </button>
                    <div className="flex items-center justify-between gap-2 pl-[72px] pr-3 pb-2.5">
                      <Badge variant={s.profile.active ? "success" : "danger"}>
                        {s.profile.active ? "Active" : "Disabled"}
                      </Badge>
                      <RowActions>
                        <IconAction
                          label="History"
                          icon={<History />}
                          href={`${detailBasePath}/${s.profile.id}`}
                        />
                        <IconAction
                          label="Edit Details"
                          icon={<PencilLine />}
                          tone="coral"
                          onClick={() => handleOpenEdit(s)}
                        />
                        <IconAction
                          label={isExpanded ? "Collapse details" : "View full details"}
                          icon={<ChevronDown className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />}
                          active={isExpanded}
                          onClick={toggle}
                        />
                      </RowActions>
                    </div>
                    {isExpanded && (
                      <div className="mx-3 mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 animate-fade-in">
                        {renderDetails(s)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Tablet and up: table */}
            <div className={`hidden sm:block ${dt.wrap}`}>
              <table className={dt.table}>
                <thead>
                  <tr>
                    <th className={dt.th}>Student</th>
                    <th className={dt.th}>Email</th>
                    <th className={dt.th}>Status</th>
                    <th className={dt.thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((s: any) => {
                    const isExpanded = expandedStudentId === s.id;
                    const toggle = () => setExpandedStudentId(isExpanded ? null : s.id);

                    return (
                      <React.Fragment key={s.id}>
                        <tr
                          onClick={toggle}
                          className={`${dt.trClickable} select-none ${isExpanded ? "[&>td]:bg-zinc-950/70" : ""}`}
                          title="Click row to view full details"
                        >
                          {/* Column 1: Student Name & Roll */}
                          <td className={dt.td}>
                            <PersonCell
                              name={s.profile.name}
                              chip={s.studentRoll ? <span className={dt.chip}>{s.studentRoll}</span> : undefined}
                              sub={
                                s.profile.phone ? (
                                  <span className="inline-flex items-center gap-1 tabular-nums">
                                    <Phone className="h-3 w-3" />
                                    {s.profile.phone}
                                  </span>
                                ) : undefined
                              }
                            />
                          </td>

                          {/* Column 2: Email */}
                          <td className={`${dt.tdMuted} break-all`}>{s.profile.email}</td>

                          {/* Column 3: Status */}
                          <td className={dt.td}>
                            <Badge variant={s.profile.active ? "success" : "danger"}>
                              {s.profile.active ? "Active" : "Disabled"}
                            </Badge>
                          </td>

                          {/* Column 4: Actions */}
                          <td className={dt.tdActions}>
                            <RowActions>
                              <IconAction
                                label="History"
                                icon={<History />}
                                href={`${detailBasePath}/${s.profile.id}`}
                              />
                              <IconAction
                                label="Edit Details"
                                icon={<PencilLine />}
                                tone="coral"
                                onClick={() => handleOpenEdit(s)}
                              />
                              <IconAction
                                label={isExpanded ? "Collapse details" : "View full details"}
                                icon={<ChevronDown className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />}
                                active={isExpanded}
                                onClick={toggle}
                              />
                            </RowActions>
                          </td>
                        </tr>

                        {/* Expanded Details Row */}
                        {isExpanded && (
                          <tr className="animate-fade-in">
                            <td colSpan={4} className="px-2 pb-3">
                              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
                                {renderDetails(s)}
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

            {filteredStudents.length === 0 && (
              <EmptyState
                icon={<Users className="h-6 w-6 text-zinc-500" />}
                title="No students found"
                description={search ? "Try adjusting your search filter." : "You do not currently have any assigned students."}
              />
            )}
          </CardContent>
        </Card>

        {/* Pagination (docked at the bottom of the screen) */}
        <PagerBar
          page={currentPage}
          pageSize={pageSize}
          total={total}
          onPageChange={setCurrentPage}
          itemLabel="students"
        />
      </div>

      {/* Edit Student Modal */}
      <Modal
        open={!!editingStudent}
        onClose={() => !editLoading && setEditingStudent(null)}
        title={editingStudent ? `Edit Student: ${editingStudent.profile.name}` : "Edit Student"}
        className="max-w-xl"
      >
        {editingStudent && (
          <form onSubmit={handleSaveEdit} className="space-y-5">
            {editError && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={fieldLabel}>Full Name</label>
                <Input
                  name="name"
                  defaultValue={editingStudent.profile.name}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className={fieldLabel}>Phone Number</label>
                <Input
                  name="phone"
                  defaultValue={editingStudent.profile.phone || ""}
                  placeholder="+91-9876543210"
                />
              </div>

              <div className="space-y-1.5">
                <label className={fieldLabel}>Roll Number</label>
                <Input
                  name="studentRoll"
                  defaultValue={editingStudent.studentRoll}
                  required
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className={fieldLabel}>Department</label>
                <DepartmentSelect name="department" defaultValue={editingStudent.department || ""} />
              </div>

              <div className="space-y-1.5">
                <label className={fieldLabel}>Year</label>
                <Input
                  name="year"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={editingStudent.year ?? ""}
                />
              </div>

              <div className="space-y-1.5">
                <label className={fieldLabel}>Section</label>
                <Input
                  name="section"
                  defaultValue={editingStudent.section ?? ""}
                />
              </div>

              <div className="space-y-1.5">
                <label className={fieldLabel}>Student Type</label>
                <Select
                  name="studentType"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="h-12"
                >
                  <option value="DAY_SCHOLAR">Day Scholar</option>
                  <option value="HOSTELLER">Hosteller</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className={fieldLabel}>Assigned Warden (Hostellers)</label>
                <Select
                  key={`warden-${editType}`}
                  name="wardenId"
                  defaultValue={isHostellerEdit ? editingStudent.wardenId || "" : ""}
                  disabled={!isHostellerEdit}
                  className="h-12 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <label className={fieldLabel}>Hostel Block</label>
                <Input
                  key={`block-${editType}`}
                  name="hostelBlock"
                  defaultValue={isHostellerEdit ? editingStudent.hostelBlock || "" : ""}
                  disabled={!isHostellerEdit}
                  placeholder={isHostellerEdit ? "e.g. Block A" : "Hostellers only"}
                  className="disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className={fieldLabel}>Room Number</label>
                <Input
                  key={`room-${editType}`}
                  name="roomNumber"
                  defaultValue={isHostellerEdit ? editingStudent.roomNumber || "" : ""}
                  disabled={!isHostellerEdit}
                  placeholder={isHostellerEdit ? "e.g. 204" : "Hostellers only"}
                  className="disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-4 border-t border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingStudent(null)}
                disabled={editLoading}
                className="h-12 w-full sm:h-11 sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={editLoading}
                className="h-12 w-full sm:h-11 sm:w-auto"
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>
      {/* Batch Grant Modal */}
      <Modal
        open={showBatchModal}
        onClose={() => !batchLoading && setShowBatchModal(false)}
        title={`Grant Pass (${selectedStudents.size} Students)`}
        className="max-w-md"
      >
        <form onSubmit={handleBatchGrant} className="space-y-4">
          {batchError && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{batchError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className={fieldLabel}>Pass Type</label>
            <Select name="type" required className="h-12">
              <option value="EXIT">Exit Pass</option>
              <option value="ENTRY">Entry Pass</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className={fieldLabel}>Purpose</label>
            <Input name="purpose" required placeholder="E.g., Medical visit, Family event" />
          </div>

          <div className="space-y-1.5">
            <label className={fieldLabel}>Destination</label>
            <Input name="destination" placeholder="Optional" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 min-w-0">
              <label className={fieldLabel}>Expected Exit</label>
              <Input name="expectedExit" type="datetime-local" className="[color-scheme:light]" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <label className={fieldLabel}>Expected Return</label>
              <Input name="expectedReturn" type="datetime-local" className="[color-scheme:light]" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={fieldLabel}>Contact Number</label>
            <Input name="contactNumber" required placeholder="10-digit number" />
          </div>

          <div className="space-y-1.5">
            <label className={fieldLabel}>Remarks</label>
            <Input name="remarks" placeholder="Optional notes" />
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBatchModal(false)}
              className="h-12 sm:h-11 sm:flex-1"
              disabled={batchLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-12 sm:h-11 sm:flex-1"
              disabled={batchLoading}
            >
              {batchLoading ? "Granting..." : "Grant Pass"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

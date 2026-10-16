"use client";
import { actionErrorMessage } from "@/lib/deployment";
import { ResetPasswordButton } from "@/components/users/reset-password-button";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, Select, Badge, EmptyState } from "@/components/ui/primitives";
import { logoutAction } from "@/server/actions/auth";
import { updateStudentDetails } from "@/server/actions/admin";
import { batchCreatePermissions } from "@/server/actions/permissions";
// Student/faculty pages load their data on hover/touch (intent), not on click
import { IntentLink as Link } from "@/components/ui/intent-link";
import {
  Users,
  Search,
  Pencil,
  PencilLine,
  AlertTriangle,
  CheckCircle2,
  Phone,
  GraduationCap,
  Building2,
  Shield,
  ChevronDown,
  History,
} from "lucide-react";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
import { useAppStore } from "@/stores/app-store";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useStoreReady } from "@/components/providers/store-hydrator";

interface Props {
  user: { name: string; email: string; role: string; profileId: string };
}

export function WardenStudentsClient({ user }: Props) {
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
      (s.hostelBlock && s.hostelBlock.toLowerCase().includes(q)) ||
      s.profile.email.toLowerCase().includes(q)
    );
  });

  if (!isReady || !studentsData) {
    return <DashboardSkeleton />;
  }

  const wardens = wardensData || [];
  const students = studentsData || [];

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
      refreshStore(true); // Silent update
      // Clear success message after 4s
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setEditError(actionErrorMessage(err, "Failed to update student"));
    } finally {
      setEditLoading(false);
    }
  }

  // Expanded student details (shared by the phone list and the table; display only)
  const renderDetails = (s: any) => (
    <div className="space-y-4">
      {/* Top Info Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex h-10 w-10 shrink-0 rounded-2xl bg-orange-500/10 items-center justify-center text-orange-400">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-medium text-zinc-100 text-base">{s.profile.name}</h4>
              {s.studentRoll && (
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  {s.studentRoll}
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                s.studentType === "HOSTELLER"
                  ? "bg-orange-500/10 text-orange-400"
                  : "bg-sky-500/10 text-sky-400"
              }`}>
                {s.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
              </span>

            </div>
            <p className="text-xs text-zinc-500 mt-0.5 break-all">
              {s.profile.email} {s.profile.phone ? `• ${s.profile.phone}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Link
            href={`/warden/students/${s.profile.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3.5 text-xs font-medium text-zinc-200 hover:bg-zinc-950 hover:border-zinc-700 transition-colors"
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
            <Pencil className="h-3.5 w-3.5" />
            Edit Student Details
          </Button>
          <ResetPasswordButton profileId={s.profile.id} name={s.profile.name} />
        </div>
      </div>

      {/* 4 Detail Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Card 1: Roll & Academic Cohort */}
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" />
            Academic Cohort
          </span>
          <p className="text-sm font-medium text-zinc-100">
            {s.hostelBlock || "General Department"}
          </p>
          <p className="text-xs text-zinc-500">
            {s.year ? `Year ${s.year}` : "Year N/A"}
            {s.section ? ` • Section ${s.section}` : ""}
          </p>
        </div>

        {/* Card 2: Residency & Accommodation */}
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Residency & Hostel
          </span>
          <p className="text-sm font-medium text-zinc-100">
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
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Warden
          </span>
          <div className="text-xs space-y-1">
            <p className="text-zinc-300">
              <span className="text-zinc-500">Warden: </span>
              <span className="font-medium text-zinc-100">
                {s.warden?.profile?.name || user.name}
              </span>
            </p>
            {s.studentType === "HOSTELLER" && (
              <p className="text-zinc-300">
                <span className="text-zinc-500">Warden: </span>
                {s.warden?.profile?.name ? (
                  <span className="font-medium text-zinc-100">{s.warden.profile.name}</span>
                ) : (
                  <span className="text-zinc-500 italic">Unassigned</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Card 4: Movement & Account Status */}
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-1.5">
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

  const initials = (name: string) => name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>My Students</span>
              <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
                {students.length} Total
              </span>
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              View and edit student information, hostel block details, and academic cohorts.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 z-10" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search by name, roll no..."
              aria-label="Search students"
              className="h-10 rounded-full pl-10 pr-4 focus:ring-4 focus:ring-orange-500/10"
            />
          </div>
        </div>

        {/* Success alert */}
        {success && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-center gap-3 text-emerald-300 text-sm animate-scale-in">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Students list */}
        <Card className="overflow-hidden">
          <CardContent className="p-0 sm:p-0">
            {/* Phones: stacked rows (tap to expand) */}
            <ul className={`sm:hidden ${dt.mobileList}`}>
              {paginatedStudents.map((s: any) => {
                const isExpanded = expandedStudentId === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedStudentId(isExpanded ? null : s.id)}
                      aria-expanded={isExpanded}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${isExpanded ? "bg-zinc-950" : "hover:bg-zinc-950/70"}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-[13px] font-semibold">
                        {initials(s.profile.name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-zinc-100 truncate">
                          {s.profile.name}
                          {s.studentRoll && <span className="text-zinc-500 font-normal"> · {s.studentRoll}</span>}
                        </span>
                        <span className="block text-xs text-zinc-500 truncate">{s.profile.phone || s.profile.email}</span>
                      </span>
                      <Badge variant={s.profile.active ? "success" : "danger"} className="shrink-0">
                        {s.profile.active ? "Active" : "Disabled"}
                      </Badge>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${isExpanded ? "rotate-180 text-orange-400" : ""}`} />
                    </button>
                    {isExpanded && (
                      <div className="bg-zinc-950 px-4 pb-4 pt-1 animate-fade-in">
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
                    const openBg = isExpanded ? " bg-zinc-950/70" : "";

                    return (
                      <React.Fragment key={s.id}>
                        <tr
                          onClick={() => setExpandedStudentId(isExpanded ? null : s.id)}
                          className={`${dt.trClickable} select-none`}
                          title="Click row to view full details"
                        >
                          {/* Student name, roll & phone */}
                          <td className={dt.td + openBg}>
                            <PersonCell
                              name={s.profile.name}
                              chip={s.studentRoll ? <span className={`shrink-0 ${dt.chip}`}>{s.studentRoll}</span> : undefined}
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

                          {/* Email */}
                          <td className={dt.tdMuted + openBg}>
                            <span className="break-all">{s.profile.email}</span>
                          </td>

                          {/* Status */}
                          <td className={dt.td + openBg}>
                            <Badge variant={s.profile.active ? "success" : "danger"}>
                              {s.profile.active ? "Active" : "Disabled"}
                            </Badge>
                          </td>

                          {/* Actions */}
                          <td className={dt.tdActions + openBg}>
                            <RowActions>
                              <IconAction
                                label="History"
                                icon={<History />}
                                href={`/warden/students/${s.profile.id}`}
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
                                onClick={() => setExpandedStudentId(isExpanded ? null : s.id)}
                              />
                            </RowActions>
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr className="animate-fade-in">
                            <td colSpan={4} className="px-2 pb-3">
                              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
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
                icon={<Users className="h-8 w-8" />}
                title="No students found"
                description={search ? "Try adjusting your search filter." : "You do not currently have any assigned students."}
              />
            )}
          </CardContent>
        </Card>

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
              <Input
                label="Full Name"
                name="name"
                defaultValue={editingStudent.profile.name}
                required
              />

              <Input
                label="Phone Number"
                name="phone"
                defaultValue={editingStudent.profile.phone || ""}
                placeholder="+91-9876543210"
              />

              <Input
                label="Roll Number"
                name="studentRoll"
                defaultValue={editingStudent.studentRoll}
                required
                className="font-mono"
              />

              <Input
                label="Year"
                name="year"
                type="number"
                min={1}
                max={5}
                defaultValue={editingStudent.year ?? ""}
              />

              <Input
                label="Section"
                name="section"
                defaultValue={editingStudent.section ?? ""}
              />

              <Select
                label="Student Type"
                name="studentType"
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="h-12"
              >
                <option value="DAY_SCHOLAR">Day Scholar</option>
                <option value="HOSTELLER">Hosteller</option>
              </Select>

              <Select
                label="Assigned Warden (Hostellers)"
                key={`warden-${editType}`}
                id="assigned-warden"
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

              <Input
                key={`block-${editType}`}
                label="Hostel Block"
                name="hostelBlock"
                defaultValue={isHostellerEdit ? editingStudent.hostelBlock || "" : ""}
                disabled={!isHostellerEdit}
                placeholder={isHostellerEdit ? "e.g. Block A" : "Hostellers only"}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
              />

              <Input
                key={`room-${editType}`}
                label="Room Number"
                name="roomNumber"
                defaultValue={isHostellerEdit ? editingStudent.roomNumber || "" : ""}
                disabled={!isHostellerEdit}
                placeholder={isHostellerEdit ? "e.g. 204" : "Hostellers only"}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-zinc-800">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setEditingStudent(null)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                loading={editLoading}
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

          <Select label="Pass Type" name="type" required className="h-12">
            <option value="EXIT">Exit Pass</option>
            <option value="ENTRY">Entry Pass</option>
          </Select>

          <Input label="Purpose" name="purpose" required placeholder="E.g., Medical visit, Family event" />

          <Input label="Destination" name="destination" placeholder="Optional" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Expected Exit" name="expectedExit" type="datetime-local" className="[color-scheme:light]" />
            <Input label="Expected Return" name="expectedReturn" type="datetime-local" className="[color-scheme:light]" />
          </div>

          <Input label="Contact Number" name="contactNumber" required placeholder="10-digit number" />

          <Input label="Remarks" name="remarks" placeholder="Optional notes" />

          <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBatchModal(false)}
              className="w-full sm:flex-1"
              disabled={batchLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full sm:flex-1"
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

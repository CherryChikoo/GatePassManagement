"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, Select, Badge, EmptyState } from "@/components/ui/primitives";
import { logoutAction } from "@/server/actions/auth";
import { updateStudentDetails } from "@/server/actions/admin";
import { batchCreatePermissions } from "@/server/actions/permissions";
import Link from "next/link";
import {
  Users,
  Search,
  Pencil,
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
      setBatchError(err.message || "Failed to grant passes");
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
      setEditError(err.message || "Failed to update student");
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
              <span>My Students</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {students.length} Total
              </span>
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              View and edit student information, hostelBlock details, and academic cohorts.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search by name, roll no..."
              className="pl-9 bg-zinc-900/60 border-zinc-800 text-sm"
            />
          </div>
        </div>

        {/* Success alert */}
        {success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3 text-emerald-400 text-sm animate-scale-in">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Students Table */}
        <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/40">
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Student</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Email</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Status</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {paginatedStudents.map((s: any) => {
                    const isExpanded = expandedStudentId === s.id;

                    return (
                      <React.Fragment key={s.id}>
                        <tr 
                          onClick={() => setExpandedStudentId(isExpanded ? null : s.id)}
                          className={`table-row-hover transition-colors cursor-pointer select-none ${
                            isExpanded ? "bg-zinc-850/60" : ""
                          }`}
                          title="Click row to view full details"
                        >
                          {/* Column 1: Student Name & Roll */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-semibold text-xs shrink-0">
                                {s.profile.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-zinc-100 hover:text-emerald-400 transition-colors">{s.profile.name}</p>
                                  {s.studentRoll && (
                                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                                      {s.studentRoll}
                                    </span>
                                  )}
                                </div>
                                {s.profile.phone && (
                                  <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                                    <Phone className="h-3 w-3 text-zinc-500" />
                                    {s.profile.phone}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Column 2: Email */}
                          <td className="px-5 py-3.5">
                            <p className="text-xs text-zinc-300 font-mono">{s.profile.email}</p>
                          </td>

                          {/* Column 3: Status */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <Badge variant={s.profile.active ? "success" : "danger"}>
                                {s.profile.active ? "Active" : "Disabled"}
                              </Badge>

                            </div>
                          </td>

                          {/* Column 4: Actions */}
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/warden/students/${s.profile.id}`}
                                className="inline-flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 px-2.5 h-8 text-xs font-medium rounded-md transition-colors"
                                title="View full student details, permissions & activity"
                              >
                                <History className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                                History
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(s)}
                                className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 px-3 h-8 text-xs font-medium"
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit Details
                              </Button>
                              <button
                                type="button"
                                onClick={() => setExpandedStudentId(isExpanded ? null : s.id)}
                                className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors ml-1"
                                title={isExpanded ? "Collapse details" : "Click to view full details"}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${
                                  isExpanded ? "rotate-180 text-orange-400" : ""
                                }`} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Details Row */}
                        {isExpanded && (
                          <tr className="bg-zinc-950/80 border-b border-zinc-800/80 animate-fade-in">
                            <td colSpan={4} className="p-5 bg-gradient-to-b from-zinc-900/70 to-zinc-950/95 border-l-2 border-l-emerald-500">
                              <div className="space-y-4">
                                {/* Top Info Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
                                  <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                                      <GraduationCap className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="font-bold text-zinc-100 text-base">{s.profile.name}</h4>
                                        {s.studentRoll && (
                                          <span className="px-2 py-0.5 rounded bg-orange-500/15 border border-orange-500/30 font-mono text-xs font-bold text-orange-400">
                                            {s.studentRoll}
                                          </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                          s.studentType === "HOSTELLER"
                                            ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                            : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                                        }`}>
                                          {s.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
                                        </span>

                                      </div>
                                      <p className="text-xs text-zinc-400 mt-0.5">
                                        {s.profile.email} {s.profile.phone ? `• ${s.profile.phone}` : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      href={`/warden/students/${s.profile.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 text-xs font-semibold shadow-sm transition-all"
                                    >
                                      <History className="h-3.5 w-3.5 text-emerald-400" />
                                      All Details & Past Activity
                                    </Link>
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEdit(s);
                                      }}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 shadow-none"
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
                                      <GraduationCap className="h-3.5 w-3.5 text-emerald-400" />
                                      Academic Cohort
                                    </span>
                                    <p className="text-sm font-semibold text-zinc-200">
                                      {s.hostelBlock || "General Department"}
                                    </p>
                                    <p className="text-xs text-zinc-400">
                                      {s.year ? `Year ${s.year}` : "Year N/A"}
                                      {s.section ? ` • Section ${s.section}` : ""}
                                    </p>
                                  </div>

                                  {/* Card 2: Residency & Accommodation */}
                                  <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                      <Building2 className="h-3.5 w-3.5 text-purple-400" />
                                      Residency & Hostel
                                    </span>
                                    <p className="text-sm font-semibold text-zinc-200">
                                      {s.studentType === "HOSTELLER" ? "Hosteller" : "Day Scholar"}
                                    </p>
                                    <p className="text-xs text-zinc-400">
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
                                  <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                      <Users className="h-3.5 w-3.5 text-blue-400" />
                                      Warden & Warden
                                    </span>
                                    <div className="text-xs space-y-1">
                                      <p className="text-zinc-300">
                                        <span className="text-zinc-500">Warden: </span>
                                        <span className="font-medium text-emerald-300">
                                          {s.warden?.profile?.name || user.name}
                                        </span>
                                      </p>
                                      {s.studentType === "HOSTELLER" && (
                                        <p className="text-zinc-300">
                                          <span className="text-zinc-500">Warden: </span>
                                          {s.warden?.profile?.name ? (
                                            <span className="font-medium text-amber-300">{s.warden.profile.name}</span>
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
                                      <Shield className="h-3.5 w-3.5 text-orange-400" />
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
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {total > pageSize && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800/60 px-4 sm:px-6 py-4 bg-zinc-950/30">
                <p className="text-xs sm:text-sm text-zinc-400">
                  Showing <span className="font-medium text-zinc-200">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-medium text-zinc-200">{Math.min(currentPage * pageSize, total)}</span> of <span className="font-medium text-zinc-200">{total}</span> students
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 text-xs"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 text-xs"
                    onClick={() => setCurrentPage(Math.min(Math.ceil(total / pageSize), currentPage + 1))}
                    disabled={currentPage >= Math.ceil(total / pageSize)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {filteredStudents.length === 0 && (
              <div className="py-12 text-center">
                <EmptyState
                  icon={<Users className="h-8 w-8 text-zinc-500" />}
                  title="No students found"
                  description={search ? "Try adjusting your search filter." : "You do not currently have any assigned students."}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Student Modal */}
      <Modal
        open={!!editingStudent}
        onClose={() => !editLoading && setEditingStudent(null)}
        title={editingStudent ? `Edit Student: ${editingStudent.profile.name}` : "Edit Student"}
        className="max-w-xl"
      >
        {editingStudent && (
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
                  defaultValue={editingStudent.profile.name}
                  required
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Phone Number</label>
                <Input
                  name="phone"
                  defaultValue={editingStudent.profile.phone || ""}
                  placeholder="+91-9876543210"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Roll Number</label>
                <Input
                  name="studentRoll"
                  defaultValue={editingStudent.studentRoll}
                  required
                  className="bg-zinc-900 border-zinc-800 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Department</label>
                <Input
                  name="hostelBlock"
                  defaultValue={editingStudent.hostelBlock || ""}
                  placeholder="e.g. Computer Science"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Year</label>
                <Input
                  name="year"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={editingStudent.year || 1}
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Section</label>
                <Input
                  name="section"
                  defaultValue={editingStudent.section || "A"}
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Student Type</label>
                <Select
                  name="studentType"
                  defaultValue={editingStudent.studentType || "DAY_SCHOLAR"}
                  className="bg-zinc-900 border-zinc-800"
                >
                  <option value="DAY_SCHOLAR">Day Scholar</option>
                  <option value="HOSTELLER">Hosteller</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Assigned Warden (Hostellers)</label>
                <Select
                  name="wardenId"
                  defaultValue={editingStudent.wardenId || ""}
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
                  defaultValue={editingStudent.hostelBlock || ""}
                  placeholder="e.g. Block A"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Room Number</label>
                <Input
                  name="roomNumber"
                  defaultValue={editingStudent.roomNumber || ""}
                  placeholder="e.g. 204"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingStudent(null)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={editLoading}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium"
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>
      {/* Pagination Controls */}
      {/* Batch Grant Modal */}
      <Modal
        open={showBatchModal}
        onClose={() => !batchLoading && setShowBatchModal(false)}
        title={`Grant Pass (${selectedStudents.size} Students)`}
        className="max-w-md"
      >
        <form onSubmit={handleBatchGrant} className="space-y-4">
          {batchError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{batchError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Pass Type</label>
            <Select name="type" required className="bg-zinc-900 border-zinc-800">
              <option value="EXIT">Exit Pass</option>
              <option value="ENTRY">Entry Pass</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Purpose</label>
            <Input name="purpose" required placeholder="E.g., Medical visit, Family event" className="bg-zinc-900 border-zinc-800" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Destination</label>
            <Input name="destination" placeholder="Optional" className="bg-zinc-900 border-zinc-800" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Expected Exit</label>
              <Input name="expectedExit" type="datetime-local" className="bg-zinc-900 border-zinc-800" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Expected Return</label>
              <Input name="expectedReturn" type="datetime-local" className="bg-zinc-900 border-zinc-800" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Contact Number</label>
            <Input name="contactNumber" required placeholder="10-digit number" className="bg-zinc-900 border-zinc-800" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Remarks</label>
            <Input name="remarks" placeholder="Optional notes" className="bg-zinc-900 border-zinc-800" />
          </div>

          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBatchModal(false)}
              className="flex-1 bg-transparent border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              disabled={batchLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-black border-none"
              disabled={batchLoading}
            >
              {batchLoading ? "Granting..." : "Grant Pass"}
            </Button>
          </div>
        </form>
      </Modal>

      {total > pageSize && (
        <div className="fixed bottom-0 left-0 lg:left-72 right-0 z-50 flex justify-between items-center py-3 px-4 lg:px-8 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">
          <p className="text-sm text-zinc-400 font-medium">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} students
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              Page {currentPage} of {Math.ceil(total / pageSize)}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="h-8 px-3"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage * pageSize >= total}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="h-8 px-3"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add bottom padding to account for fixed pagination */}
      {total > pageSize && <div className="h-20"></div>}

    
    </>
  );
}

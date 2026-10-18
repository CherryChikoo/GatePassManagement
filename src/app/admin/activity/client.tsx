"use client";

import { DateField } from "@/components/ui/date-field";
import { LoadingPill } from "@/components/ui/loading-pill";
import React, { useState, useEffect } from "react";
// Student/faculty pages load their data on hover/touch (intent), not on click
import { IntentLink as Link } from "@/components/ui/intent-link";
import { StatCard, StatusBadge, Badge, EmptyState, Modal, Select } from "@/components/ui/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDate, getRelativeTime } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { getActivityData } from "@/server/actions/admin";
import { registerOutsider, markOutsiderExited } from "@/server/actions/outsiders";
import { istDateString } from "@/lib/time/ist";
import { getExitPhotoUrl, uploadOutsiderPhoto } from "@/lib/storage/image-upload";
import { compressPhoto } from "@/lib/images/compress-photo";
import {
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  History,
  DoorOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  UserCheck,
  Building2,
  Search,
  Plus,
  Phone,
  User,
  Shield,
  Car,
  AlertCircle,
  ExternalLink,
  Calendar,
  ClipboardCheck,
  Layers,
  LogOut,
} from "lucide-react";
import { PagerBar } from "@/components/ui/pager-bar";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";

interface Props {
  user: { name: string; email: string; role: string };
  data: {
    stats: {
      entriesToday: number;
      exitsToday: number;
      totalMovements: number;
    };
    recentEntries: any[];
    recentExits: any[];
    recentPermissions?: any[];
  };
}

interface OutsiderRecord {
  id: string;
  name: string;
  phone: string;
  category: "PARENT" | "RELATIVE" | "GUEST" | "VENDOR";
  purpose: string;
  visitingStudent: string;
  gate: string;
  vehicleNumber?: string;
  entryTime: string;
  exitTime?: string;
  status: "INSIDE" | "EXITED";
}



export function ActivityClient({ user, data: initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [date, setDate] = useState(() => istDateString());
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function reloadData(forDate: string) {
    setLoading(true);
    try {
      const newData = await getActivityData(forDate);
      setData(newData);
    } catch {
      setActionError("Failed to load activity data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDateChange(newDate: string) {
    setDate(newDate);
    await reloadData(newDate);
  }

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(`${dateStr}T00:00:00+05:30`).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  };
  const isToday = date === istDateString();
  
  const stats = data?.stats || {
    entriesToday: 0,
    exitsToday: 0,
    totalMovements: 0,
    outsidersOnCampus: 0,
  };

  const recentEntries: any[] = Array.isArray(data?.recentEntries)
    ? data.recentEntries
    : Array.isArray((data as any)?.recentGateLogs)
    ? (data as any).recentGateLogs.filter((m: any) => m.type === "ENTRY")
    : [];

  const recentExits: any[] = Array.isArray(data?.recentExits)
    ? data.recentExits
    : Array.isArray((data as any)?.recentGateLogs)
    ? (data as any).recentGateLogs.filter((m: any) => m.type === "EXIT")
    : [];

  const recentPermissions: any[] = data?.recentPermissions || [];

  const [activeTab, setActiveTab] = useState<"entries" | "exits" | "outsiders">("entries");
  
  // Search states
  const [entrySearch, setEntrySearch] = useState("");
  const [exitSearch, setExitSearch] = useState("");
  const [outsiderSearch, setOutsiderSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const path = selectedRecord?.photoUrl || selectedRecord?.imagePath;
    if (path) {
      if (path.startsWith("data:") || path.startsWith("http")) {
        setSignedPhotoUrl(path);
      } else {
        getExitPhotoUrl(path).then(url => {
          setSignedPhotoUrl(url);
        });
      }
    } else {
      setSignedPhotoUrl(null);
    }
  }, [selectedRecord]);
  const [outsiderCategory, setOutsiderCategory] = useState("ALL");

  // Outsiders state
  const [outsiders, setOutsiders] = useState<OutsiderRecord[]>((data as any).outsiders || []);

  useEffect(() => {
    if ((data as any).outsiders) {
      setOutsiders((data as any).outsiders);
    }
  }, [data]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Filtered Entries (server already filtered by date)
  const filteredEntries = (recentEntries || []).filter((m) => {
    const q = entrySearch.trim().toLowerCase();
    return (
      !q ||
      m.student?.profile?.name?.toLowerCase().includes(q) ||
      m.student?.studentRoll?.toLowerCase().includes(q) ||
      m.gate?.name?.toLowerCase().includes(q) ||
      m.permission?.purpose?.toLowerCase().includes(q)
    );
  });

  // Filtered Exits (server already filtered by date)
  const filteredExits = (recentExits || []).filter((m) => {
    const q = exitSearch.trim().toLowerCase();
    return (
      !q ||
      m.student?.profile?.name?.toLowerCase().includes(q) ||
      m.student?.studentRoll?.toLowerCase().includes(q) ||
      m.gate?.name?.toLowerCase().includes(q) ||
      m.permission?.purpose?.toLowerCase().includes(q) ||
      m.permission?.destination?.toLowerCase().includes(q)
    );
  });

  // Filtered Outsiders
  const filteredOutsiders = (outsiders || []).filter((o) => {
    const matchesCat = outsiderCategory === "ALL" ? true : o.category === outsiderCategory;
    const q = outsiderSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      o.name.toLowerCase().includes(q) ||
      o.visitingStudent.toLowerCase().includes(q) ||
      o.purpose.toLowerCase().includes(q) ||
      o.phone.toLowerCase().includes(q);

    return matchesCat && matchesSearch;
  });

  // 10 rows per page; back to page 1 whenever the tab, a search, the category or the date changes
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const pageKey = `${activeTab}|${entrySearch}|${exitSearch}|${outsiderSearch}|${outsiderCategory}|${date}`;
  const [lastPageKey, setLastPageKey] = useState(pageKey);
  if (lastPageKey !== pageKey) {
    setLastPageKey(pageKey);
    setPage(1);
  }
  const pageSlice = <T,>(list: T[]): T[] => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Count active outsiders inside campus for this date
  const activeOutsidersCount = (outsiders || []).filter((o) => o.status === "INSIDE").length;

  // Add new outsider (persisted)
  const [savingOutsider, setSavingOutsider] = useState(false);
  // The visitor's photo is mandatory (compressed in the browser before upload)
  const [visitorPhoto, setVisitorPhoto] = useState<string | null>(null);
  // Visitor on foot: no vehicle number needed
  const [visitorOnFoot, setVisitorOnFoot] = useState(false);
  async function handleVisitorPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setVisitorPhoto(await compressPhoto(file));
    } catch (err: any) {
      setActionError(err?.message || "Could not read the photo");
    }
  }
  async function handleAddOutsider(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingOutsider) return;
    const formData = new FormData(e.currentTarget);
    if (!visitorPhoto) {
      setActionError("Take the visitor's photo before registering");
      return;
    }
    setSavingOutsider(true);
    setActionError(null);
    try {
      const upload = await uploadOutsiderPhoto(visitorPhoto, (formData.get("name") as string) || "visitor");
      if (upload.error || !upload.path) {
        setActionError(`Photo upload failed: ${upload.error || "unknown error"}`);
        return;
      }
      const res = await registerOutsider({
        photoUrl: upload.path,
        name: formData.get("name") as string,
        phone: formData.get("phone") as string,
        category: (formData.get("category") as string) || "GUEST",
        purpose: formData.get("purpose") as string,
        visitingStudent: (formData.get("visitingStudent") as string) || "",
        gate: (formData.get("gate") as string) || "",
        vehicleNumber: visitorOnFoot ? "On foot" : ((formData.get("vehicleNumber") as string) || "").trim().toUpperCase(),
      });
      if (!res?.success) {
        setActionError(res?.error || "Failed to register visitor.");
        return;
      }
      setShowAddModal(false);
      setVisitorPhoto(null);
      setVisitorOnFoot(false);
      await reloadData(date);
    } catch {
      setActionError("Failed to register visitor.");
    } finally {
      setSavingOutsider(false);
    }
  }

  // Mark outsider as exited (persisted)
  async function handleMarkExited(id: string) {
    setActionError(null);
    try {
      const res = await markOutsiderExited(id);
      if (!res?.success) {
        setActionError(res?.error || "Failed to mark visitor as exited.");
        return;
      }
      await reloadData(date);
    } catch {
      setActionError("Failed to mark visitor as exited.");
    }
  }

  // ── Shared presentational bits (markup only) ──
  const searchInputClass =
    "h-10 rounded-full pl-10 pr-4 text-sm focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500/50";
  const tabClass = (active: boolean) =>
    `inline-flex h-10 sm:h-9 items-center gap-2 px-4 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
      active ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
    }`;
  const countChipClass = (active: boolean) =>
    `rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${active ? "bg-orange-500/10 text-orange-400" : "bg-zinc-800/70 text-zinc-500"}`;

  const initials = (m: any) => m.student?.profile?.name?.slice(0, 2).toUpperCase() || "—";

  const personLink = (m: any) => (
    <Link
      href={`/admin/users/${m.student?.profileId || m.student?.profile?.id}`}
      className="font-medium text-zinc-100 hover:text-orange-400 transition-colors inline-flex items-center gap-1 min-w-0"
    >
      <span className="truncate">{m.student?.profile?.name || "Unknown person"}</span>
      <ExternalLink className="h-3 w-3 text-zinc-500 shrink-0" />
    </Link>
  );

  const facultyTag = (
    <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 shrink-0">
      Faculty
    </span>
  );

  // Stacked row-card for phones (same data as the table row)
  const renderMovementCard = (m: any, kind: "entry" | "exit") => (
    <li key={m.id} className="px-4 py-3.5 hover:bg-zinc-950/70 transition-colors cursor-pointer" onClick={() => setSelectedRecord(m)}>
      <div className="flex gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 text-sm font-semibold">
          {initials(m)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 text-sm">
            {personLink(m)}
            {m.student?.isFaculty && facultyTag}
          </div>
          <p className="text-xs text-zinc-500 truncate">
            {m.student?.studentRoll && <span className="font-mono">{m.student.studentRoll}</span>}
            {m.student?.studentRoll && (m.student?.profile?.email || m.student?.profile?.phone) ? " · " : ""}
            {m.student?.profile?.email || m.student?.profile?.phone}
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-zinc-300 min-w-0">
            <MapPin className="h-3 w-3 text-zinc-500 shrink-0" />
            <span className="truncate">
              {m.gate?.name || "Main Gate"}
              {m.gate?.location ? <span className="text-zinc-500"> · {m.gate.location}</span> : null}
            </span>
          </p>
          {m.permission ? (
            <p className="mt-0.5 text-xs text-zinc-500 truncate">
              {m.permission.purpose}
              {m.permission.destination ? ` · Destination: ${m.permission.destination}` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-500 italic">{kind === "entry" ? "Direct Entry Scan" : "Direct Exit Scan"}</p>
          )}
          <p className="mt-1 text-[11px] text-zinc-500">
            <span className="text-zinc-300">{formatDateTime(m.createdAt)}</span> · {getRelativeTime(m.createdAt)}
          </p>
        </div>
      </div>
    </li>
  );

  // Desktop/tablet table row
  const renderMovementRow = (m: any, kind: "entry" | "exit") => (
    <tr key={m.id} className={dt.trClickable} onClick={() => setSelectedRecord(m)}>
      {/* Student (same look as PersonCell, with the name linking to the profile) */}
      <td className={dt.td}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-[13px] font-semibold text-orange-400">
            {initials(m)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {personLink(m)}
              {m.student?.isFaculty && facultyTag}
              {m.student?.studentRoll && <span className={dt.chip}>{m.student.studentRoll}</span>}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {m.student?.profile?.email || m.student?.profile?.phone}
            </p>
          </div>
        </div>
      </td>

      {/* Gate */}
      <td className={dt.td}>
        <p className="font-medium text-zinc-200 truncate">{m.gate?.name || "Main Gate"}</p>
        {m.gate?.location && (
          <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{m.gate.location}</span>
          </p>
        )}
      </td>

      {/* Pass / purpose */}
      <td className={`${dt.td} text-xs`}>
        {m.permission ? (
          <div className="truncate">
            <p className="font-medium text-zinc-200 truncate">{m.permission.purpose}</p>
            {m.permission.destination && (
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                Destination: {m.permission.destination}
              </p>
            )}
          </div>
        ) : (
          <span className="text-zinc-500 italic">{kind === "entry" ? "Direct Entry Scan" : "Direct Exit Scan"}</span>
        )}
      </td>

      {/* Timestamp */}
      <td className={`${dt.td} text-right`}>
        <span className="text-sm text-zinc-200 whitespace-nowrap tabular-nums">{formatDateTime(m.createdAt)}</span>
        <p className="text-[11px] text-zinc-500 mt-0.5">{getRelativeTime(m.createdAt)}</p>
      </td>
    </tr>
  );

  const categoryPill = (category: string) => (
    <span className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
      {category}
    </span>
  );

  const campusStatusPill = (o: OutsiderRecord) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${
        o.status === "INSIDE"
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : "bg-zinc-950 text-zinc-500 border-zinc-800"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${o.status === "INSIDE" ? "bg-emerald-500" : "bg-zinc-600"}`}></span>
      {o.status === "INSIDE" ? "Inside Campus" : "Exited"}
    </span>
  );

  const markExitedButton = (o: OutsiderRecord) =>
    o.status === "INSIDE" ? (
      <RowActions>
        <IconAction label="Mark Exited" icon={<LogOut />} onClick={() => handleMarkExited(o.id)} />
      </RowActions>
    ) : (
      <span className="text-xs text-zinc-500 italic">Completed</span>
    );

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8 pb-12">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
              Gate Movement Logs
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Gate entries and exits marked by security, plus visitors on campus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {loading && (
              <div className="flex items-center text-sm text-zinc-500 gap-2">
                <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="hidden sm:inline">Loading data...</span>
              </div>
            )}
            <div className="relative flex-1 sm:flex-none">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
              <DateField
                value={date}
                max={istDateString()}
                onChange={(e) => handleDateChange(e.target.value)}
                disabled={loading}
                aria-label="Select date"
                className="h-10 w-full sm:w-auto rounded-full border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm font-medium text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 disabled:opacity-50 [color-scheme:light] cursor-pointer"
 showIcon={false}
/>
            </div>
            {activeTab === "outsiders" && (
              <Button onClick={() => setShowAddModal(true)} className="h-10 flex-1 sm:flex-none">
                <Plus className="h-4 w-4" />
                Register Visitor
              </Button>
            )}
          </div>
        </div>

        {/* Main Content Area with Loading State */}
        <LoadingPill active={loading} />
        <div className={`space-y-6 lg:space-y-8 transition-opacity duration-200 ${loading ? "opacity-50 pointer-events-none grayscale-[0.2]" : "opacity-100"}`}>
          {/* Movement Operations Summary Cards */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                Movement Overview
              </h2>
              <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
                {isToday ? "Showing Data for Today" : `Showing Data for ${formatDisplayDate(date)}`}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                title={isToday ? "Entries Today" : `Entries on ${formatDisplayDate(date)}`}
                value={stats.entriesToday}
                icon={<ArrowDownLeft />}
              />
              <StatCard
                title={isToday ? "Exits Today" : `Exits on ${formatDisplayDate(date)}`}
                value={stats.exitsToday}
                icon={<ArrowUpRight />}
              />
              <StatCard
                title="Total Visitor Visits"
                value={(outsiders || []).length}
                icon={<Users />}
              />
              <StatCard
                title="Visitors on Campus"
                value={activeOutsidersCount}
                icon={<UserCheck />}
              />
            </div>
          </section>

          {/* Movement Tabs */}
          <div className="space-y-4">
            <div
              className="inline-flex max-w-full rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
              role="tablist"
              aria-label="Movement type"
            >
              {/* Tab 1: Entries */}
              <button role="tab" aria-selected={activeTab === "entries"} onClick={() => setActiveTab("entries")} className={tabClass(activeTab === "entries")}>
                <ArrowDownLeft className="h-4 w-4" />
                Campus Entries
                <span className={countChipClass(activeTab === "entries")}>{recentEntries.length}</span>
              </button>

              {/* Tab 2: Exits */}
              <button role="tab" aria-selected={activeTab === "exits"} onClick={() => setActiveTab("exits")} className={tabClass(activeTab === "exits")}>
                <ArrowUpRight className="h-4 w-4" />
                Campus Exits
                <span className={countChipClass(activeTab === "exits")}>{recentExits.length}</span>
              </button>

              {/* Tab 3: Visitors (Parents, Guests & Vendors) */}
              <button role="tab" aria-selected={activeTab === "outsiders"} onClick={() => setActiveTab("outsiders")} className={tabClass(activeTab === "outsiders")}>
                <UserCheck className="h-4 w-4" />
                Visitors (Parents, Guests & Vendors)
                <span className={countChipClass(activeTab === "outsiders")}>{(outsiders || []).length}</span>
              </button>
            </div>

            {/* TAB 1: Campus Entries */}
            {activeTab === "entries" && (
              <Card className="overflow-hidden">
                {/* Search toolbar */}
                <div className="p-4 sm:p-5 border-b border-zinc-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none z-10" />
                    <Input
                      value={entrySearch}
                      onChange={(e) => setEntrySearch(e.target.value)}
                      placeholder="Search entries by student, roll no, gate..."
                      className={searchInputClass}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>
                      Showing <strong className="font-medium text-zinc-200">{filteredEntries.length}</strong> of {recentEntries.length} entry logs
                    </span>
                    {entrySearch && (
                      <button
                        onClick={() => setEntrySearch("")}
                        className="text-orange-400 hover:text-orange-300 text-xs font-medium cursor-pointer ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <CardContent className="p-0 sm:p-0">
                  {/* Phones: stacked rows */}
                  <ul className={`sm:hidden ${dt.mobileList}`}>
                    {pageSlice(filteredEntries).map((m) => renderMovementCard(m, "entry"))}
                  </ul>
                  {/* Tablet and up: table */}
                  <div className={`hidden sm:block ${dt.wrap}`}>
                    <table className={dt.table}>
                      <thead>
                        <tr>
                          <th className={dt.th}>Student Name</th>
                          <th className={dt.th}>Gate & Location</th>
                          <th className={dt.th}>Associated Pass / Purpose</th>
                          <th className={dt.thRight}>Entry Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageSlice(filteredEntries).map((m) => renderMovementRow(m, "entry"))}
                      </tbody>
                    </table>
                  </div>

                  <PagerBar page={page} pageSize={PAGE_SIZE} total={filteredEntries.length} onPageChange={setPage} itemLabel="entries" />

                  {filteredEntries.length === 0 && (
                    <EmptyState
                      icon={<Search className="h-6 w-6" />}
                      title={entrySearch ? "No matching entries" : "No entry records found"}
                      description={
                        entrySearch
                          ? `No student entry records found matching "${entrySearch}".`
                          : "Student entries logged through gate security scans will appear here."
                      }
                      action={
                        entrySearch ? (
                          <Button variant="outline" size="sm" onClick={() => setEntrySearch("")} className="h-10 sm:h-9">
                            Clear Filter
                          </Button>
                        ) : undefined
                      }
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* TAB 2: Campus Exits */}
            {activeTab === "exits" && (
              <Card className="overflow-hidden">
                {/* Search toolbar */}
                <div className="p-4 sm:p-5 border-b border-zinc-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none z-10" />
                    <Input
                      value={exitSearch}
                      onChange={(e) => setExitSearch(e.target.value)}
                      placeholder="Search exits by student, roll no, destination..."
                      className={searchInputClass}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>
                      Showing <strong className="font-medium text-zinc-200">{filteredExits.length}</strong> of {recentExits.length} exit logs
                    </span>
                    {exitSearch && (
                      <button
                        onClick={() => setExitSearch("")}
                        className="text-orange-400 hover:text-orange-300 text-xs font-medium cursor-pointer ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <CardContent className="p-0 sm:p-0">
                  {/* Phones: stacked rows */}
                  <ul className={`sm:hidden ${dt.mobileList}`}>
                    {pageSlice(filteredExits).map((m) => renderMovementCard(m, "exit"))}
                  </ul>
                  {/* Tablet and up: table */}
                  <div className={`hidden sm:block ${dt.wrap}`}>
                    <table className={dt.table}>
                      <thead>
                        <tr>
                          <th className={dt.th}>Student Name</th>
                          <th className={dt.th}>Exit Gate</th>
                          <th className={dt.th}>Exit Purpose & Destination</th>
                          <th className={dt.thRight}>Exit Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageSlice(filteredExits).map((m) => renderMovementRow(m, "exit"))}
                      </tbody>
                    </table>
                  </div>

                  <PagerBar page={page} pageSize={PAGE_SIZE} total={filteredExits.length} onPageChange={setPage} itemLabel="exits" />

                  {filteredExits.length === 0 && (
                    <EmptyState
                      icon={<Search className="h-6 w-6" />}
                      title={exitSearch ? "No matching exits" : "No exit records found"}
                      description={
                        exitSearch
                          ? `No student exit records found matching "${exitSearch}".`
                          : "Student exits verified through campus security will appear here."
                      }
                      action={
                        exitSearch ? (
                          <Button variant="outline" size="sm" onClick={() => setExitSearch("")} className="h-10 sm:h-9">
                            Clear Filter
                          </Button>
                        ) : undefined
                      }
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* TAB 3: Visitors */}
            {activeTab === "outsiders" && (
              <div className="space-y-4">
                {actionError && !showAddModal && (
                  <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {actionError}
                  </div>
                )}
                <Card className="overflow-hidden">
                  {/* Toolbar */}
                  <div className="p-4 sm:p-5 border-b border-zinc-800/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div
                      className="inline-flex max-w-full self-start rounded-full bg-zinc-950 p-1 border border-zinc-800 overflow-x-auto scrollbar-none"
                      role="tablist"
                      aria-label="Visitor category"
                    >
                      {[
                        { key: "ALL", label: "All Visitors" },
                        { key: "PARENT", label: "Parents" },
                        { key: "RELATIVE", label: "Relatives" },
                        { key: "GUEST", label: "Official Guests" },
                        { key: "VENDOR", label: "Couriers / Vendors" },
                        { key: "OTHER", label: "Other" },
                      ].map((cat) => (
                        <button
                          key={cat.key}
                          role="tab"
                          aria-selected={outsiderCategory === cat.key}
                          onClick={() => setOutsiderCategory(cat.key)}
                          className={`text-xs font-medium px-3.5 h-9 sm:h-8 rounded-full transition-colors whitespace-nowrap cursor-pointer ${
                            outsiderCategory === cat.key ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative w-full lg:w-72">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none z-10" />
                        <Input
                          value={outsiderSearch}
                          onChange={(e) => setOutsiderSearch(e.target.value)}
                          placeholder="Search by visitor, student, or phone..."
                          className={searchInputClass}
                        />
                      </div>
                      {outsiderSearch && (
                        <button
                          onClick={() => setOutsiderSearch("")}
                          className="text-orange-400 hover:text-orange-300 text-xs font-medium cursor-pointer shrink-0"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-0 sm:p-0">
                    {/* Phones: stacked rows */}
                    <ul className={`md:hidden ${dt.mobileList}`}>
                      {pageSlice(filteredOutsiders).map((o) => (
                        <li key={o.id} className="px-4 py-3.5 hover:bg-zinc-950/70 transition-colors cursor-pointer" onClick={() => setSelectedRecord(o)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-100 truncate">{o.name}</p>
                              <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5 truncate">
                                <Phone className="h-3 w-3 shrink-0" />
                                {o.phone}
                              </p>
                            </div>
                            {categoryPill(o.category)}
                          </div>
                          {o.visitingStudent && (
                            <p className="mt-2 text-xs text-zinc-300 truncate">
                              <span className="text-zinc-500">Visiting:</span> {o.visitingStudent}
                            </p>
                          )}
                          {o.purpose && <p className="mt-0.5 text-xs text-zinc-500 truncate">{o.purpose}</p>}
                          {o.vehicleNumber && (
                            <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5 truncate">
                              <Car className="h-3 w-3 shrink-0" />
                              <span className="truncate">{o.vehicleNumber}</span>
                            </p>
                          )}
                          <p className="text-[11px] text-zinc-500 mt-1 truncate">
                            Entered via {o.gate} • {formatDateTime(o.entryTime)}
                          </p>
                          {o.exitTime && (
                            <p className="text-[11px] text-zinc-500 truncate">Left at {formatDateTime(o.exitTime)}</p>
                          )}
                          <div className="mt-3 flex min-h-9 items-center justify-between gap-3">
                            {campusStatusPill(o)}
                            {markExitedButton(o)}
                          </div>
                        </li>
                      ))}
                    </ul>

                    {/* Tablet and up: table */}
                    <div className={`hidden md:block ${dt.wrap}`}>
                      <table className={dt.table}>
                        <thead>
                          <tr>
                            <th className={dt.th}>Visitor</th>
                            <th className={dt.th}>Category</th>
                            <th className={dt.th}>Visiting Student / Target</th>
                            <th className={dt.th}>Purpose & Vehicle</th>
                            <th className={dt.th}>Campus Status</th>
                            <th className={dt.thRight}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageSlice(filteredOutsiders).map((o) => (
                            <tr key={o.id} className={dt.trClickable} onClick={() => setSelectedRecord(o)}>
                              {/* Visitor Info */}
                              <td className={dt.td}>
                                <PersonCell
                                  name={o.name}
                                  sub={
                                    <span className="inline-flex items-center gap-1.5">
                                      <Phone className="h-3 w-3 shrink-0" />
                                      {o.phone}
                                    </span>
                                  }
                                />
                                <p className="text-[11px] text-zinc-500 mt-1 truncate tabular-nums">
                                  Entered via {o.gate} • {formatDateTime(o.entryTime)}
                                </p>
                              </td>

                              {/* Category */}
                              <td className={dt.td}>{categoryPill(o.category)}</td>

                              {/* Visiting Target */}
                              <td className={`${dt.td} text-xs`}>
                                <p className="font-medium text-zinc-200 truncate">{o.visitingStudent}</p>
                              </td>

                              {/* Purpose & Vehicle */}
                              <td className={`${dt.td} text-xs`}>
                                <p className="text-zinc-300 truncate">{o.purpose}</p>
                                {o.vehicleNumber && (
                                  <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5 truncate">
                                    <Car className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{o.vehicleNumber}</span>
                                  </p>
                                )}
                              </td>

                              {/* Campus Status */}
                              <td className={dt.td}>
                                {campusStatusPill(o)}
                                {o.exitTime && (
                                  <p className="text-[11px] text-zinc-500 mt-1 truncate tabular-nums">Left at {formatDateTime(o.exitTime)}</p>
                                )}
                              </td>

                              {/* Actions */}
                              <td className={dt.tdActions}>{markExitedButton(o)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <PagerBar page={page} pageSize={PAGE_SIZE} total={filteredOutsiders.length} onPageChange={setPage} itemLabel="visitors" />

                    {filteredOutsiders.length === 0 && (
                      <EmptyState
                        icon={<UserCheck className="h-6 w-6" />}
                        title="No visitor records found"
                        description={
                          outsiderSearch || outsiderCategory !== "ALL"
                            ? "No visitor records matched your search or category filter."
                            : "Click 'Register Visitor' above to log an entry for parents or relatives."
                        }
                        action={
                          outsiderSearch || outsiderCategory !== "ALL" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setOutsiderSearch("");
                                setOutsiderCategory("ALL");
                              }}
                              className="h-10 sm:h-9"
                            >
                              Reset Filters
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Register Outsider Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Register Visitor Entry"
        className="max-w-xl"
      >
        <form onSubmit={handleAddOutsider} className="space-y-4">
          {actionError && (
            <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {actionError}
            </div>
          )}
          {/* Visitor photo (mandatory) */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-300">Visitor Photo <span className="text-orange-400">*</span></p>
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 flex items-center justify-center">
                {visitorPhoto ? (
                  <img src={visitorPhoto} alt="Visitor" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-zinc-600" />
                )}
              </div>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-950 transition-colors">
                {visitorPhoto ? "Retake photo" : "Take photo"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleVisitorPhoto} />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Visitor Name <span className="text-orange-400">*</span></label>
              <Input name="name" required placeholder="e.g. Ramesh Nair" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Phone Number <span className="text-orange-400">*</span></label>
              <Input name="phone" required type="tel" maxLength={15} placeholder="+91-9876543210" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Visitor Category</label>
              <Select name="category" defaultValue="PARENT" className="h-12">
                <option value="PARENT">Parent / Guardian</option>
                <option value="RELATIVE">Relative / Family</option>
                <option value="GUEST">Official Guest</option>
                <option value="VENDOR">Courier / Vendor</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Entry Gate</label>
              <Input name="gate" placeholder="e.g. Main Gate" maxLength={100} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-zinc-300">Person to Visit</label>
              <Input
                name="visitingStudent"
                placeholder="e.g. Aditya Nair (Roll 21BCS1001, Block A)"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-zinc-300">Purpose of Visit</label>
              <Input
                name="purpose"
                placeholder="e.g. Ward visit, fee clearance, emergency"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="admin-visitor-vehicle" className="text-sm font-medium text-zinc-300">
                Vehicle Number <span className="text-orange-400">*</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="admin-visitor-vehicle"
                  name="vehicleNumber"
                  required={!visitorOnFoot}
                  disabled={visitorOnFoot}
                  autoCapitalize="characters"
                  placeholder={visitorOnFoot ? "No vehicle" : "e.g. AP 05 AB 1234"}
                  className="disabled:opacity-60"
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={visitorOnFoot}
                  onClick={() => setVisitorOnFoot((v) => !v)}
                  className={`h-12 shrink-0 rounded-2xl border px-4 text-sm font-medium transition-colors ${
                    visitorOnFoot
                      ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                  }`}
                >
                  {visitorOnFoot ? "✓ " : ""}No vehicle (on foot)
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-4 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddModal(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={savingOutsider} className="w-full sm:w-auto">
              {savingOutsider ? "Saving..." : "Save Entry"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Details Modal */}
      <Modal
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title="Record Details"
      >
        {selectedRecord && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-medium text-zinc-100 min-w-0 break-words">
                {selectedRecord.student?.profile?.name || selectedRecord.name || "Unknown"}
              </h3>
              <StatusBadge status={selectedRecord.type || selectedRecord.status} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedRecord.category && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Category</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.category}</p>
                </div>
              )}
              {/* Outsider phone or Student phone */}
              {(selectedRecord.phone || selectedRecord.student?.profile?.phone) && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Phone</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.phone || selectedRecord.student?.profile?.phone}</p>
                </div>
              )}
              {/* Student email */}
              {selectedRecord.student?.profile?.email && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Email</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.student.profile.email}</p>
                </div>
              )}
              {/* Outsider purpose or Student permission purpose */}
              {(selectedRecord.purpose || selectedRecord.permission?.purpose) && (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Purpose</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.purpose || selectedRecord.permission?.purpose}</p>
                </div>
              )}
              {selectedRecord.permission?.destination && (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Destination</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.permission.destination}</p>
                </div>
              )}
              {selectedRecord.visitingStudent && (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Visiting</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.visitingStudent}</p>
                </div>
              )}
              {selectedRecord.vehicleNumber && (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Vehicle Number</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.vehicleNumber}</p>
                </div>
              )}
              {selectedRecord.student?.isFaculty && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Role</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">Faculty{selectedRecord.student.designation ? ` • ${selectedRecord.student.designation}` : ""}</p>
                </div>
              )}
              {selectedRecord.student?.studentRoll && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">{selectedRecord.student?.isFaculty ? "Employee ID" : "Roll Number"}</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.student.studentRoll}</p>
                </div>
              )}
              {selectedRecord.gate?.name ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Gate</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.gate.name}</p>
                </div>
              ) : selectedRecord.gate ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Gate</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.gate}</p>
                </div>
              ) : null}
              {selectedRecord.securityUser?.profile?.name && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Processed By</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{selectedRecord.securityUser.profile.name}</p>
                </div>
              )}
              {selectedRecord.createdAt ? (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Timestamp</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{formatDateTime(selectedRecord.createdAt)}</p>
                </div>
              ) : selectedRecord.entryTime ? (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Entry Time</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{formatDateTime(selectedRecord.entryTime)}</p>
                </div>
              ) : null}
              {selectedRecord.exitTime && (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Exit Time</p>
                  <p className="mt-0.5 text-sm text-zinc-200 break-words">{formatDateTime(selectedRecord.exitTime)}</p>
                </div>
              )}
            </div>

            {/* Display photo for outsiders or student movements */}
            {(selectedRecord.photoUrl || selectedRecord.imagePath) && (
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Captured Photo</p>
                <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 flex justify-center items-center max-h-64">
                  {signedPhotoUrl ? (
                    <img src={signedPhotoUrl} alt="Captured Photo" className="max-h-full object-contain" />
                  ) : (
                    <div className="animate-pulse bg-zinc-950 w-full h-full min-h-[120px] flex items-center justify-center">
                      <span className="text-xs text-zinc-500">Loading photo...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

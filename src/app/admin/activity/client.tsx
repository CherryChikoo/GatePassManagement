"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { StatCard, StatusBadge, Badge, EmptyState, Modal, Select } from "@/components/ui/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDate, getRelativeTime } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { getActivityData } from "@/server/actions/admin";
import { registerOutsider, markOutsiderExited } from "@/server/actions/outsiders";
import { istDateString } from "@/lib/time/ist";
import { getExitPhotoUrl } from "@/lib/storage/image-upload";
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
} from "lucide-react";

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

  // Count active outsiders inside campus for this date
  const activeOutsidersCount = (outsiders || []).filter((o) => o.status === "INSIDE").length;

  // Add new outsider (persisted)
  const [savingOutsider, setSavingOutsider] = useState(false);
  async function handleAddOutsider(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingOutsider) return;
    const formData = new FormData(e.currentTarget);
    setSavingOutsider(true);
    setActionError(null);
    try {
      const res = await registerOutsider({
        name: formData.get("name") as string,
        phone: formData.get("phone") as string,
        category: (formData.get("category") as string) || "GUEST",
        purpose: formData.get("purpose") as string,
        visitingStudent: (formData.get("visitingStudent") as string) || "",
        gate: (formData.get("gate") as string) || "",
        vehicleNumber: (formData.get("vehicleNumber") as string) || "",
      });
      if (!res?.success) {
        setActionError(res?.error || "Failed to register visitor.");
        return;
      }
      setShowAddModal(false);
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

  return (
    <>
      <div className="space-y-8 pb-12">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              <History className="h-6 w-6 text-orange-500" /> Gate Movement Logs
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Gate entries and exits marked by security, plus visitors on campus.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {loading && (
              <div className="flex items-center text-sm font-medium text-orange-500 animate-pulse gap-2">
                <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="hidden sm:inline">Loading data...</span>
              </div>
            )}
            <input
              type="date"
              value={date}
              max={istDateString()}
              onChange={(e) => handleDateChange(e.target.value)}
              disabled={loading}
              className="h-9 px-3 bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50 [color-scheme:light] cursor-pointer hover:border-zinc-700 transition-colors"
            />
            {activeTab === "outsiders" && (
              <Button
                onClick={() => setShowAddModal(true)}
                className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold h-9 shadow-lg shadow-orange-600/20"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Register Visitor
              </Button>
            )}
          </div>
        </div>

        {/* Main Content Area with Loading State */}
        <div className={`space-y-8 transition-opacity duration-200 ${loading ? "opacity-50 pointer-events-none grayscale-[0.2]" : "opacity-100"}`}>
          {/* Movement Operations Summary Cards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 font-heading">
                Movement Overview
              </h2>
              <span className="text-xs font-semibold text-orange-400 bg-orange-400/10 px-2 py-1 rounded">
                {isToday ? "Showing Data for Today" : `Showing Data for ${formatDisplayDate(date)}`}
              </span>
            </div>
            
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <StatCard
              title={isToday ? "Entries Today" : `Entries on ${formatDisplayDate(date)}`}
              value={stats.entriesToday}
              icon={<ArrowDownLeft className="h-5 w-5 text-emerald-400" />}
            />
            <StatCard
              title={isToday ? "Exits Today" : `Exits on ${formatDisplayDate(date)}`}
              value={stats.exitsToday}
              icon={<ArrowUpRight className="h-5 w-5 text-amber-400" />}
            />
            <StatCard
              title="Total Visitor Visits"
              value={(outsiders || []).length}
              icon={<Users className="h-5 w-5 text-blue-400" />}
            />
            <StatCard
              title="Visitors on Campus"
              value={activeOutsidersCount}
              icon={<UserCheck className="h-5 w-5 text-purple-400" />}
            />
          </div>
        </div>

        {/* Movement Tabs */}
        <div className="mt-8">
          <div className="flex border-b border-zinc-800/80 mb-6 gap-2 overflow-x-auto scrollbar-hide">
            

            {/* Tab 1: Entries */}
            <button
              onClick={() => setActiveTab("entries")}
              className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "entries"
                  ? "border-emerald-500 text-emerald-400 bg-emerald-500/5 rounded-t-lg"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" />
              Campus Entries
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-300">
                {recentEntries.length}
              </span>
            </button>

            {/* Tab 2: Exits */}
            <button
              onClick={() => setActiveTab("exits")}
              className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "exits"
                  ? "border-amber-500 text-amber-400 bg-amber-500/5 rounded-t-lg"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              Campus Exits
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-300">
                {recentExits.length}
              </span>
            </button>

            {/* Tab 3: Visitors (Parents, Guests & Vendors) */}
            <button
              onClick={() => setActiveTab("outsiders")}
              className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "outsiders"
                  ? "border-purple-500 text-purple-400 bg-purple-500/5 rounded-t-lg"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Visitors (Parents, Guests & Vendors)
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {(outsiders || []).length}
              </span>
            </button>
          </div>

          {/* TAB 1: Campus Entries */}
          {activeTab === "entries" && (
            <div className="space-y-4">
              <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden min-h-[500px]">
                {/* Integrated Search Toolbar */}
                <div className="p-3.5 sm:p-4 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/40">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                    <Input
                      value={entrySearch}
                      onChange={(e) => setEntrySearch(e.target.value)}
                      placeholder="Search entries by student, roll no, gate..."
                      className="pl-9 bg-zinc-900/90 border-zinc-800 text-xs h-9 focus-visible:ring-1 focus-visible:ring-emerald-500/50"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>
                      Showing <strong className="text-zinc-200">{filteredEntries.length}</strong> of {recentEntries.length} entry logs
                    </span>
                    {entrySearch && (
                      <button
                        onClick={() => setEntrySearch("")}
                        className="text-orange-400 hover:text-orange-300 text-xs underline cursor-pointer ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800/80 bg-zinc-950/60 whitespace-nowrap">
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Student Name</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Gate & Location</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Associated Pass / Purpose</th>
                          <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Entry Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {filteredEntries.map((m) => (
                          <tr key={m.id} className="table-row-hover transition-colors cursor-pointer" onClick={() => setSelectedRecord(m)}>
                            {/* Student */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
                                  {m.student?.profile?.name?.slice(0, 2).toUpperCase() || "—"}
                                </div>
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Link
                                      href={`/admin/users/${m.student?.profileId || m.student?.profile?.id}`}
                                      className="font-semibold text-zinc-100 hover:text-orange-400 transition-colors inline-flex items-center gap-1 truncate"
                                    >
                                      <span className="truncate">{m.student?.profile?.name || "Unknown person"}</span>
                                      <ExternalLink className="h-3 w-3 text-zinc-500 shrink-0" />
                                    </Link>
                                    {m.student?.isFaculty && (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 shrink-0">
                                        Faculty
                                      </span>
                                    )}
                                    {m.student?.studentRoll && (
                                      <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 shrink-0">
                                        {m.student.studentRoll}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                                    {m.student?.profile?.email || m.student?.profile?.phone}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Gate */}
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-zinc-200 truncate">{m.gate?.name || "Main Gate"}</p>
                              {m.gate?.location && (
                                <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
                                  <MapPin className="h-3 w-3 text-zinc-500 shrink-0" />
                                  <span className="truncate">{m.gate.location}</span>
                                </p>
                              )}
                            </td>

                            {/* Associated Pass */}
                            <td className="px-5 py-3.5 text-xs">
                              {m.permission ? (
                                <div className="truncate">
                                  <p className="font-medium text-zinc-200 truncate">{m.permission.purpose}</p>
                                  {m.permission.destination && (
                                    <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                                      Destination: {m.permission.destination}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-500 italic">Direct Entry Scan</span>
                              )}
                            </td>

                            {/* Timestamp */}
                            <td className="px-5 py-3.5 text-right text-xs">
                              <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-mono font-medium whitespace-nowrap">
                                {formatDateTime(m.createdAt)}
                              </span>
                              <p className="text-[11px] text-zinc-500 mt-0.5">{getRelativeTime(m.createdAt)}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredEntries.length === 0 && (
                    <div className="py-16 text-center">
                      <EmptyState
                        icon={<Search className="h-8 w-8 text-zinc-500" />}
                        title={entrySearch ? "No matching entries" : "No entry records found"}
                        description={
                          entrySearch
                            ? `No student entry records found matching "${entrySearch}".`
                            : "Student entries logged through gate security scans will appear here."
                        }
                        action={
                          entrySearch ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEntrySearch("")}
                              className="mt-3 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                            >
                              Clear Filter
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 2: Campus Exits */}
          {activeTab === "exits" && (
            <div className="space-y-4">
              <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden min-h-[500px]">
                {/* Integrated Search Toolbar */}
                <div className="p-3.5 sm:p-4 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/40">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                    <Input
                      value={exitSearch}
                      onChange={(e) => setExitSearch(e.target.value)}
                      placeholder="Search exits by student, roll no, destination..."
                      className="pl-9 bg-zinc-900/90 border-zinc-800 text-xs h-9 focus-visible:ring-1 focus-visible:ring-amber-500/50"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>
                      Showing <strong className="text-zinc-200">{filteredExits.length}</strong> of {recentExits.length} exit logs
                    </span>
                    {exitSearch && (
                      <button
                        onClick={() => setExitSearch("")}
                        className="text-orange-400 hover:text-orange-300 text-xs underline cursor-pointer ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800/80 bg-zinc-950/60 whitespace-nowrap">
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Student Name</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Exit Gate</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Exit Purpose & Destination</th>
                          <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Exit Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {filteredExits.map((m) => (
                          <tr key={m.id} className="table-row-hover transition-colors cursor-pointer" onClick={() => setSelectedRecord(m)}>
                            {/* Student */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                                  {m.student?.profile?.name?.slice(0, 2).toUpperCase() || "—"}
                                </div>
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Link
                                      href={`/admin/users/${m.student?.profileId || m.student?.profile?.id}`}
                                      className="font-semibold text-zinc-100 hover:text-orange-400 transition-colors inline-flex items-center gap-1 truncate"
                                    >
                                      <span className="truncate">{m.student?.profile?.name || "Unknown person"}</span>
                                      <ExternalLink className="h-3 w-3 text-zinc-500 shrink-0" />
                                    </Link>
                                    {m.student?.isFaculty && (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 shrink-0">
                                        Faculty
                                      </span>
                                    )}
                                    {m.student?.studentRoll && (
                                      <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 shrink-0">
                                        {m.student.studentRoll}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                                    {m.student?.profile?.email || m.student?.profile?.phone}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Gate */}
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-zinc-200 truncate">{m.gate?.name || "Main Gate"}</p>
                              {m.gate?.location && (
                                <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
                                  <MapPin className="h-3 w-3 text-zinc-500 shrink-0" />
                                  <span className="truncate">{m.gate.location}</span>
                                </p>
                              )}
                            </td>

                            {/* Purpose & Destination */}
                            <td className="px-5 py-3.5 text-xs">
                              {m.permission ? (
                                <div className="truncate">
                                  <p className="font-medium text-zinc-200 truncate">{m.permission.purpose}</p>
                                  {m.permission.destination && (
                                    <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                                      Destination: {m.permission.destination}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-500 italic">Direct Exit Scan</span>
                              )}
                            </td>

                            {/* Timestamp */}
                            <td className="px-5 py-3.5 text-right text-xs">
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono font-medium whitespace-nowrap">
                                {formatDateTime(m.createdAt)}
                              </span>
                              <p className="text-[11px] text-zinc-500 mt-0.5">{getRelativeTime(m.createdAt)}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredExits.length === 0 && (
                    <div className="py-16 text-center">
                      <EmptyState
                        icon={<Search className="h-8 w-8 text-zinc-500" />}
                        title={exitSearch ? "No matching exits" : "No exit records found"}
                        description={
                          exitSearch
                            ? `No student exit records found matching "${exitSearch}".`
                            : "Student exits verified through campus security will appear here."
                        }
                        action={
                          exitSearch ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setExitSearch("")}
                              className="mt-3 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                            >
                              Clear Filter
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 3: Students Left */}
          {activeTab === "outsiders" && (
            <div className="space-y-4">
              {actionError && !showAddModal && (
                <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {actionError}
                </div>
              )}
              {/* Outsiders Card */}
              <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden min-h-[500px]">
                {/* Integrated Toolbar */}
                <div className="p-3.5 sm:p-4 border-b border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-950/40">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                    {[
                      { key: "ALL", label: "All Visitors" },
                      { key: "PARENT", label: "Parents" },
                      { key: "RELATIVE", label: "Relatives" },
                      { key: "GUEST", label: "Official Guests" },
                      { key: "VENDOR", label: "Couriers / Vendors" },
                      { key: "OTHER", label: "Other" },
                    ].map((cat) => (
                      <Button
                        key={cat.key}
                        variant={outsiderCategory === cat.key ? "default" : "outline"}
                        size="sm"
                        onClick={() => setOutsiderCategory(cat.key)}
                        className={
                          outsiderCategory === cat.key
                            ? "bg-purple-600 hover:bg-purple-500 text-white text-xs h-8 border-transparent cursor-pointer"
                            : "border-zinc-800 text-xs h-8 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        }
                      >
                        {cat.label}
                      </Button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                      <Input
                        value={outsiderSearch}
                        onChange={(e) => setOutsiderSearch(e.target.value)}
                        placeholder="Search by visitor, student, or phone..."
                        className="pl-8 bg-zinc-900/90 border-zinc-800 text-xs h-8 focus-visible:ring-1 focus-visible:ring-purple-500/50"
                      />
                    </div>
                    {outsiderSearch && (
                      <button
                        onClick={() => setOutsiderSearch("")}
                        className="text-purple-400 hover:text-purple-300 text-xs underline cursor-pointer shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800/80 bg-zinc-950/60 whitespace-nowrap">
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Visitor</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Category</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Visiting Student / Target</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Purpose & Vehicle</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-zinc-400">Campus Status</th>
                          <th className="px-5 py-3.5 text-right font-semibold text-zinc-400">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {filteredOutsiders.map((o) => (
                          <tr key={o.id} className="table-row-hover transition-colors cursor-pointer" onClick={() => setSelectedRecord(o)}>
                            {/* Visitor Info */}
                            <td className="px-5 py-4">
                              <p className="font-semibold text-zinc-100 truncate">{o.name}</p>
                              <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5 truncate">
                                <Phone className="h-3 w-3 text-zinc-500 shrink-0" />
                                {o.phone}
                              </p>
                              <p className="text-[11px] text-zinc-500 mt-1 truncate">
                                Entered via {o.gate} • {formatDateTime(o.entryTime)}
                              </p>
                            </td>

                            {/* Category Badge */}
                            <td className="px-5 py-4">
                              <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${
                                o.category === "PARENT"
                                  ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                  : o.category === "RELATIVE"
                                  ? "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                                  : o.category === "GUEST"
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                              }`}>
                                {o.category}
                              </span>
                            </td>

                            {/* Visiting Target */}
                            <td className="px-5 py-4 text-xs">
                              <p className="font-semibold text-zinc-200 truncate">{o.visitingStudent}</p>
                            </td>

                            {/* Purpose & Vehicle */}
                            <td className="px-5 py-4 text-xs">
                              <p className="text-zinc-300 truncate">{o.purpose}</p>
                              {o.vehicleNumber && (
                                <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5 truncate">
                                  <Car className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{o.vehicleNumber}</span>
                                </p>
                              )}
                            </td>

                            {/* Campus Status */}
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold ${
                                o.status === "INSIDE"
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${o.status === "INSIDE" ? "bg-emerald-400 animate-ping" : "bg-zinc-500"}`}></span>
                                {o.status === "INSIDE" ? "Inside Campus" : "Exited"}
                              </span>
                              {o.exitTime && (
                                <p className="text-[11px] text-zinc-500 mt-1 truncate">Left at {formatDateTime(o.exitTime)}</p>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-5 py-4 text-right">
                              {o.status === "INSIDE" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkExited(o.id);
                                  }}
                                  className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 px-3 h-8 text-xs font-medium cursor-pointer"
                                >
                                  Mark Exited
                                </Button>
                              ) : (
                                <span className="text-xs text-zinc-500 italic">Completed</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredOutsiders.length === 0 && (
                    <div className="py-16 text-center">
                      <EmptyState
                        icon={<UserCheck className="h-8 w-8 text-zinc-500" />}
                        title="No visitor records found"
                        description={
                          outsiderSearch || outsiderCategory !== "ALL"
                            ? "No visitor records matched your search or category filter."
                            : "Click 'Register Visitor Entry' above to log an entry for parents or relatives."
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
                              className="mt-3 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                            >
                              Reset Filters
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>
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
        <form onSubmit={handleAddOutsider} className="space-y-4 pt-2">
          {actionError && (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {actionError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Visitor Name <span className="text-orange-400">*</span></label>
              <Input name="name" required placeholder="e.g. Ramesh Nair" className="bg-zinc-950 border-zinc-800" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Phone Number <span className="text-orange-400">*</span></label>
              <Input name="phone" required type="tel" maxLength={15} placeholder="+91-9876543210" className="bg-zinc-950 border-zinc-800" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Visitor Category</label>
              <Select name="category" defaultValue="PARENT" className="bg-zinc-950 border-zinc-800">
                <option value="PARENT">Parent / Guardian</option>
                <option value="RELATIVE">Relative / Family</option>
                <option value="GUEST">Official Guest</option>
                <option value="VENDOR">Courier / Vendor</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Entry Gate</label>
              <Input name="gate" placeholder="e.g. Main Gate" maxLength={100} className="bg-zinc-950 border-zinc-800" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-zinc-400">Person to Visit</label>
              <Input
                name="visitingStudent"
                placeholder="e.g. Aditya Nair (Roll 21BCS1001, Block A)"
                className="bg-zinc-950 border-zinc-800"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-zinc-400">Purpose of Visit</label>
              <Input
                name="purpose"
                placeholder="e.g. Ward visit, fee clearance, emergency"
                className="bg-zinc-950 border-zinc-800"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-zinc-400">Vehicle Number</label>
              <Input
                name="vehicleNumber"
                placeholder="e.g. KA-04-MA-1234 or leave blank for Pedestrian"
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={savingOutsider} className="bg-orange-600 hover:bg-orange-500 text-white font-semibold">
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-100">
                {selectedRecord.student?.profile?.name || selectedRecord.name || "Unknown"}
              </h3>
              <StatusBadge status={selectedRecord.type || selectedRecord.status} />
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              {selectedRecord.category && (
                <div>
                  <p className="text-zinc-500">Category</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.category}</p>
                </div>
              )}
              {/* Outsider phone or Student phone */}
              {(selectedRecord.phone || selectedRecord.student?.profile?.phone) && (
                <div>
                  <p className="text-zinc-500">Phone</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.phone || selectedRecord.student?.profile?.phone}</p>
                </div>
              )}
              {/* Student email */}
              {selectedRecord.student?.profile?.email && (
                <div>
                  <p className="text-zinc-500">Email</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.student.profile.email}</p>
                </div>
              )}
              {/* Outsider purpose or Student permission purpose */}
              {(selectedRecord.purpose || selectedRecord.permission?.purpose) && (
                <div className="col-span-2">
                  <p className="text-zinc-500">Purpose</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.purpose || selectedRecord.permission?.purpose}</p>
                </div>
              )}
              {selectedRecord.permission?.destination && (
                <div className="col-span-2">
                  <p className="text-zinc-500">Destination</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.permission.destination}</p>
                </div>
              )}
              {selectedRecord.visitingStudent && (
                <div className="col-span-2">
                  <p className="text-zinc-500">Visiting</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.visitingStudent}</p>
                </div>
              )}
              {selectedRecord.vehicleNumber && (
                <div className="col-span-2">
                  <p className="text-zinc-500">Vehicle Number</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.vehicleNumber}</p>
                </div>
              )}
              {selectedRecord.student?.isFaculty && (
                <div>
                  <p className="text-zinc-500">Role</p>
                  <p className="font-medium text-zinc-200">Faculty{selectedRecord.student.designation ? ` • ${selectedRecord.student.designation}` : ""}</p>
                </div>
              )}
              {selectedRecord.student?.studentRoll && (
                <div>
                  <p className="text-zinc-500">{selectedRecord.student?.isFaculty ? "Employee ID" : "Roll Number"}</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.student.studentRoll}</p>
                </div>
              )}
              {selectedRecord.gate?.name ? (
                <div>
                  <p className="text-zinc-500">Gate</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.gate.name}</p>
                </div>
              ) : selectedRecord.gate ? (
                <div>
                  <p className="text-zinc-500">Gate</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.gate}</p>
                </div>
              ) : null}
              {selectedRecord.securityUser?.profile?.name && (
                <div>
                  <p className="text-zinc-500">Processed By</p>
                  <p className="font-medium text-zinc-200">{selectedRecord.securityUser.profile.name}</p>
                </div>
              )}
              {selectedRecord.createdAt ? (
                <div className="col-span-2">
                  <p className="text-zinc-500">Timestamp</p>
                  <p className="font-medium text-zinc-200">{formatDateTime(selectedRecord.createdAt)}</p>
                </div>
              ) : selectedRecord.entryTime ? (
                <div className="col-span-2">
                  <p className="text-zinc-500">Entry Time</p>
                  <p className="font-medium text-zinc-200">{formatDateTime(selectedRecord.entryTime)}</p>
                </div>
              ) : null}
              {selectedRecord.exitTime && (
                <div className="col-span-2">
                  <p className="text-zinc-500">Exit Time</p>
                  <p className="font-medium text-zinc-200">{formatDateTime(selectedRecord.exitTime)}</p>
                </div>
              )}
            </div>

            {/* Display photo for outsiders or student movements */}
            {(selectedRecord.photoUrl || selectedRecord.imagePath) && (
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-zinc-500 text-sm mb-2">Captured Photo</p>
                <div className="rounded-xl overflow-hidden border border-zinc-800 bg-black flex justify-center items-center max-h-64">
                  {signedPhotoUrl ? (
                    <img src={signedPhotoUrl} alt="Captured Photo" className="max-h-full object-contain" />
                  ) : (
                    <div className="animate-pulse bg-zinc-800 w-full h-full min-h-[120px] flex items-center justify-center">
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


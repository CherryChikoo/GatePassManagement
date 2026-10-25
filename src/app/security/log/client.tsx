"use client";
import { DateField } from "@/components/ui/date-field";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useT } from "@/components/providers/language-provider";
import { MovementDetails, VisitorDetails } from "@/components/registers/derived-views";

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/primitives";
import { formatTime } from "@/lib/utils";
import { DoorOpen, DoorClosed, Users, Search, Calendar as CalendarIcon, ChevronRight, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { BackButton } from "@/components/ui/back-button";
import { GoBackButton } from "@/components/ui/go-back-button";
import { Input } from "@/components/ui/input";
import { useGateData } from "@/lib/gate-cache";
import { callGate } from "@/lib/gate-call";
import { istDateString } from "@/lib/time/ist";
import { Modal } from "@/components/ui/primitives";
import { dt, IconAction, PersonCell, RowActions } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
import { cn } from "@/lib/utils";

export function SecurityLogClient({ initialDate }: { initialDate?: string }) {
  const t = useT();
  // The chosen day's log from the gate cache: shown at once when seen before,
  // fetched again only after a gate scan / visitor change (live)
  const [selectedDate, setSelectedDate] = useState(() => initialDate || istDateString());
  const day = useGateData<any>(
    `gate-log|${selectedDate}`,
    () => callGate("getSecurityLogData", [selectedDate], 15_000),
    ["gate", "visitors"]
  );
  const studentEntries: any[] = day.data?.studentEntries ?? [];
  const studentExits: any[] = day.data?.studentExits ?? [];
  const outsiderVisits: any[] = day.data?.outsiderVisits ?? [];
  const navigating = day.loading || day.refreshing;
  const [activeTab, setActiveTab] = useState<"ENTRIES" | "EXITS" | "OUTSIDERS">("ENTRIES");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);


  const ITEMS_PER_PAGE = 10;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) {
      setSelectedDate(newDate);
      // Kept in the address, so a reload shows the same day
      window.history.replaceState(null, "", `/security/log?date=${newDate}`);
    }
  };

  const emptyState = (icon: React.ReactNode, text: string) => (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">{icon}</span>
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );

  const renderMovementList = (movements: any[], type: "ENTRY" | "EXIT") => {
    const filtered = movements.filter(m =>
      m.student?.profile?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.student?.studentRoll?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    const DirIcon = type === "EXIT" ? DoorOpen : DoorClosed;
    const dirTone = type === "EXIT" ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400";
    const facultyBadge = (
      <span className="inline-flex shrink-0 items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
        {t("Faculty")}
      </span>
    );
    const purposeLine = (mov: any) =>
      `${mov.permission?.purpose ?? ""} ${mov.permission?.destination ? `→ ${mov.permission.destination}` : ""}`.trim();

    return (
      <>
        {filtered.length === 0 ? (
          emptyState(
            <DirIcon className="h-5 w-5" />,
            type === "EXIT" ? t("No exits found for this date.") : t("No entries found for this date.")
          )
        ) : (
          <>
            {/* Phones: stacked rows */}
            <ul className={cn(dt.mobileList, "lg:hidden")}>
              {paginated.map((mov) => (
                <li key={mov.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(mov)}
                    className="flex w-full min-h-[72px] items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-950/70 active:bg-zinc-950"
                  >
                    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", dirTone)}>
                      <DirIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-base font-medium text-zinc-100">
                          {mov.student?.profile?.name || t("Unknown person")}
                        </span>
                        {mov.student?.isFaculty && facultyBadge}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 min-w-0 text-xs text-zinc-500">
                        {mov.student?.studentRoll && <span className={dt.chip}>{mov.student.studentRoll}</span>}
                        <span className="truncate">{mov.student?.profile?.phone}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">
                        {[mov.gate?.name, purposeLine(mov)].filter(Boolean).join(" • ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-base font-semibold text-zinc-100 tabular-nums">{formatTime(mov.createdAt)}</span>
                      <ChevronRight className="h-4 w-4 text-zinc-600" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Larger screens: table */}
            <div className={cn(dt.wrap, "hidden lg:block")}>
              <table className={dt.table}>
                <thead>
                  <tr>
                    <th className={dt.th}>{t("Name")}</th>
                    <th className={dt.th}>{t("Gate")}</th>
                    <th className={dt.th}>{t("Purpose")}</th>
                    <th className={dt.th}>{t("Time")}</th>
                    <th className={dt.thRight}>
                      <span className="sr-only">{t("Action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((mov) => (
                    <tr key={mov.id} className={dt.trClickable} onClick={() => setSelectedRecord(mov)}>
                      <td className={dt.td}>
                        <PersonCell
                          name={mov.student?.profile?.name || t("Unknown person")}
                          chip={
                            <>
                              {mov.student?.studentRoll && <span className={dt.chip}>{mov.student.studentRoll}</span>}
                              {mov.student?.isFaculty && facultyBadge}
                            </>
                          }
                          sub={mov.student?.profile?.phone}
                        />
                      </td>
                      <td className={cn(dt.td, "whitespace-nowrap")}>{mov.gate?.name || "—"}</td>
                      <td className={cn(dt.tdMuted, "max-w-[280px] truncate")}>{purposeLine(mov) || "—"}</td>
                      <td className={cn(dt.td, "whitespace-nowrap")}>
                        <span className="inline-flex items-center gap-2 font-medium text-zinc-100 tabular-nums">
                          <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", dirTone)}>
                            <DirIcon className="h-3.5 w-3.5" />
                          </span>
                          {formatTime(mov.createdAt)}
                        </span>
                      </td>
                      <td className={dt.tdActions}>
                        <RowActions>
                          <IconAction label={t("View details")} icon={<Eye />} onClick={() => setSelectedRecord(mov)} />
                        </RowActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <PagerBar page={page} pageSize={ITEMS_PER_PAGE} total={filtered.length} onPageChange={setPage} itemLabel={t("records")} />
      </>
    );
  };

  const renderOutsidersList = () => {
    const filtered = outsiderVisits.filter(o =>
      o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.phone.includes(searchQuery) ||
      o.vehicleNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    const purposeLine = (outsider: any) =>
      `${outsider.purpose} ${outsider.visitingStudent ? `(${t("Visiting")}: ${outsider.visitingStudent})` : ""}`.trim();

    return (
      <>
        {filtered.length === 0 ? (
          emptyState(<Users className="h-5 w-5" />, t("No visitor visits found for this date."))
        ) : (
          <>
            {/* Phones: stacked rows */}
            <ul className={cn(dt.mobileList, "lg:hidden")}>
              {paginated.map((outsider) => (
                <li key={outsider.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(outsider)}
                    className="flex w-full min-h-[72px] items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-950/70 active:bg-zinc-950"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-base font-semibold text-orange-400">
                      {(outsider.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-base font-medium text-zinc-100">{outsider.name}</span>
                        <StatusBadge status={outsider.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-zinc-400">
                        {outsider.category} • {purposeLine(outsider)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">
                        {outsider.phone} {outsider.vehicleNumber ? `• ${t("Vehicle")}: ${outsider.vehicleNumber}` : ""}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 tabular-nums">
                          <DoorClosed className="h-3.5 w-3.5" />
                          {formatTime(outsider.entryTime)}
                        </span>
                        {outsider.exitTime && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 tabular-nums">
                            <DoorOpen className="h-3.5 w-3.5" />
                            {formatTime(outsider.exitTime)}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Larger screens: table */}
            <div className={cn(dt.wrap, "hidden lg:block")}>
              <table className={dt.table}>
                <thead>
                  <tr>
                    <th className={dt.th}>{t("Name")}</th>
                    <th className={dt.th}>{t("Purpose")}</th>
                    <th className={dt.th}>{t("Vehicle")}</th>
                    <th className={dt.th}>{t("In")}</th>
                    <th className={dt.th}>{t("Out")}</th>
                    <th className={dt.th}>{t("Status")}</th>
                    <th className={dt.thRight}>
                      <span className="sr-only">{t("Action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((outsider) => (
                    <tr key={outsider.id} className={dt.trClickable} onClick={() => setSelectedRecord(outsider)}>
                      <td className={dt.td}>
                        <PersonCell name={outsider.name || "—"} sub={outsider.phone} />
                      </td>
                      <td className={cn(dt.td, "max-w-[280px]")}>
                        <span className="block truncate text-zinc-300">{purposeLine(outsider)}</span>
                        <span className="block truncate text-xs text-zinc-500">{outsider.category}</span>
                      </td>
                      <td className={cn(dt.tdMuted, "whitespace-nowrap font-mono")}>{outsider.vehicleNumber || "—"}</td>
                      <td className={cn(dt.td, "whitespace-nowrap")}>
                        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-100 tabular-nums">
                          <DoorClosed className="h-3.5 w-3.5 text-emerald-400" />
                          {formatTime(outsider.entryTime)}
                        </span>
                      </td>
                      <td className={cn(dt.td, "whitespace-nowrap")}>
                        {outsider.exitTime ? (
                          <span className="inline-flex items-center gap-1.5 text-zinc-300 tabular-nums">
                            <DoorOpen className="h-3.5 w-3.5 text-sky-400" />
                            {formatTime(outsider.exitTime)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className={dt.td}>
                        <StatusBadge status={outsider.status} />
                      </td>
                      <td className={dt.tdActions}>
                        <RowActions>
                          <IconAction label={t("View details")} icon={<Eye />} onClick={() => setSelectedRecord(outsider)} />
                        </RowActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <PagerBar page={page} pageSize={ITEMS_PER_PAGE} total={filtered.length} onPageChange={setPage} itemLabel={t("records")} />
      </>
    );
  };

  const tabs = [
    { key: "ENTRIES" as const, label: t("Entries"), count: studentEntries.length, icon: <DoorClosed className="h-4 w-4" /> },
    { key: "EXITS" as const, label: t("Exits"), count: studentExits.length, icon: <DoorOpen className="h-4 w-4" /> },
    { key: "OUTSIDERS" as const, label: t("Visitor Visits"), count: outsiderVisits.length, icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <LoadingPill active={navigating} />
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <GoBackButton className="mb-3" />
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">{t("Entries & Exits")}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {t("{entries} entries, {exits} exits, {visits} visitor visits", { entries: studentEntries.length, exits: studentExits.length, visits: outsiderVisits.length })}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
          <label className="relative flex h-12 sm:h-11 shrink-0 cursor-pointer items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-900 pl-4 pr-3 transition-colors hover:border-zinc-700 focus-within:border-orange-500/50 focus-within:ring-4 focus-within:ring-orange-500/10">
            <CalendarIcon className="h-4 w-4 shrink-0 text-orange-400" />
            <DateField
              aria-label={t("Date")}
              value={selectedDate}
              onChange={handleDateChange}
              className="min-w-0 flex-1 bg-transparent text-base sm:text-sm font-medium text-zinc-100 outline-none [color-scheme:light] cursor-pointer"
            />
          </label>
          <div className="relative flex-1 sm:min-w-[260px]">
            <Input
              icon={<Search className="h-4 w-4" />}
              type="search"
              placeholder={t("Search by name, roll no...")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-12 sm:h-11 rounded-full text-base sm:text-sm focus:ring-4 focus:ring-orange-500/10"
            />
          </div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t("Gate Logs")}
        className="grid w-full grid-cols-3 gap-1 rounded-[22px] border border-zinc-800 bg-zinc-950 p-1"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[18px] px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors",
                active ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
              )}
            >
              <span className={cn("hidden sm:inline-flex", active && "text-orange-400")}>{tab.icon}</span>
              <span className="min-w-0 text-center leading-tight break-words">{tab.label}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  active ? "bg-orange-500/10 text-orange-400" : "bg-zinc-900 text-zinc-500"
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {day.error ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <p className="text-sm font-medium text-red-400">{t(day.error)}</p>
            <button
              type="button"
              onClick={() => void day.reload()}
              className="h-11 rounded-full border border-zinc-800 bg-zinc-900 px-5 text-sm font-medium text-zinc-200 hover:bg-zinc-950"
            >
              {t("Try Again")}
            </button>
          </div>
        ) : day.loading ? (
          <p className="px-4 py-14 text-center text-sm text-zinc-500">{t("Loading…")}</p>
        ) : (
          <>
            {activeTab === "ENTRIES" && renderMovementList(studentEntries, "ENTRY")}
            {activeTab === "EXITS" && renderMovementList(studentExits, "EXIT")}
            {activeTab === "OUTSIDERS" && renderOutsidersList()}
          </>
        )}
      </Card>


      {/* Details Modal */}
      <Modal
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord && !selectedRecord.entryTime ? t("Gate Movement Details") : t("Visitor Details")}
        className="max-w-xl"
      >
        {selectedRecord &&
          (selectedRecord.entryTime ? (
            <VisitorDetails id={selectedRecord.id} />
          ) : (
            <MovementDetails id={selectedRecord.id} />
          ))}
      </Modal>

    </div>
  );
}

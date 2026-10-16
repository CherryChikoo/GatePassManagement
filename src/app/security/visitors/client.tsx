"use client";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
import { formatDateTime, formatTime } from "@/lib/utils";
import {
  Users,
  UserPlus,
  History,
  MapPin,
  LogOut,
  Camera,
  CheckCircle2,
  AlertCircle,
  Search,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { registerOutsider, markOutsiderExited } from "@/server/actions/outsiders";
import { uploadOutsiderPhoto } from "@/lib/storage/image-upload";
import { useRouter } from "next/navigation";
import { Modal, StatusBadge } from "@/components/ui/primitives";
import { getExitPhotoUrl } from "@/lib/storage/image-upload";
import { BackButton } from "@/components/ui/back-button";
import { GoBackButton } from "@/components/ui/go-back-button";
import { LiveDateTime } from "@/components/registers/register-form";

interface Props {
  user: any;
  inside: any[];
  history: any[];
}

export function OutsidersClient({ user, inside, history }: Props) {
  const t = useT();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"REGISTER" | "INSIDE" | "HISTORY">("REGISTER");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery]);
  const [selectedOutsider, setSelectedOutsider] = useState<any>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  // Form state
    const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    category: "GUEST",
    purpose: "",
    visitingStudent: "",
    gate: "",
    vehicleNumber: "",
    entryTime: "",
    address: "",
    department: "",
    remarks: "",
  });
  const [photo, setPhoto] = useState<string | null>(null);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(t("Image must be less than 5MB")); setTimeout(() => setError(null), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      // Compress image
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("getContext" in canvas ? "2d" : "2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        setPhoto(compressedBase64);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  
  // Fetch photo URL when outsider is selected
  useEffect(() => {
    async function fetchUrl() {
      if (selectedOutsider?.photoUrl) {
        if (selectedOutsider.photoUrl.startsWith("data:") || selectedOutsider.photoUrl.startsWith("http")) {
          setPhotoUrl(selectedOutsider.photoUrl);
        } else {
          setPhotoUrl(null); // loading state
          const url = await getExitPhotoUrl(selectedOutsider.photoUrl);
          setPhotoUrl(url);
        }
      } else {
        setPhotoUrl(null);
      }
    }
    fetchUrl();
  }, [selectedOutsider]);

  const openOutsiderDetails = (outsider: any) => {
    setSelectedOutsider(outsider);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      // The visitor's photo is mandatory
      if (!photo) {
        setError(t("Take the visitor's photo before registering")); setTimeout(() => setError(null), 4000);
        setLoading(false);
        return;
      }
      let path: string | undefined;
      if (photo) {
        const upload = await uploadOutsiderPhoto(photo, formData.name);
        if (upload.error || !upload.path) {
          setError(t("Photo upload failed:") + " " + (upload.error || t("unknown error"))); setTimeout(() => setError(null), 3000);
          setLoading(false);
          return;
        }
        path = upload.path;
      }

      const result = await registerOutsider({ ...formData, photoUrl: path });
      
      if (result.success) {
        setSuccess(t("Visitor registered successfully!")); setTimeout(() => setSuccess(null), 4000);
        setFormData({
          name: "", phone: "", category: "GUEST", purpose: "", visitingStudent: "", gate: "", vehicleNumber: "", entryTime: "",
          address: "", department: "", remarks: "",
        });
        setPhoto(null);
        // Stay on a fresh form: the next visitor in the queue can be registered straight away
        router.refresh();
      } else {
        setError(result.error || t("Failed to register")); setTimeout(() => setError(null), 3000);
      }
    } catch (err: any) {
      setError(actionErrorMessage(err, t("Failed to register visitor"))); setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkExited = async (id: string) => {
    
    const res = await markOutsiderExited(id);
    if (res.success) {
      setSuccess(t("Marked as exited")); setTimeout(() => setSuccess(null), 3000);
      router.refresh();
    } else {
      setError(res.error || t("Failed to mark exited")); setTimeout(() => setError(null), 3000);
    }
  };

  
  const ITEMS_PER_PAGE = 10;

  const filteredInside = inside.filter(
    (p) =>
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone?.includes(searchQuery) ||
      (p.vehicleNumber && p.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.purpose && p.purpose.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const paginatedInside = filteredInside.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const filteredHistory = history.filter(
    (p) =>
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone?.includes(searchQuery) ||
      (p.vehicleNumber && p.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.purpose && p.purpose.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const paginatedHistory = filteredHistory.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const errorAlert = error && (
    <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-400">
      <AlertCircle className="h-5 w-5 shrink-0" />
      <p className="text-sm font-medium">{error}</p>
    </div>
  );
  const successAlert = success && (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-400">
      <CheckCircle2 className="h-5 w-5 shrink-0" />
      <p className="text-sm font-medium">{success}</p>
    </div>
  );

  const labelCls = "block text-sm font-medium text-zinc-300";
  const categoryChip = "inline-flex shrink-0 items-center rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] font-medium text-zinc-300";

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6 pb-24 sm:pb-8">
      {/* Header */}
      <div className="min-w-0">
        <GoBackButton className="mb-3" />
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
            <Users className="h-5 w-5" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
            {t("Visitor Management")}
          </h1>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          {t("Manual registration and monitoring of campus visitors")}
        </p>
      </div>

      {/* Tabs */}
      <div
        className="grid w-full grid-cols-3 gap-1 rounded-[22px] border border-zinc-800 bg-zinc-950 p-1"
        role="tablist"
        aria-label={t("Visitor Management")}
      >
        {(
          [
            ["REGISTER", t("New Entry Form"), <UserPlus key="i" className="h-4 w-4 shrink-0" />],
            ["INSIDE", t("Active Inside"), <MapPin key="i" className="h-4 w-4 shrink-0" />],
            ["HISTORY", t("Entry/Exit Log"), <History key="i" className="h-4 w-4 shrink-0" />],
          ] as const
        ).map(([tab, label, icon]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-[18px] px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium leading-tight transition-colors ${
              activeTab === tab ? "bg-zinc-900 text-zinc-100 shadow-card" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <span className="hidden sm:inline-flex">{icon}</span>
            <span className="min-w-0 text-center break-words">{label}</span>
            {tab === "INSIDE" && (
              <span
                className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                  activeTab === tab ? "bg-orange-600 text-white" : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                }`}
              >
                {inside.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Messages (the form shows its own, next to the submit button) */}
      {activeTab !== "REGISTER" && (errorAlert || successAlert) && (
        <div className="space-y-3">
          {errorAlert}
          {successAlert}
        </div>
      )}

      {/* Search (filters the two lists) */}
      {activeTab !== "REGISTER" && (
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            placeholder={t("Search visitors...")}
            aria-label={t("Search visitors...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-11 pr-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
          />
        </div>
      )}

      {/* Register Tab */}
      {activeTab === "REGISTER" && (
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-zinc-100">{t("Manual Registration")}</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">{t("Register a new visitor.")}</p>
                </div>

                {/* Photo Capture (mandatory) */}
                <div className="space-y-2">
                  <p className={labelCls}>
                    {t("Visitor Photo")} <span className="text-orange-400">*</span>
                  </p>
                  {photo ? (
                    <div className="flex items-center gap-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                      <img src={photo} alt="Captured" className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
                      <div className="min-w-0 space-y-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          {t("Photo Captured")}
                        </p>
                        <label
                          htmlFor="photo-upload"
                          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-950"
                        >
                          <RotateCcw className="h-4 w-4" />
                          {t("Retake Photo")}
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="photo-upload"
                      className="flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-dashed border-orange-500/40 bg-orange-500/5 px-4 py-7 text-center transition-colors hover:bg-orange-500/10 active:bg-orange-500/10"
                    >
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 text-white">
                        <Camera className="h-7 w-7" />
                      </span>
                      <span className="text-base font-medium text-zinc-100">{t("Take Photo")}</span>
                      <span className="text-xs text-zinc-500">
                        {t("Capture the visitor's face with the device camera.")}
                      </span>
                    </label>
                  )}
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoCapture}
                  />
                </div>

                {/* Who */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="visitor-name" className={labelCls}>
                      {t("Full Name")} <span className="text-orange-400">*</span>
                    </label>
                    <Input id="visitor-name" required autoComplete="off" autoCapitalize="words" placeholder={t("Enter full name")} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="text-base sm:text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="visitor-phone" className={labelCls}>
                      {t("Phone Number")} <span className="text-orange-400">*</span>
                    </label>
                    <Input id="visitor-phone" required type="tel" inputMode="tel" autoComplete="off" maxLength={15} placeholder={t("Enter phone")} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="text-base sm:text-sm" />
                  </div>
                </div>

                {/* Category: one tap */}
                <div className="space-y-1.5">
                  <p id="visitor-category" className={labelCls}>{t("Category")}</p>
                  <div role="radiogroup" aria-labelledby="visitor-category" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {(
                      [
                        ["GUEST", t("Guest / Visitor")],
                        ["PARENT", t("Parent / Guardian")],
                        ["VENDOR", t("Vendor / Delivery")],
                        ["WORKER", t("Worker / Staff")],
                      ] as const
                    ).map(([value, label]) => {
                      const selected = formData.category === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setFormData({...formData, category: value})}
                          className={`flex min-h-14 items-center justify-center rounded-2xl border px-3 py-2 text-center text-sm font-medium leading-snug transition-colors ${
                            selected
                              ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                              : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="visitor-purpose" className={labelCls}>{t("Reason / Purpose of Visit")}</label>
                  <Input
                    id="visitor-purpose"
                    list="purpose-options"
                    placeholder={t("Type or select a reason")}
                    value={formData.purpose}
                    onChange={e => setFormData({...formData, purpose: e.target.value})}
                    className="text-base sm:text-sm"
                  />
                  <datalist id="purpose-options">
                    <option value="Meeting" />
                    <option value="Delivery" />
                    <option value="Maintenance / Repair" />
                    <option value="Parent Visit" />
                    <option value="Event" />
                    <option value="Interview" />
                    <option value="Other" />
                  </datalist>
                </div>

                {/* Other (optional) details */}
                <div className="space-y-4 border-t border-zinc-800/70 pt-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t("More details (optional)")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="visitor-visiting" className={labelCls}>{t("Person to Visit")}</label>
                      <Input id="visitor-visiting" placeholder={t("Name or Roll No of the person")} value={formData.visitingStudent} onChange={e => setFormData({...formData, visitingStudent: e.target.value})} className="text-base sm:text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="visitor-department" className={labelCls}>{t("Department")}</label>
                      <Input id="visitor-department" placeholder={t("Department being visited")} value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="text-base sm:text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="visitor-vehicle" className={labelCls}>{t("Vehicle Number")}</label>
                      <Input id="visitor-vehicle" placeholder={t("E.g., TS 09 EA 1234")} value={formData.vehicleNumber} onChange={e => setFormData({...formData, vehicleNumber: e.target.value})} className="text-base sm:text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="visitor-address" className={labelCls}>{t("Address")}</label>
                      <Input id="visitor-address" placeholder={t("Visitor's address")} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="text-base sm:text-sm" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label htmlFor="visitor-remarks" className={labelCls}>{t("Remarks")}</label>
                      <Input id="visitor-remarks" placeholder={t("Any notes")} value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} className="text-base sm:text-sm" />
                    </div>
                  </div>
                </div>

                <LiveDateTime />

                {errorAlert}
                {successAlert}

                <Button type="submit" className="h-14 w-full whitespace-normal text-center text-base leading-tight" size="lg" disabled={loading}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
                  {loading ? t("Registering…") : t("Complete Registration & Allow Entry")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Inside Tab */}
      {activeTab === "INSIDE" && (
        <>
          <Card className="overflow-hidden">
            {paginatedInside.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
                  <Users className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-zinc-300">{t("No active visitors inside campus")}</p>
                <p className="text-xs text-zinc-500">
                  {searchQuery ? t("No active visitors match your search.") : t("Visitors currently on campus will appear here.")}
                </p>
              </div>
            ) : (
              <>
                {/* Phones: stacked rows with a big Mark Exited button */}
                <ul className={`sm:hidden ${dt.mobileList}`}>
                  {paginatedInside.map((person) => (
                    <li key={person.id} className="space-y-3 px-4 py-4">
                      <button
                        type="button"
                        onClick={() => openOutsiderDetails(person)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <PersonCell
                          className="flex-1"
                          name={person.name || "—"}
                          sub={[person.phone, person.purpose].filter(Boolean).join(" · ")}
                        />
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-medium text-zinc-100 tabular-nums">{formatTime(person.entryTime)}</span>
                          <span className={categoryChip}>{t(person.category)}</span>
                        </span>
                      </button>
                      <Button
                        variant="outline"
                        className="h-12 w-full"
                        onClick={(e) => { e.stopPropagation(); handleMarkExited(person.id); }}
                      >
                        <LogOut className="h-4 w-4" />
                        {t("Mark Exited")}
                      </Button>
                    </li>
                  ))}
                </ul>

                {/* Tablet & up: table */}
                <div className={`hidden sm:block ${dt.wrap}`}>
                  <table className={dt.table}>
                    <thead>
                      <tr>
                        <th className={dt.th}>{t("Name & Phone")}</th>
                        <th className={dt.th}>{t("Category / Purpose")}</th>
                        <th className={dt.th}>{t("Entry Time")}</th>
                        <th className={dt.thRight}>{t("Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedInside.map((person) => (
                        <tr key={person.id} className={dt.trClickable} onClick={() => openOutsiderDetails(person)}>
                          <td className={dt.td}>
                            <PersonCell name={person.name || "—"} sub={person.phone} />
                          </td>
                          <td className={dt.td}>
                            <span className={categoryChip}>{t(person.category)}</span>
                            <p className="mt-1 max-w-[220px] truncate text-xs text-zinc-500">{person.purpose}</p>
                          </td>
                          <td className={dt.td}>
                            <span className="font-medium text-zinc-200 tabular-nums">{formatTime(person.entryTime)}</span>
                          </td>
                          <td className={dt.tdActions}>
                            <RowActions>
                              <IconAction
                                label={t("Mark Exited")}
                                icon={<LogOut />}
                                onClick={() => handleMarkExited(person.id)}
                              />
                            </RowActions>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
          <PagerBar page={page} pageSize={ITEMS_PER_PAGE} total={filteredInside.length} onPageChange={setPage} itemLabel={t("visitors")} />
        </>
      )}

      {/* History Tab */}
      {activeTab === "HISTORY" && (
        <>
          <Card className="overflow-hidden">
            {paginatedHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
                  <History className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-zinc-300">{t("No visitor logs found")}</p>
                <p className="text-xs text-zinc-500">
                  {searchQuery ? t("No records match your search query.") : t("Past visitor entries and exits will appear here.")}
                </p>
              </div>
            ) : (
              <>
                {/* Phones: stacked rows */}
                <ul className={`sm:hidden ${dt.mobileList}`}>
                  {paginatedHistory.map((mov: any) => (
                    <li key={mov.id}>
                      <button
                        type="button"
                        onClick={() => openOutsiderDetails(mov)}
                        className="w-full space-y-2.5 px-4 py-4 text-left transition-colors hover:bg-zinc-950/70"
                      >
                        <div className="flex items-center gap-3">
                          <PersonCell
                            className="flex-1"
                            name={mov.name || "—"}
                            sub={[mov.phone, t(mov.category)].filter(Boolean).join(" · ")}
                          />
                          <StatusBadge status={mov.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 pl-[52px] text-xs">
                          <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Entry Time")}</div>
                            <div className="text-zinc-200 tabular-nums">{formatDateTime(new Date(mov.entryTime))}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Exit Time")}</div>
                            <div className="text-zinc-200 tabular-nums">{mov.exitTime ? formatDateTime(new Date(mov.exitTime)) : "-"}</div>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Tablet & up: table */}
                <div className={`hidden sm:block ${dt.wrap}`}>
                  <table className={dt.table}>
                    <thead>
                      <tr>
                        <th className={dt.th}>{t("Name & Phone")}</th>
                        <th className={dt.th}>{t("Category / Purpose")}</th>
                        <th className={dt.th}>{t("Entry Time")}</th>
                        <th className={dt.th}>{t("Exit Time")}</th>
                        <th className={dt.thRight}>{t("Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedHistory.map((mov: any) => (
                        <tr key={mov.id} className={dt.trClickable} onClick={() => openOutsiderDetails(mov)}>
                          <td className={dt.td}>
                            <PersonCell name={mov.name || "—"} sub={mov.phone} />
                          </td>
                          <td className={dt.td}>
                            <span className="font-medium text-zinc-200">{t(mov.category)}</span>
                            <p className="mt-0.5 max-w-[220px] truncate text-xs text-zinc-500">{mov.purpose}</p>
                          </td>
                          <td className={dt.td}>
                            <span className="tabular-nums">{formatDateTime(new Date(mov.entryTime))}</span>
                          </td>
                          <td className={dt.td}>
                            <span className="tabular-nums">{mov.exitTime ? formatDateTime(new Date(mov.exitTime)) : "-"}</span>
                          </td>
                          <td className={`${dt.tdActions}`}>
                            <StatusBadge status={mov.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
          <PagerBar page={page} pageSize={ITEMS_PER_PAGE} total={filteredHistory.length} onPageChange={setPage} itemLabel={t("records")} />
        </>
      )}

      {/* Visitor Details Modal */}
      <Modal
        open={!!selectedOutsider}
        onClose={() => setSelectedOutsider(null)}
        title={t("Visitor Details")}
      >
        {selectedOutsider && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                {selectedOutsider.photoUrl ? (
                  photoUrl ? (
                    <img src={photoUrl} alt="Visitor" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full animate-pulse items-center justify-center bg-zinc-950">
                      <span className="text-xs text-zinc-500">{t("Loading…")}</span>
                    </div>
                  )
                ) : (
                  <Users className="h-8 w-8 text-zinc-600" />
                )}
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <div className="mb-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h3 className="text-xl font-medium text-zinc-100 break-words">{selectedOutsider.name}</h3>
                  <StatusBadge status={selectedOutsider.status} />
                </div>
                <p className="mb-3 text-zinc-400 tabular-nums">{selectedOutsider.phone}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className={categoryChip}>{t(selectedOutsider.category)}</span>
                  {selectedOutsider.vehicleNumber && (
                    <span className={categoryChip}>
                      {t("Vehicle")}: {selectedOutsider.vehicleNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0 rounded-2xl bg-zinc-950 px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Purpose of Visit")}</dt>
                <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedOutsider.purpose}</dd>
              </div>
              <div className="min-w-0 rounded-2xl bg-zinc-950 px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Person to Visit")}</dt>
                <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedOutsider.visitingStudent || "N/A"}</dd>
              </div>
              {selectedOutsider.department && (
                <div className="min-w-0 rounded-2xl bg-zinc-950 px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Department")}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedOutsider.department}</dd>
                </div>
              )}
              {selectedOutsider.address && (
                <div className="min-w-0 rounded-2xl bg-zinc-950 px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Address")}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedOutsider.address}</dd>
                </div>
              )}
              {selectedOutsider.remarks && (
                <div className="min-w-0 rounded-2xl bg-zinc-950 px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Remarks")}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedOutsider.remarks}</dd>
                </div>
              )}
              {selectedOutsider.recordedByName && (
                <div className="min-w-0 rounded-2xl bg-zinc-950 px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Registered by")}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-200 break-words">{selectedOutsider.recordedByName}</dd>
                </div>
              )}
            </dl>

            <div className="flex flex-col sm:flex-row justify-between gap-4 rounded-2xl border border-zinc-800 px-4 py-3">
              <div>
                <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-zinc-500">
                  <MapPin className="h-3 w-3" /> {t("Entry Details")}
                </p>
                <p className="text-sm font-medium text-zinc-200 tabular-nums">
                  {formatDateTime(new Date(selectedOutsider.entryTime))}
                </p>
              </div>
              {selectedOutsider.exitTime && (
                <div className="text-left sm:text-right">
                  <p className="mb-1 flex items-center sm:justify-end gap-1 text-[11px] uppercase tracking-wider text-zinc-500">
                    <History className="h-3 w-3" /> {t("Exit Details")}
                  </p>
                  <p className="text-sm font-medium text-zinc-200 tabular-nums">
                    {formatDateTime(new Date(selectedOutsider.exitTime))}
                  </p>
                </div>
              )}
            </div>

            {selectedOutsider.status === "INSIDE" && (
              <Button
                className="h-12 w-full"
                onClick={() => {
                  handleMarkExited(selectedOutsider.id);
                  setSelectedOutsider(null);
                }}
              >
                <LogOut className="h-4 w-4" />
                {t("Mark as Exited Now")}
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );

}

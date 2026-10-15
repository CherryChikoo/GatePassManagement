"use client";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatTime } from "@/lib/utils";
import {
  Users,
  UserPlus,
  History,
  MapPin,
  LogOut,
  Camera,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { registerOutsider, markOutsiderExited } from "@/server/actions/outsiders";
import { uploadOutsiderPhoto } from "@/lib/storage/image-upload";
import { useRouter } from "next/navigation";
import { Modal, StatusBadge } from "@/components/ui/primitives";
import { getExitPhotoUrl } from "@/lib/storage/image-upload";
import { BackButton } from "@/components/ui/back-button";
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
      // Photo is optional for visitors; upload only if one was taken
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
        setSuccess(t("Visitor registered successfully!")); setTimeout(() => setSuccess(null), 3000);
        setFormData({
          name: "", phone: "", category: "GUEST", purpose: "", visitingStudent: "", gate: "", vehicleNumber: "", entryTime: "",
          address: "", department: "", remarks: "",
        });
        setPhoto(null);
        setActiveTab("INSIDE");
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

  const renderPagination = (totalItems: number) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const startItem = totalItems === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(page * ITEMS_PER_PAGE, totalItems);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800/40 px-4 sm:px-6 py-3.5 bg-zinc-950/40 rounded-b-xl">
        <p className="text-xs sm:text-sm text-zinc-400">
          {t("Showing {from}–{to} of {total} results", { from: startItem, to: endItem, total: totalItems })}
        </p>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t("Previous")}</span>
          </Button>

          {totalPages > 1 ? (
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((pNum) => {
                  if (totalPages <= 5) return true;
                  if (pNum === 1 || pNum === totalPages) return true;
                  return Math.abs(pNum - page) <= 1;
                })
                .map((pNum, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && pNum - prev > 1;
                  return (
                    <span key={pNum} className="flex items-center">
                      {showEllipsis && <span className="px-1 text-zinc-600 text-xs">...</span>}
                      <button
                        type="button"
                        onClick={() => setPage(pNum)}
                        className={`h-8 min-w-[2rem] px-2 rounded-md text-xs font-medium transition-colors ${
                          page === pNum
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                        }`}
                      >
                        {pNum}
                      </button>
                    </span>
                  );
                })}
            </div>
          ) : (
            <span className="text-xs text-zinc-500 px-2">{t("Page {page} of {pages}", { page: 1, pages: 1 })}</span>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || totalPages === 0}
          >
            <span className="hidden sm:inline">{t("Next")}</span>
            <ChevronRight className="h-4 w-4 sm:ml-1" />
          </Button>
        </div>
      </div>
    );
  };

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


  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_15px_-3px_rgba(239,68,68,0.1)] max-w-2xl">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_-3px_rgba(16,185,129,0.1)] max-w-2xl">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}

      
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <BackButton href="/security" label={t("Back to Dashboard")} />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-2">
            {t("Visitor Management")}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {t("Manual registration and monitoring of campus visitors")}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input 
            type="search" 
            placeholder={t("Search visitors...")} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 bg-zinc-900/50"
          />
        </div>
      </div>


      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-zinc-800/50">
        <button
          onClick={() => setActiveTab("REGISTER")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "REGISTER" 
              ? "border-orange-500 text-orange-400" 
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          {t("New Entry Form")}
        </button>
        <button
          onClick={() => setActiveTab("INSIDE")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "INSIDE" 
              ? "border-amber-500 text-amber-400" 
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <MapPin className="h-4 w-4" />
          {t("Active Inside")}
          <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-xs">
            {inside.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("HISTORY")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "HISTORY" 
              ? "border-zinc-100 text-zinc-100" 
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <History className="h-4 w-4" />
          {t("Entry/Exit Log")}
        </button>
      </div>

      {/* Register Tab */}
      {activeTab === "REGISTER" && (
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>{t("Manual Registration")}</CardTitle>
              <CardDescription>{t("Register a new visitor.")}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_15px_-3px_rgba(239,68,68,0.1)]">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}
                {success && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_-3px_rgba(16,185,129,0.1)]">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{success}</p>
                  </div>
                )}

                
                {/* Photo Capture */}
                <div className="space-y-3">
                  <label className="text-sm font-medium leading-none text-zinc-200">{t("Visitor Photo (Optional)")}</label>
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <div className="relative h-32 w-32 shrink-0 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 flex flex-col items-center justify-center overflow-hidden">
                      {photo ? (
                        <img src={photo} alt="Captured" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="h-8 w-8 text-zinc-500 mb-2" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label htmlFor="photo-upload" className="cursor-pointer inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        <Upload className="h-4 w-4" />
                        {photo ? t("Retake Photo") : t("Take Photo")}
                      </label>
                      <input 
                        id="photo-upload"
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        onChange={handlePhotoCapture}
                      />
                      <p className="text-xs text-zinc-500">
                        Capture the visitor&apos;s face with the device camera.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Full Name")} <span className="text-orange-400">*</span></label>
                    <Input required placeholder={t("Enter full name")} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Phone Number")} <span className="text-orange-400">*</span></label>
                    <Input required type="tel" maxLength={15} placeholder={t("Enter phone")} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Category")}</label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-100 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={formData.category} 
                      onChange={e => setFormData({...formData, category: e.target.value})}
                    >
                      
                      <option className="bg-zinc-900 text-zinc-100" value="GUEST">{t("Guest / Visitor")}</option>
                      <option className="bg-zinc-900 text-zinc-100" value="PARENT">{t("Parent / Guardian")}</option>
                      <option className="bg-zinc-900 text-zinc-100" value="VENDOR">{t("Vendor / Delivery")}</option>
                      <option className="bg-zinc-900 text-zinc-100" value="WORKER">{t("Worker / Staff")}</option>

                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Reason / Purpose of Visit")}</label>
                    <Input 
                      list="purpose-options"
                      placeholder={t("Type or select a reason")} 
                      value={formData.purpose} 
                      onChange={e => setFormData({...formData, purpose: e.target.value})} 
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

                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Person to Visit")}</label>
                    <Input placeholder={t("Name or Roll No of the person")} value={formData.visitingStudent} onChange={e => setFormData({...formData, visitingStudent: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Department")}</label>
                    <Input placeholder={t("Department being visited")} value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Address")}</label>
                    <Input placeholder={t("Visitor's address")} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Vehicle Number")}</label>
                    <Input placeholder={t("E.g., TS 09 EA 1234")} value={formData.vehicleNumber} onChange={e => setFormData({...formData, vehicleNumber: e.target.value})} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">{t("Remarks")}</label>
                    <Input placeholder={t("Any notes")} value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} />
                  </div>
                </div>

                
                
                
                
                
                <LiveDateTime />

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? t("Registering…") : t("Complete Registration & Allow Entry")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      
      {/* Inside Tab */}
      {activeTab === "INSIDE" && (
        <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[550px] text-sm text-left">
              <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-4 font-medium">{t("Name & Phone")}</th>
                  <th className="px-6 py-4 font-medium">{t("Category / Purpose")}</th>
                  <th className="px-6 py-4 font-medium">{t("Entry Time")}</th>
                  <th className="px-6 py-4 font-medium text-right">{t("Action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {paginatedInside.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="h-8 w-8 text-zinc-700 mb-1" />
                        <p className="font-medium text-zinc-400">{t("No active visitors inside campus")}</p>
                        <p className="text-xs text-zinc-600">
                          {searchQuery ? t("No active visitors match your search.") : t("Visitors currently on campus will appear here.")}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedInside.map((person) => (
                    <tr 
                      key={person.id} 
                      className="table-row-hover cursor-pointer"
                      onClick={() => openOutsiderDetails(person)}
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-zinc-100">{person.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{person.phone}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 mb-1">
                          {t(person.category)}
                        </span>
                        <p className="text-xs text-zinc-400 truncate max-w-[200px]">{person.purpose}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-zinc-300 font-medium">
                          {formatTime(person.entryTime)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="border-zinc-700 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50"
                          onClick={(e) => { e.stopPropagation(); handleMarkExited(person.id); }}
                        >
                          <LogOut className="h-3 w-3 mr-1.5" />
                          {t("Mark Exited")}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {renderPagination(filteredInside.length)}
        </Card>
      )}


      
      {/* History Tab */}
      {activeTab === "HISTORY" && (
        <Card className="border-zinc-800 bg-zinc-900/60 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm text-left">
              <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-4 font-medium">{t("Name & Phone")}</th>
                  <th className="px-6 py-4 font-medium">{t("Category / Purpose")}</th>
                  <th className="px-6 py-4 font-medium">{t("Entry Time")}</th>
                  <th className="px-6 py-4 font-medium">{t("Exit Time")}</th>
                  <th className="px-6 py-4 font-medium text-right">{t("Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {paginatedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <History className="h-8 w-8 text-zinc-700 mb-1" />
                        <p className="font-medium text-zinc-400">{t("No visitor logs found")}</p>
                        <p className="text-xs text-zinc-600">
                          {searchQuery ? t("No records match your search query.") : t("Past visitor entries and exits will appear here.")}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((mov: any) => (
                    <tr 
                      key={mov.id} 
                      className="table-row-hover cursor-pointer"
                      onClick={() => openOutsiderDetails(mov)}
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-zinc-100">{mov.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{mov.phone}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-zinc-300 font-medium">{t(mov.category)}</span>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[200px]">{mov.purpose}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-zinc-300">
                          {formatDateTime(new Date(mov.entryTime))}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-zinc-300">
                          {mov.exitTime ? formatDateTime(new Date(mov.exitTime)) : "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <StatusBadge status={mov.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {renderPagination(filteredHistory.length)}
        </Card>
      )}


    
      {/* Visitor Details Modal */}
      <Modal
        open={!!selectedOutsider}
        onClose={() => setSelectedOutsider(null)}
        title={t("Visitor Details")}
      >
        {selectedOutsider && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-center">
                {selectedOutsider.photoUrl ? (
                  photoUrl ? (
                    <img src={photoUrl} alt="Visitor" className="h-full w-full object-cover" />
                  ) : (
                    <div className="animate-pulse bg-zinc-800 h-full w-full flex items-center justify-center">
                      <span className="text-xs text-zinc-500">{t("Loading…")}</span>
                    </div>
                  )
                ) : (
                  <Users className="h-8 w-8 text-zinc-700" />
                )}
              </div>
              <div className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <h3 className="text-xl font-bold text-zinc-100">{selectedOutsider.name}</h3>
                  <StatusBadge status={selectedOutsider.status} />
                </div>
                <p className="text-zinc-400 font-medium mb-3">{selectedOutsider.phone}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-700">
                    {t(selectedOutsider.category)}
                  </span>
                  {selectedOutsider.vehicleNumber && (
                    <span className="px-2.5 py-1 rounded-md bg-zinc-800/50 text-zinc-400 text-xs font-medium border border-zinc-800">
                      Vehicle: {selectedOutsider.vehicleNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40">
                <p className="text-xs font-medium text-zinc-500 mb-1">{t("Purpose of Visit")}</p>
                <p className="text-sm text-zinc-200">{selectedOutsider.purpose}</p>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40">
                <p className="text-xs font-medium text-zinc-500 mb-1">{t("Person to Visit")}</p>
                <p className="text-sm text-zinc-200">{selectedOutsider.visitingStudent || "N/A"}</p>
              </div>
              {selectedOutsider.department && (
                <div className="p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40">
                  <p className="text-xs font-medium text-zinc-500 mb-1">{t("Department")}</p>
                  <p className="text-sm text-zinc-200">{selectedOutsider.department}</p>
                </div>
              )}
              {selectedOutsider.address && (
                <div className="p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40">
                  <p className="text-xs font-medium text-zinc-500 mb-1">{t("Address")}</p>
                  <p className="text-sm text-zinc-200">{selectedOutsider.address}</p>
                </div>
              )}
              {selectedOutsider.remarks && (
                <div className="p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40 sm:col-span-2">
                  <p className="text-xs font-medium text-zinc-500 mb-1">{t("Remarks")}</p>
                  <p className="text-sm text-zinc-200">{selectedOutsider.remarks}</p>
                </div>
              )}
              {selectedOutsider.recordedByName && (
                <div className="p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40 sm:col-span-2">
                  <p className="text-xs font-medium text-zinc-500 mb-1">{t("Registered by")}</p>
                  <p className="text-sm text-zinc-200">{selectedOutsider.recordedByName}</p>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col sm:flex-row gap-4 justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Entry Details
                </p>
                <p className="text-sm text-zinc-200 font-medium">
                  {formatDateTime(new Date(selectedOutsider.entryTime))}
                </p>
              </div>
              {selectedOutsider.exitTime && (
                <div className="text-left sm:text-right">
                  <p className="text-xs font-medium text-zinc-500 mb-1 flex items-center sm:justify-end gap-1">
                    <History className="h-3 w-3" /> Exit Details
                  </p>
                  <p className="text-sm text-zinc-200 font-medium">
                    {formatDateTime(new Date(selectedOutsider.exitTime))}
                  </p>
                </div>
              )}
            </div>

            {selectedOutsider.status === "INSIDE" && (
              <div className="pt-2 border-t border-zinc-800/50">
                <Button 
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium"
                  onClick={() => {
                    handleMarkExited(selectedOutsider.id);
                    setSelectedOutsider(null);
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {t("Mark as Exited Now")}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );

}
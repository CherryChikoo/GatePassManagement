"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
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

interface Props {
  user: any;
  inside: any[];
  history: any[];
}

export function OutsidersClient({ user, inside, history }: Props) {
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
  
  // 12-hour time state
  const now = new Date();
  let currentHour = now.getHours();
  const currentMinute = now.getMinutes().toString().padStart(2, '0');
  const period = currentHour >= 12 ? 'PM' : 'AM';
  currentHour = currentHour % 12 || 12;
  const [time12h, setTime12h] = useState({
    hour: currentHour.toString().padStart(2, '0'),
    minute: currentMinute,
    period: period
  });

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    category: "GUEST",
    purpose: "",
    visitingStudent: "",
    gate: "",
    vehicleNumber: "",
    entryTime: "",
  });
  const [photo, setPhoto] = useState<string | null>(null);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB"); setTimeout(() => setError(null), 3000);
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
    if (!photo) {
      setError("Photo is required for outsider registration"); setTimeout(() => setError(null), 3000);
      return;
    }

    setLoading(true);
    try {
      
      const { path, error } = await uploadOutsiderPhoto(photo, formData.name);
      
      if (error || !path) {
        setError("Photo upload failed: " + error); setTimeout(() => setError(null), 3000);
        setLoading(false);
        return;
      }

      
      const now = new Date();
      let hours24 = parseInt(time12h.hour);
      if (time12h.period === "PM" && hours24 !== 12) hours24 += 12;
      if (time12h.period === "AM" && hours24 === 12) hours24 = 0;
      now.setHours(hours24, parseInt(time12h.minute), 0, 0);
      
      const result = await registerOutsider({ ...formData, photoUrl: path, entryTime: now.toISOString() });
      
      if (result.success) {
        setSuccess("Outsider registered successfully!"); setTimeout(() => setSuccess(null), 3000);
        setFormData({
          name: "", phone: "", category: "GUEST", purpose: "", visitingStudent: "", gate: "", vehicleNumber: "", entryTime: new Date().toTimeString().slice(0, 5)
        });
        setPhoto(null);
        setActiveTab("INSIDE");
        router.refresh();
      } else {
        setError(result.error || "Failed to register"); setTimeout(() => setError(null), 3000);
      }
    } catch (err: any) {
      setError(err.message); setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkExited = async (id: string) => {
    
    const res = await markOutsiderExited(id);
    if (res.success) {
      setSuccess("Marked as exited"); setTimeout(() => setSuccess(null), 3000);
      router.refresh();
    } else {
      setError(res.error || "Failed to mark exited"); setTimeout(() => setError(null), 3000);
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
          Showing <span className="font-semibold text-zinc-200">{startItem}</span> to{" "}
          <span className="font-semibold text-zinc-200">{endItem}</span> of{" "}
          <span className="font-semibold text-zinc-200">{totalItems}</span> results
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
            <span className="hidden sm:inline">Previous</span>
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
            <span className="text-xs text-zinc-500 px-2">Page 1 of 1</span>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || totalPages === 0}
          >
            <span className="hidden sm:inline">Next</span>
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
          <BackButton href="/security" label="Back to Dashboard" />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-2">
            Outsider Management
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manual registration and monitoring of campus visitors
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input 
            type="search" 
            placeholder="Search outsiders..." 
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
          New Entry Form
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
          Active Inside
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
          Entry/Exit Log
        </button>
      </div>

      {/* Register Tab */}
      {activeTab === "REGISTER" && (
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Manual Registration</CardTitle>
              <CardDescription>Register a new outsider entry. Photo is mandatory.</CardDescription>
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
                  <label className="text-sm font-medium leading-none text-zinc-200">Outsider Photo (Required)</label>
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
                        {photo ? "Retake Photo" : "Take Photo"}
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
                        Use device camera to capture face clearly. Entry is not permitted without a photo.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">Full Name *</label>
                    <Input required placeholder="Enter full name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">Phone Number *</label>
                    <Input required placeholder="Enter phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">Category</label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-100 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={formData.category} 
                      onChange={e => setFormData({...formData, category: e.target.value})}
                    >
                      
                      <option className="bg-zinc-900 text-zinc-100" value="GUEST">Guest / Visitor</option>
                      <option className="bg-zinc-900 text-zinc-100" value="PARENT">Parent / Guardian</option>
                      <option className="bg-zinc-900 text-zinc-100" value="VENDOR">Vendor / Delivery</option>
                      <option className="bg-zinc-900 text-zinc-100" value="WORKER">Worker / Staff</option>

                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">Reason / Purpose of Visit *</label>
                    <Input 
                      required 
                      list="purpose-options"
                      placeholder="Type or select a reason" 
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
                    <label className="text-sm font-medium leading-none text-zinc-200">Visiting Student/Staff (Optional)</label>
                    <Input placeholder="Roll No or Name" value={formData.visitingStudent} onChange={e => setFormData({...formData, visitingStudent: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-zinc-200">Vehicle Number (Optional)</label>
                    <Input placeholder="E.g., TS 09 EA 1234" value={formData.vehicleNumber} onChange={e => setFormData({...formData, vehicleNumber: e.target.value})} />
                  </div>
                </div>

                
                
                
                
                
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none text-zinc-200">Entry Time (Date is fixed)</label>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="flex h-10 items-center rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm text-zinc-400 font-medium shadow-sm">
                      {formatDateTime(new Date()).split(',')[0]}
                    </div>
                    <div className="flex items-center h-10 rounded-md border border-input bg-zinc-900/50 px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                      <select 
                        value={time12h.hour} 
                        onChange={e => setTime12h({...time12h, hour: e.target.value})}
                        className="bg-transparent border-none text-zinc-100 focus:outline-none appearance-none text-center w-8 cursor-pointer"
                      >
                        {Array.from({length: 12}, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => (
                          <option key={h} className="bg-zinc-900" value={h}>{h}</option>
                        ))}
                      </select>
                      <span className="text-zinc-500 font-bold mx-1">:</span>
                      <select 
                        value={time12h.minute} 
                        onChange={e => setTime12h({...time12h, minute: e.target.value})}
                        className="bg-transparent border-none text-zinc-100 focus:outline-none appearance-none text-center w-8 cursor-pointer"
                      >
                        {Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0')).map(m => (
                          <option key={m} className="bg-zinc-900" value={m}>{m}</option>
                        ))}
                      </select>
                      <select 
                        value={time12h.period} 
                        onChange={e => setTime12h({...time12h, period: e.target.value})}
                        className="bg-transparent border-none text-zinc-100 focus:outline-none appearance-none ml-2 font-medium cursor-pointer"
                      >
                        <option className="bg-zinc-900" value="AM">AM</option>
                        <option className="bg-zinc-900" value="PM">PM</option>
                      </select>
                    </div>
                  </div>
                </div>






                <Button type="submit" className="w-full" size="lg" disabled={loading || !photo}>
                  {loading ? "Registering..." : "Complete Registration & Allow Entry"}
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
                  <th className="px-6 py-4 font-medium">Name & Phone</th>
                  <th className="px-6 py-4 font-medium">Category / Purpose</th>
                  <th className="px-6 py-4 font-medium">Entry Time</th>
                  <th className="px-6 py-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {paginatedInside.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="h-8 w-8 text-zinc-700 mb-1" />
                        <p className="font-medium text-zinc-400">No active visitors inside campus</p>
                        <p className="text-xs text-zinc-600">
                          {searchQuery ? "No active visitors match your search." : "Visitors currently on campus will appear here."}
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
                          {person.category}
                        </span>
                        <p className="text-xs text-zinc-400 truncate max-w-[200px]">{person.purpose}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-zinc-300 font-medium">
                          {new Date(person.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                          Mark Exited
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
                  <th className="px-6 py-4 font-medium">Name & Phone</th>
                  <th className="px-6 py-4 font-medium">Category / Purpose</th>
                  <th className="px-6 py-4 font-medium">Entry Time</th>
                  <th className="px-6 py-4 font-medium">Exit Time</th>
                  <th className="px-6 py-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {paginatedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <History className="h-8 w-8 text-zinc-700 mb-1" />
                        <p className="font-medium text-zinc-400">No visitor logs found</p>
                        <p className="text-xs text-zinc-600">
                          {searchQuery ? "No records match your search query." : "Past outsider entries and exits will appear here."}
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
                        <span className="text-zinc-300 font-medium">{mov.category}</span>
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


    
      {/* Outsider Details Modal */}
      <Modal
        open={!!selectedOutsider}
        onClose={() => setSelectedOutsider(null)}
        title="Outsider Details"
      >
        {selectedOutsider && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-center">
                {selectedOutsider.photoUrl ? (
                  photoUrl ? (
                    <img src={photoUrl} alt="Outsider" className="h-full w-full object-cover" />
                  ) : (
                    <div className="animate-pulse bg-zinc-800 h-full w-full flex items-center justify-center">
                      <span className="text-xs text-zinc-500">Loading...</span>
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
                    {selectedOutsider.category}
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
                <p className="text-xs font-medium text-zinc-500 mb-1">Purpose of Visit</p>
                <p className="text-sm text-zinc-200">{selectedOutsider.purpose}</p>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40">
                <p className="text-xs font-medium text-zinc-500 mb-1">Visiting Student/Staff</p>
                <p className="text-sm text-zinc-200">{selectedOutsider.visitingStudent || "N/A"}</p>
              </div>
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
                  Mark as Exited Now
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );

}
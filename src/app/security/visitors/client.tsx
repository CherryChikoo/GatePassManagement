"use client";
import { ThemedSelect } from "@/components/ui/themed-select";
import { DepartmentSelect } from "@/components/ui/department-select";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";

import { useState, useEffect, useRef } from "react";
import { VoicePanel, useVoiceFill } from "@/components/voice/voice-fill";
import { HostPicker } from "@/components/visits/host-picker";
import { VisitExitDialog } from "@/components/visits/visit-code";
import { VISITOR_SPEC_KEY, type VoiceFill } from "@/lib/voice/spec";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dt, PersonCell, RowActions, IconAction } from "@/components/ui/data-table";
import { PagerBar } from "@/components/ui/pager-bar";
import { formatDateTime, formatTime } from "@/lib/utils";
import {
  KeyRound,
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
  Phone,
  QrCode,
  PencilLine,
} from "lucide-react";
import { callGate } from "@/lib/gate-call";
import { useGateData } from "@/lib/gate-cache";
import { FactList, InOutCard } from "@/components/registers/record-layout";
import { OUTSIDERS_QUERY } from "@/lib/gate-queries";
import { DateField } from "@/components/ui/date-field";
import { LoadingPill } from "@/components/ui/loading-pill";
import { istDateString } from "@/lib/time/ist";
import { Modal, StatusBadge } from "@/components/ui/primitives";
import { BackButton } from "@/components/ui/back-button";
import { GoBackButton } from "@/components/ui/go-back-button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { LiveDateTime } from "@/components/registers/register-form";
import { HubBackButton, HubTiles, insideForLabel, useHubView, useMinuteClock } from "@/components/visits/hub-tiles";
import { CheckInQrScreen } from "@/components/visits/checkin-qr-screen";
import { ARRIVAL_COUNTS_QUERY } from "@/components/visits/arrival-alert";
import { useLiveTopics } from "@/lib/realtime/live";
import type { ArrivalCounts, StudentParents } from "@/server/actions/visit-requests";
import { ParentSearch, parentOf, type ParentWho } from "./parent-search";

/** Reasons in the Purpose dropdown (saved in English; shown in the guard's language) */
const VISIT_PURPOSES = ["Meeting", "Parent Visit", "Admission Enquiry", "Delivery", "Maintenance / Repair", "Event", "Interview"];
const OTHER_PURPOSE = "__other__";

/**
 * What was typed in the new-visitor form, kept for this browser tab until it is
 * saved: a mistaken Back loses nothing, and the form shows it again when it
 * opens. Removed on save and by "Clear form".
 */
const VISITOR_DRAFT_KEY = "gatepass:visitor-draft";
const VISITOR_DRAFT_MAX_AGE_MS = 12 * 60 * 60_000;
const EMPTY_VISITOR = {
  name: "", phone: "", category: "GUEST", purpose: "", visitingStudent: "", gate: "", vehicleNumber: "", entryTime: "",
  address: "", department: "", remarks: "", hostProfileId: "",
};
type VisitorDraft = { formData: typeof EMPTY_VISITOR; onFoot: boolean; purposeOther: boolean; photo: string | null; at: number };

function forgetVisitorDraft() {
  try {
    sessionStorage.removeItem(VISITOR_DRAFT_KEY);
  } catch {}
}

/** Screens behind the 4 buttons (?view=…); no view = the buttons */
const VIEWS = ["qr", "new", "inside", "log"] as const;
type View = (typeof VIEWS)[number];

/** Photo link could not be loaded (shown instead of "Loading…" forever) */
const PHOTO_FAILED = "__failed__";

export function OutsidersClient() {
  const t = useT();
  // Visitors on campus + today's exits: shown at once from the last load, fetched
  // again only when a visitor is registered / let out (live), at any gate
  const outsiders = useGateData<any>(OUTSIDERS_QUERY.key, OUTSIDERS_QUERY.fetch, OUTSIDERS_QUERY.topics);
  const inside: any[] = outsiders.data?.inside ?? [];
  /** Head Security: may let a visitor out without the meeting code */
  const canOverrideVisit = !!outsiders.data?.canOverrideVisit;
  // The 4 buttons (Show QR · Type it myself · Inside now · Old records); each opens its screen
  const { view, go, back } = useHubView(VIEWS);
  const formOpen = view === "new";
  const activeTab: "INSIDE" | "HISTORY" = view === "log" ? "HISTORY" : "INSIDE";
  const showList = view === "inside" || view === "log";
  // Visitors waiting at the gate after scanning the QR (shown on the Show QR button;
  // same cached copy as the arrival pop-up, so no extra request)
  const arrivals = useGateData<ArrivalCounts | { error: string }>(
    view === "hub" ? ARRIVAL_COUNTS_QUERY.key : null,
    ARRIVAL_COUNTS_QUERY.fetch,
    ARRIVAL_COUNTS_QUERY.topics
  );
  useLiveTopics(ARRIVAL_COUNTS_QUERY.topics, () => {}, view === "hub");
  const waiting = arrivals.data && "VISITORS" in arrivals.data ? arrivals.data.VISITORS : 0;
  // "Inside 2 h 10 min" moves on by itself, once a minute (no requests)
  const now = useMinuteClock(view === "inside");
  // The visitor just registered: highlighted at the top of the list for a moment
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 6000);
    return () => clearTimeout(timer);
  }, [highlightId]);
  const [searchQuery, setSearchQuery] = useState("");
  const openView = (v: View) => {
    setError(null);
    setSuccess(null);
    setSearchQuery("");
    go(v);
  };
  // Saved: the Inside now list, new visitor on top (Back still returns to the buttons)
  const closeForm = () => go("inside", { replace: true });
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
  
  // Purpose: "Other" picked (a box to type the reason)
  const [purposeOther, setPurposeOther] = useState(false);
  // Visitor on foot: no vehicle number needed
  const [onFoot, setOnFoot] = useState(false);
  // Bumped after each registration so the department picker clears too
  const [formNonce, setFormNonce] = useState(0);
  // hostProfileId: faculty / staff they came to meet (meeting code)
  const [formData, setFormData] = useState(EMPTY_VISITOR);

  // ── Voice filling ──────────────────────────────────────────
  // Fills empty boxes (or ones voice filled before) — never what the guard typed.
  const [voiceVals, setVoiceVals] = useState<Record<string, string>>({});
  const [deptVoiceNo, setDeptVoiceNo] = useState(0);
  const categoryTapped = useRef(false);
  const latestVisitor = useRef({ formData, onFoot, voiceVals });
  useEffect(() => {
    latestVisitor.current = { formData, onFoot, voiceVals };
  });
  const beforeVoice = useRef<{ formData: typeof formData; onFoot: boolean } | null>(null);
  const applyVoice = (fill: VoiceFill) => {
    const cur = latestVisitor.current;
    if (!beforeVoice.current) beforeVoice.current = { formData: cur.formData, onFoot: cur.onFoot };
    const next: Record<string, string> = { ...cur.formData };
    const set: Record<string, string> = {};
    for (const [k, raw] of Object.entries(fill.fields ?? {})) {
      if (k === "onFoot" || !(k in next)) continue;
      const v = k === "vehicleNumber" ? raw.toUpperCase() : raw;
      const now = String(next[k] ?? "");
      // "Guest" is only the starting choice: voice may change it until the guard taps a category
      const startingCategory = k === "category" && now === "GUEST" && !categoryTapped.current;
      if ((now !== "" && now !== cur.voiceVals[k] && !startingCategory) || now === v) continue;
      next[k] = v;
      set[k] = v;
    }
    if (Object.keys(set).length) {
      const vals = { ...cur.voiceVals, ...set };
      latestVisitor.current = { ...cur, formData: next as typeof formData, voiceVals: vals };
      setFormData(next as typeof formData);
      setVoiceVals(vals);
      if ("department" in set) setDeptVoiceNo((n) => n + 1);
    }
    if (fill.fields?.onFoot === "yes" && !cur.onFoot && !next.vehicleNumber) setOnFoot(true);
  };
  const voice = useVoiceFill({ form: VISITOR_SPEC_KEY, onFill: applyVoice });
  const resetVoice = () => {
    setVoiceVals({});
    beforeVoice.current = null;
    categoryTapped.current = false;
    voice.reset();
  };
  const undoVoice = () => {
    const b = beforeVoice.current;
    if (b) {
      setFormData(b.formData);
      setOnFoot(b.onFoot);
    }
    setDeptVoiceNo((n) => n + 1);
    resetVoice();
  };
  /** Highlight for a box filled by voice and not yet changed by the guard */
  const voiceRing = (k: keyof typeof formData) =>
    voiceVals[k] !== undefined && formData[k] === voiceVals[k] ? " ring-2 ring-amber-400/60" : "";

  // ── Parent of a student: picked from the box at the top, the form fills itself ──
  const [parentNote, setParentNote] = useState<string | null>(null);
  const fillFromParent = (s: StudentParents, who: ParentWho) => {
    const p = parentOf(s, who);
    if (!p) return;
    const vehicle = (s.parentVehicle ?? "").trim().toUpperCase();
    const walks = /^ON FOOT$/.test(vehicle);
    setFormData((f) => ({
      ...f,
      name: p.name,
      phone: p.phone,
      address: s.homeAddress?.trim() || f.address,
      // Their usual vehicle (the guard can change it, or tap No vehicle)
      vehicleNumber: vehicle && !walks ? vehicle : f.vehicleNumber,
      category: "PARENT",
      purpose: "Parent Visit",
      visitingStudent: `${s.name} (${s.roll})`,
      department: s.department ?? f.department,
    }));
    if (walks) setOnFoot(true);
    else if (vehicle) setOnFoot(false);
    categoryTapped.current = true;
    setPurposeOther(false);
    // The department picker shows the new value
    setDeptVoiceNo((n) => n + 1);
    const whoLabel = who === "FATHER" ? t("Father") : who === "MOTHER" ? t("Mother") : t("Guardian");
    setParentNote(t("Filled from {student}'s {who}. Check the details and take the photo.", { student: s.name, who: whoLabel }));
  };
  const [photo, setPhoto] = useState<string | null>(null);
  // The photo's upload, started when it is taken (see handlePhotoCapture)
  const photoUpload = useRef<{ data: string; promise: Promise<{ path: string | null; error: string | null }> } | null>(null);

  // ── Unsaved details kept for this tab (see VISITOR_DRAFT_KEY) ──
  const typedSomething =
    !!photo || onFoot || Object.entries(formData).some(([k, v]) => (k === "category" ? v !== "GUEST" : String(v ?? "").trim() !== ""));
  const [restoredDraft, setRestoredDraft] = useState(false);
  const draftChecked = useRef(false);
  // Opening the form: bring back what was typed before (read after the page is up, never while it is drawn on the server)
  useEffect(() => {
    if (!formOpen || draftChecked.current) return;
    draftChecked.current = true;
    let d: VisitorDraft | null = null;
    try {
      d = JSON.parse(sessionStorage.getItem(VISITOR_DRAFT_KEY) || "null");
    } catch {}
    if (!d || Date.now() - d.at > VISITOR_DRAFT_MAX_AGE_MS) return;
    setFormData({ ...EMPTY_VISITOR, ...d.formData });
    setOnFoot(!!d.onFoot);
    setPurposeOther(!!d.purposeOther);
    setPhoto(d.photo ?? null);
    setFormNonce((n) => n + 1);
    setRestoredDraft(true);
  }, [formOpen]);
  // Keep it while typing (after the check above, so an empty first render never wipes it)
  useEffect(() => {
    if (!formOpen || !draftChecked.current) return;
    try {
      if (typedSomething) {
        sessionStorage.setItem(VISITOR_DRAFT_KEY, JSON.stringify({ formData, onFoot, purposeOther, photo, at: Date.now() }));
      } else {
        sessionStorage.removeItem(VISITOR_DRAFT_KEY);
      }
    } catch {
      // A large photo can be over the browser's limit: keep the details without it
      try {
        sessionStorage.setItem(VISITOR_DRAFT_KEY, JSON.stringify({ formData, onFoot, purposeOther, photo: null, at: Date.now() }));
      } catch {}
    }
  }, [formOpen, typedSomething, formData, onFoot, purposeOther, photo]);

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
        // Upload now, in the background: by the time the form is filled it is usually done
        photoUpload.current = { data: compressedBase64, promise: callGate("uploadOutsiderPhoto", [compressedBase64, "visitor"], 30_000).catch(() => ({ path: null, error: "upload failed" })) };
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  
  // Fetch photo URL when outsider is selected
  useEffect(() => {
    let cancelled = false;
    async function fetchUrl() {
      if (selectedOutsider?.photoUrl) {
        if (selectedOutsider.photoUrl.startsWith("data:") || selectedOutsider.photoUrl.startsWith("http")) {
          setPhotoUrl(selectedOutsider.photoUrl);
        } else {
          setPhotoUrl(null); // loading state
          const url = await callGate("getExitPhotoUrl", [selectedOutsider.photoUrl], 15_000).catch(() => null);
          if (!cancelled) setPhotoUrl(url || PHOTO_FAILED);
        }
      } else {
        setPhotoUrl(null);
      }
    }
    fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [selectedOutsider]);

  const openOutsiderDetails = (outsider: any) => {
    setSelectedOutsider(outsider);
  };

  /** Empty form (after saving, or "Clear form"); the kept copy goes too */
  const clearVisitorForm = () => {
    setFormData(EMPTY_VISITOR);
    setPhoto(null);
    setOnFoot(false);
    setFormNonce((n) => n + 1);
    setPurposeOther(false);
    setParentNote(null);
    setRestoredDraft(false);
    resetVoice();
    photoUpload.current = null;
    forgetVisitorDraft();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      // Vehicle number is required unless the visitor came on foot
      if (!onFoot && !formData.vehicleNumber.trim()) {
        setError(t("Enter the vehicle number, or tap No vehicle")); setTimeout(() => setError(null), 4000);
        setLoading(false);
        return;
      }
      // The visitor's photo is mandatory
      if (!photo) {
        setError(t("Take the visitor's photo before registering")); setTimeout(() => setError(null), 4000);
        setLoading(false);
        return;
      }
      let path: string | undefined;
      if (photo) {
        // The upload started when the photo was taken; retried once here if it failed
        const pre = photoUpload.current?.data === photo ? await photoUpload.current.promise : null;
        const upload = pre && pre.path && !pre.error ? pre : await callGate("uploadOutsiderPhoto", [photo, formData.name], 30_000);
        if (upload.error || !upload.path) {
          setError(t("Photo upload failed:") + " " + (upload.error || t("unknown error"))); setTimeout(() => setError(null), 3000);
          setLoading(false);
          return;
        }
        path = upload.path;
      }

      const result: any = await callGate("registerOutsider", [{ ...formData, vehicleNumber: onFoot ? "On foot" : formData.vehicleNumber.trim(), photoUrl: path }], 20_000);
      
      if (result.success) {
        setSuccess(t("Visitor registered successfully!")); setTimeout(() => setSuccess(null), 4000);
        clearVisitorForm();
        // Back to the list, with the new visitor at the top (highlighted)
        void outsiders.reload();
        if (result.outsiderId) setHighlightId(String(result.outsiderId));
        setSearchQuery("");
        setPage(1);
        closeForm();
      } else {
        setError(result.error || t("Failed to register")); setTimeout(() => setError(null), 3000);
      }
    } catch (err: any) {
      setError(actionErrorMessage(err, t("Failed to register visitor"))); setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Visitor who came to meet a faculty / staff member: the meeting code is asked for first
  const [exitFor, setExitFor] = useState<any | null>(null);
  // The visitor being marked exited (the buttons wait meanwhile, so a double tap sends one request)
  const [exitingId, setExitingId] = useState<string | null>(null);
  // Visitor waiting for "Exit?" (no meeting code involved)
  const [confirmExit, setConfirmExit] = useState<any | null>(null);
  const handleMarkExited = (person: any) => {
    if (exitingId) return;
    if (person.visitPass && person.visitPass.status !== "EXITED") {
      setExitFor(person);
      return;
    }
    setConfirmExit(person);
  };
  const doMarkExited = async (person: any) => {
    if (exitingId) return;
    setExitingId(person.id);
    try {
      const res: any = await callGate("markOutsiderExited", [person.id], 20_000);
      if (res?.success) {
        setSuccess(t("Marked as exited")); setTimeout(() => setSuccess(null), 3000);
        void outsiders.reload();
      } else {
        setError(t(res?.error || "Failed to mark exited")); setTimeout(() => setError(null), 4000);
      }
    } catch (err: any) {
      setError(t(err?.message || "Failed to mark exited")); setTimeout(() => setError(null), 4000);
    } finally {
      setExitingId(null);
    }
  };

  
  const ITEMS_PER_PAGE = 10;

  // Entry/Exit Log: pick a day (default today); every visitor who came that day
  const [logDate, setLogDate] = useState(() => istDateString());
  const [logQuery, setLogQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setLogQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  // Only while the Log tab is open; each day / search / page is kept, so going back is instant
  const visitorsLog = useGateData<any>(
    activeTab === "HISTORY" ? `visitors-log|${logDate}|${logQuery}|${page}` : null,
    () => callGate("getVisitorsBook", [{ date: logDate, q: logQuery, page }], 15_000),
    ["visitors"]
  );
  const log: { rows: any[]; total: number; pageSize: number } | null = visitorsLog.data?.success
    ? {
        total: visitorsLog.data.total,
        pageSize: visitorsLog.data.pageSize,
        // Same shape as the visitor list (details popup, photo)
        rows: visitorsLog.data.rows.map((r: any) => ({
          ...r,
          visitingStudent: r.personToVisit,
          entryTime: r.inTime,
          exitTime: r.outTime,
        })),
      }
    : null;
  const logLoading = visitorsLog.loading || visitorsLog.refreshing;

  const filteredInside = inside.filter(
    (p) =>
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone?.includes(searchQuery) ||
      (p.vehicleNumber && p.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.purpose && p.purpose.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const paginatedInside = filteredInside.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Log tab: the chosen day only (nothing from another day while it loads)
  const paginatedHistory = log ? log.rows : [];

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

  const labelCls = "field-label block text-sm font-medium text-zinc-300";
  const categoryChip = "inline-flex shrink-0 items-center rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] font-medium text-zinc-300";

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6 pb-24 sm:pb-8">
      {/* The 4 buttons; every other screen has "← Buttons" in the same place */}
      {view === "hub" ? (
        <>
          <div className="min-w-0">
            <GoBackButton className="mb-3" />
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                <Users className="h-5 w-5" />
              </span>
              <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">{t("Visitors")}</h1>
            </div>
          </div>
          <HubTiles
            tiles={[
              {
                key: "qr",
                icon: QrCode,
                title: t("Show QR"),
                hint: t("The visitor scans it and fills the form on their phone"),
                badge: waiting > 0 ? t("{n} waiting", { n: waiting }) : null,
                primary: true,
                onClick: () => openView("qr"),
              },
              {
                key: "new",
                icon: PencilLine,
                title: t("Type it myself"),
                hint: t("Fill the visitor's details here"),
                onClick: () => openView("new"),
              },
              {
                key: "inside",
                icon: MapPin,
                title: t("Inside now"),
                hint: t("Who is inside, and Mark exit"),
                count: outsiders.data ? inside.length : null,
                onClick: () => openView("inside"),
              },
              {
                key: "log",
                icon: History,
                title: t("Old records"),
                hint: t("Visitors of any day"),
                onClick: () => openView("log"),
              },
            ]}
          />
        </>
      ) : view === "qr" ? (
        <CheckInQrScreen register="VISITORS" onBack={back} />
      ) : (
        <div className="min-w-0">
          <HubBackButton className="mb-3" onClick={back} />
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              {view === "new" ? <UserPlus className="h-5 w-5" /> : view === "inside" ? <MapPin className="h-5 w-5" /> : <History className="h-5 w-5" />}
            </span>
            <h1 className="min-w-0 text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 break-words">
              {view === "new" ? t("New visitor") : view === "inside" ? t("Inside now") : t("Old records")}
            </h1>
            {view === "inside" && outsiders.data && (
              <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 px-2 text-sm font-semibold tabular-nums text-white">
                {inside.length}
              </span>
            )}
          </div>
          {formOpen && <p className="mt-1 text-sm text-zinc-500">{t("Photo first, then the details. Saving lets the visitor in.")}</p>}
        </div>
      )}

      {/* Messages (the form shows its own, next to the submit button) */}
      {(view === "hub" || showList) && (errorAlert || successAlert) && (
        <div className="space-y-3">
          {errorAlert}
          {successAlert}
        </div>
      )}

      {/* Filters: search (both lists) and, for the log, the day — one row on wider screens */}
      {showList && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm lg:flex-1">
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
          {activeTab === "HISTORY" && (
            <div className="lg:flex-1">
            {/* One day (date picker), today, or every visitor ever (newest first) */}
            <div className="flex items-center gap-2">
              <DateField
                aria-label={t("Date")}
                value={logDate === "all" ? "" : logDate}
                max={istDateString()}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setLogDate(e.target.value);
                  setPage(1);
                }}
                className="h-12 min-w-0 flex-1 sm:w-56 sm:flex-none"
              />
              <div className="flex shrink-0 gap-2">
                {logDate !== istDateString() && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogDate(istDateString());
                      setPage(1);
                    }}
                    className="h-12 whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900 px-3 sm:px-4 text-sm font-medium text-orange-500 hover:bg-zinc-950"
                  >
                    {t("Today")}
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={logDate === "all"}
                  onClick={() => {
                    setLogDate("all");
                    setPage(1);
                  }}
                  className={`h-12 whitespace-nowrap rounded-full border px-3 sm:px-4 text-sm font-medium transition-colors ${
                    logDate === "all"
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-950"
                  }`}
                >
                  {t("All dates")}
                </button>
              </div>
            </div>
            </div>
          )}
        </div>
      )}

      {/* New visitor screen */}
      {formOpen && (
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* Brought-back details, and one tap to start again */}
                {(restoredDraft || typedSomething) && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {restoredDraft ? (
                      <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <History className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("Your unsaved details were kept.")}
                      </p>
                    ) : (
                      <span />
                    )}
                    {typedSomething && (
                      <button
                        type="button"
                        onClick={clearVisitorForm}
                        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border-2 border-red-500/50 bg-red-500/10 px-5 text-sm font-semibold text-red-600 transition-[background-color,transform] hover:bg-red-500/15 active:scale-[0.97]"
                      >
                        <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
                        {t("Clear form")}
                      </button>
                    )}
                  </div>
                )}

                {/* A student's parent: pick the student and who came; the boxes fill from the saved details */}
                <div className="space-y-2">
                  <ParentSearch onPick={fillFromParent} />
                  {parentNote && (
                    <p role="status" className="flex items-start gap-2 px-1 text-sm font-medium text-emerald-500">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {parentNote}
                    </p>
                  )}
                </div>

                {/* Speak the visitor's details once: the boxes fill themselves (photo still needed) */}
                <VoicePanel voice={voice} onUndo={undoVoice} />

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
                    <Input id="visitor-name" required autoComplete="off" autoCapitalize="words" placeholder={t("Enter full name")} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={`text-base sm:text-sm${voiceRing("name")}`} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="visitor-phone" className={labelCls}>
                      {t("Phone Number")} <span className="text-orange-400">*</span>
                    </label>
                    <Input id="visitor-phone" required type="tel" inputMode="tel" autoComplete="off" maxLength={15} placeholder={t("Enter phone")} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className={`text-base sm:text-sm${voiceRing("phone")}`} />
                  </div>

                {/* Vehicle number: required ("No vehicle" for visitors on foot) */}
                <div className="space-y-1.5">
                  <label htmlFor="visitor-vehicle" className={labelCls}>
                    {t("Vehicle Number")} <span className="text-orange-400">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {/* The box takes the rest of the row (it shrank to its placeholder beside the long Telugu button) */}
                    <div className="min-w-0 flex-1">
                    <Input
                      id="visitor-vehicle"
                      required={!onFoot}
                      disabled={onFoot}
                      autoComplete="off"
                      autoCapitalize="characters"
                      placeholder={onFoot ? t("No vehicle") : t("E.g., TS 09 EA 1234")}
                      value={onFoot ? "" : formData.vehicleNumber}
                      onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value.toUpperCase() })}
                      className={`text-base sm:text-sm disabled:opacity-60${voiceRing("vehicleNumber")}`}
                    />
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={onFoot}
                      onClick={() => setOnFoot((v) => !v)}
                      className={`h-12 shrink-0 whitespace-nowrap rounded-2xl border px-4 text-sm font-medium transition-colors ${
                        onFoot
                          ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                          : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                      }`}
                    >
                      {onFoot ? "✓ " : ""}{t("No vehicle (on foot)")}
                    </button>
                  </div>
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
                          onClick={() => {
                            categoryTapped.current = true;
                            setFormData({ ...formData, category: value });
                          }}
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
                  {/* A real dropdown (a typed-suggestion list hid the other choices once one was
                      picked); "Other" opens a box to type any reason. Voice can fill either. */}
                  <ThemedSelect
                    id="visitor-purpose"
                    value={VISIT_PURPOSES.includes(formData.purpose) ? formData.purpose : purposeOther || formData.purpose ? OTHER_PURPOSE : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPurposeOther(v === OTHER_PURPOSE);
                      setFormData({ ...formData, purpose: v === OTHER_PURPOSE ? "" : v });
                    }}
                    className="flex h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [&>option]:bg-zinc-900"
                  >
                    <option value="">{t("— Select —")}</option>
                    {VISIT_PURPOSES.map((p) => (
                      <option key={p} value={p}>{t(p)}</option>
                    ))}
                    <option value={OTHER_PURPOSE}>{t("Other (type the reason)")}</option>
                  </ThemedSelect>
                  {(purposeOther || (formData.purpose !== "" && !VISIT_PURPOSES.includes(formData.purpose))) && (
                    <Input
                      id="visitor-purpose-other"
                      autoFocus={purposeOther && !formData.purpose}
                      maxLength={200}
                      placeholder={t("Type the reason")}
                      value={formData.purpose}
                      onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                      className={`text-base sm:text-sm${voiceRing("purpose")}`}
                    />
                  )}
                </div>

                {/* Meeting a faculty / staff member: they get a code the visitor needs to go out */}
                <div className="space-y-1.5">
                  <label htmlFor="visitor-host" className={`${labelCls} flex items-center gap-1.5`}>
                    <KeyRound className="h-4 w-4 text-orange-500" aria-hidden="true" /> {t("Meeting (faculty / staff)")}
                  </label>
                  <HostPicker
                    key={`host-${formNonce}`}
                    id="visitor-host"
                    value={formData.hostProfileId}
                    onChange={(v) => setFormData({ ...formData, hostProfileId: v })}
                  />
                  <p className="text-xs text-zinc-500">
                    {formData.hostProfileId
                      ? t("They get a meeting code; the visitor needs it from them to go out.")
                      : t("Optional. Leave it empty if they came to meet a student or for other work — then no code is needed.")}
                  </p>
                </div>

                {/* Other (optional) details */}
                <div className="space-y-4 border-t border-zinc-800/70 pt-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t("More details (optional)")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="visitor-visiting" className={labelCls}>{t("Person to Visit")}</label>
                      <Input id="visitor-visiting" placeholder={t("Name or Roll No of the person")} value={formData.visitingStudent} onChange={e => setFormData({...formData, visitingStudent: e.target.value})} className={`text-base sm:text-sm${voiceRing("visitingStudent")}`} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="visitor-department" className={labelCls}>{t("Department")}</label>
                      <DepartmentSelect key={`dept-${formNonce}-${deptVoiceNo}`} allowOther id="visitor-department" placeholder="Department being visited" value={formData.department} onChange={(v) => setFormData({ ...formData, department: v })} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="visitor-address" className={labelCls}>{t("Address")}</label>
                      <Input id="visitor-address" placeholder={t("Visitor's address")} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className={`text-base sm:text-sm${voiceRing("address")}`} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label htmlFor="visitor-remarks" className={labelCls}>{t("Remarks")}</label>
                      <Input id="visitor-remarks" placeholder={t("Any notes")} value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} className={`text-base sm:text-sm${voiceRing("remarks")}`} />
                    </div>
                  </div>
                </div>

                <LiveDateTime />

                {errorAlert}
                {successAlert}

                <Button type="submit" className="h-14 w-full whitespace-normal text-center text-base leading-tight" size="lg" disabled={loading}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
                  {loading ? t("Registering…") : t("Save & let in")}
                </Button>
                <Button type="button" variant="ghost" className="h-12 w-full" onClick={back} disabled={loading}>
                  {t("Cancel")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Inside now */}
      {view === "inside" && (
        <>
          <LoadingPill active={outsiders.loading} />
          <Card className="overflow-hidden">
            {outsiders.error ? (
              <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <AlertCircle className="h-6 w-6 text-red-400" />
                <p className="text-sm font-medium text-red-400">{t(outsiders.error)}</p>
                <Button variant="outline" className="h-11" onClick={() => void outsiders.reload()}>
                  <RotateCcw className="h-4 w-4" /> {t("Try Again")}
                </Button>
              </div>
            ) : outsiders.loading ? (
              <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("Loading…")}
              </div>
            ) : paginatedInside.length === 0 ? (
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
                <ul className={`lg:hidden ${dt.mobileList}`}>
                  {paginatedInside.map((person) => (
                    <li
                      key={person.id}
                      className={`space-y-3 px-4 py-4 transition-colors ${highlightId === person.id ? "bg-orange-500/10" : ""}`}
                    >
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
                        {person.visitPass && person.visitPass.status !== "EXITED" && (
                          <span className="sr-only">{t("Meeting: {name}", { name: person.visitPass.hostName })}</span>
                        )}
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-medium text-zinc-100 tabular-nums">{formatTime(person.entryTime)}</span>
                          <span className={categoryChip}>{t(person.category)}</span>
                        </span>
                      </button>
                      <p className="text-xs font-semibold text-amber-600 tabular-nums">{insideForLabel(t, person.entryTime, now)}</p>
                      {person.visitPass && person.visitPass.status !== "EXITED" && (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-orange-500">
                          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> {t("Meeting: {name}", { name: person.visitPass.hostName })} · {t("code needed to exit")}
                        </p>
                      )}
                      <Button
                        className="h-12 w-full bg-sky-600 text-base text-white hover:bg-sky-700"
                        onClick={(e) => { e.stopPropagation(); handleMarkExited(person); }}
                        disabled={!!exitingId}
                      >
                        {exitingId === person.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                        {t("Exit")}
                      </Button>
                    </li>
                  ))}
                </ul>

                {/* Tablet & up: table */}
                <div className={`hidden lg:block ${dt.wrap}`}>
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
                        <tr
                          key={person.id}
                          className={`${dt.trClickable} ${highlightId === person.id ? "bg-orange-500/10" : ""}`}
                          onClick={() => openOutsiderDetails(person)}
                        >
                          <td className={dt.td}>
                            <PersonCell name={person.name || "—"} sub={person.phone} />
                            {person.visitPass && person.visitPass.status !== "EXITED" && (
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-500">
                                <KeyRound className="h-3 w-3" aria-hidden="true" /> {t("Meeting: {name}", { name: person.visitPass.hostName })}
                              </span>
                            )}
                          </td>
                          <td className={dt.td}>
                            <span className={categoryChip}>{t(person.category)}</span>
                            <p className="mt-1 max-w-[220px] truncate text-xs text-zinc-500">{person.purpose}</p>
                          </td>
                          <td className={dt.td}>
                            <span className="font-medium text-zinc-200 tabular-nums">{formatTime(person.entryTime)}</span>
                            <p className="mt-0.5 whitespace-nowrap text-xs font-semibold text-amber-600 tabular-nums">{insideForLabel(t, person.entryTime, now)}</p>
                          </td>
                          <td className={dt.tdActions}>
                            <RowActions>
                              {/* Clearly visible: the main action on someone still inside */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkExited(person);
                                }}
                                disabled={!!exitingId}
                                className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-sky-600 px-4 text-sm font-semibold text-white shadow-[0_6px_14px_-8px_rgba(2,132,199,0.7)] transition-[background-color,transform] hover:bg-sky-700 active:scale-95 disabled:opacity-60"
                              >
                                {exitingId === person.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} {t("Exit")}
                              </button>
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

      {/* Today's log (any day) */}
      {view === "log" && (
        <>
          <LoadingPill active={logLoading} />
          <Card className={`overflow-hidden transition-opacity ${logLoading ? "opacity-60" : ""}`}>
            {visitorsLog.error ? (
              <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <AlertCircle className="h-6 w-6 text-red-400" />
                <p className="text-sm font-medium text-red-400">{t(visitorsLog.error)}</p>
                <Button variant="outline" className="h-11" onClick={() => void visitorsLog.reload()}>
                  <RotateCcw className="h-4 w-4" /> {t("Try Again")}
                </Button>
              </div>
            ) : !log ? (
              <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("Loading…")}
              </div>
            ) : paginatedHistory.length === 0 ? (
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
                <ul className={`lg:hidden ${dt.mobileList}`}>
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
                <div className={`hidden lg:block ${dt.wrap}`}>
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
          <PagerBar
            page={page}
            pageSize={log ? log.pageSize : ITEMS_PER_PAGE}
            total={log ? log.total : 0}
            onPageChange={setPage}
            itemLabel={t("records")}
          />
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
            {/* Who: photo, name, kind of visitor, inside or left, call */}
            <div className="flex items-start gap-4">
              <div className="flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                {selectedOutsider.photoUrl ? (
                  photoUrl === PHOTO_FAILED ? (
                    <span className="px-2 text-center text-xs text-zinc-500">{t("Photo unavailable")}</span>
                  ) : photoUrl ? (
                    <img src={photoUrl} alt="Visitor" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full animate-pulse items-center justify-center bg-zinc-950">
                      <span className="text-xs text-zinc-500">{t("Loading…")}</span>
                    </div>
                  )
                ) : (
                  <span className="text-3xl font-semibold text-orange-500">{String(selectedOutsider.name || "?").charAt(0)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold leading-snug text-zinc-100 break-words">{selectedOutsider.name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={categoryChip}>{t(selectedOutsider.category)}</span>
                  <StatusBadge status={selectedOutsider.status} />
                </div>
                {selectedOutsider.phone && (
                  <a
                    href={`tel:${selectedOutsider.phone}`}
                    className="mt-2.5 inline-flex h-10 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 text-sm font-medium text-zinc-100 hover:border-orange-500/40"
                  >
                    <Phone className="h-4 w-4 text-orange-500" />
                    <span className="tabular-nums">{selectedOutsider.phone}</span>
                  </a>
                )}
              </div>
            </div>

            {/* When: came in, left */}
            <InOutCard
              sides={[
                {
                  label: t("In"),
                  time: selectedOutsider.entryTime ? formatDateTime(new Date(selectedOutsider.entryTime)) : null,
                  detail: selectedOutsider.gate || null,
                  direction: "IN",
                },
                {
                  label: t("Out"),
                  time: selectedOutsider.exitTime ? formatDateTime(new Date(selectedOutsider.exitTime)) : null,
                  pending: t("Still inside"),
                  direction: "OUT",
                },
              ]}
            />

            {/* Why: who they came for */}
            <FactList
              title={t("Visit")}
              facts={[
                { label: t("Person to Visit"), value: selectedOutsider.visitingStudent },
                { label: t("Department"), value: selectedOutsider.department },
                {
                  label: t("Meeting (faculty / staff)"),
                  value: selectedOutsider.visitPass?.hostName
                    ? `${selectedOutsider.visitPass.hostName}${selectedOutsider.visitPass.status !== "EXITED" ? ` · ${t("code needed to exit")}` : ""}`
                    : null,
                  wide: true,
                },
                { label: t("Purpose of Visit"), value: selectedOutsider.purpose, wide: true },
                { label: t("Vehicle Number"), value: selectedOutsider.vehicleNumber },
                { label: t("Remarks"), value: selectedOutsider.remarks, wide: true },
              ]}
            />
            <FactList title={t("Visitor")} facts={[{ label: t("Address"), value: selectedOutsider.address, wide: true }]} />

            {/* Who wrote it down */}
            {selectedOutsider.recordedByName && (
              <p className="border-t border-zinc-800 pt-3 text-xs text-zinc-500">
                {t("Registered by")} <span className="font-medium text-zinc-300">{selectedOutsider.recordedByName}</span>
              </p>
            )}

            {selectedOutsider.status === "INSIDE" && (
              <Button
                className="h-12 w-full"
                onClick={() => {
                  handleMarkExited(selectedOutsider);
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

      {/* Plain exit (no meeting code): a quick confirmation */}
      <ConfirmDialog
        open={!!confirmExit}
        onClose={() => setConfirmExit(null)}
        title={t("Mark this visitor as exited?")}
        description={confirmExit ? `${confirmExit.name || "—"} · ${t("In")} ${formatTime(confirmExit.entryTime)}` : ""}
        confirmText={t("Exit")}
        variant="info"
        onConfirm={() => confirmExit && doMarkExited(confirmExit)}
      />

      {/* Meeting code at the gate (visitor came to meet a faculty / staff member) */}
      {exitFor && (
        <VisitExitDialog
          key={exitFor.id}
          open
          onClose={() => setExitFor(null)}
          visitorName={exitFor.name || "—"}
          hostName={exitFor.visitPass?.hostName ?? ""}
          locked={(exitFor.visitPass?.attempts ?? 0) >= 5}
          canOverride={canOverrideVisit}
          onSubmit={async (input) => {
            const res: any = await callGate("markOutsiderExited", [exitFor.id, input], 20_000).catch((err: any) => ({
              error: err?.message || "Failed to mark exited",
            }));
            if (res.success) {
              setSuccess(t("Marked as exited")); setTimeout(() => setSuccess(null), 3000);
              void outsiders.reload();
            }
            return res;
          }}
        />
      )}
    </div>
  );

}

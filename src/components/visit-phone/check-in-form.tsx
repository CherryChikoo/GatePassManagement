"use client";

/**
 * The check-in form on the visitor's own phone (opened by scanning the QR on
 * Security's screen), minus the photo (Security takes it when letting the
 * visitor in), the gate and the times (automatic).
 *
 * Visitors Book: "Coming for" comes first (src/lib/visits/visitor-categories.ts,
 * the same rules as Security's form and the server); the rest appears after it.
 * - Guest / Vendor / Worker: name, phone, address, purpose (pre-set from the
 *   category), "Who are you meeting?" (a faculty / staff member gives a 4-digit
 *   code the visitor tells Security when leaving), person to visit, department
 *   (workers), vehicle or on foot, remarks.
 * - Parent / Guardian: the student's roll number or name -> Find shows only
 *   the student's name / class (a few to pick from for a name) and which parents are saved (Father / Mother /
 *   Guardian buttons). The parent's own name, mobile and address are never sent
 *   to the phone: the server fills them in from the student's record. "Not
 *   listed? Type my details" shows the usual boxes instead.
 *
 * Admission Book: the same fields as Security's own form.
 *
 * After sending, the phone shows a confirmation kept on the phone (see
 * visit-sent.tsx): no more calls to the server.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, GraduationCap, KeyRound, Loader2, PencilLine, QrCode, RotateCcw, Search, Send, UserRound, Users } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { DepartmentSelect } from "@/components/ui/department-select";
import { REGISTER_BY_KEY, type EntryRegister, type FieldDef } from "@/lib/registers/definitions";
import { DEPARTMENTS, PATTERNS, departmentLabel, listedDepartmentCode } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  COMING_FOR,
  COMING_FOR_KEYS,
  comingForFields,
  isComingFor,
  missingComingForDetail,
} from "@/lib/visits/visitor-categories";
import {
  fetchVisitForm,
  findVisitStudent,
  submitVisit,
  visitMessage,
  type VisitFormOk,
  type VisitHost,
  type VisitStudentMatch,
} from "@/components/visit-phone/visit-api";
import {
  clearDraft,
  clearSentVisit,
  readDraft,
  readSentVisit,
  saveDraft,
  saveSentVisit,
  type CheckInRegister,
  type SentVisit,
} from "@/components/visit-phone/visit-store";
import { PhoneAlert, PhoneLoading, StateCard, bigButtonCls } from "@/components/visit-phone/parts";
import { VisitSent } from "@/components/visit-phone/visit-sent";

const ADMISSION = REGISTER_BY_KEY.ADMISSION as EntryRegister;
/** Admission Book fields typed on the phone (date and times are set when Security lets them in) */
const ADMISSION_FIELDS: FieldDef[] = ADMISSION.fields.filter((f) => f.type !== "date" && f.type !== "time");

type VisitorsValues = {
  name: string;
  phone: string;
  vehicleNumber: string;
  onFoot: boolean;
  /** "Coming for": "" until the visitor picks one (the rest of the form appears then) */
  comingFor: string;
  /** The one typed extra: what is delivered (Delivery) or the work (Other work) */
  detail: string;
  /** Address, or the company they come from */
  address: string;
};

const EMPTY_VISITORS: VisitorsValues = {
  name: "",
  phone: "",
  vehicleNumber: "",
  onFoot: false,
  comingFor: "",
  detail: "",
  address: "",
};

/** Who the visitor came for: a faculty / staff member (they give the exit code), or nobody specific */
type Meeting = { kind: "" | "HOST" | "NONE"; hostGroup: string; hostId: string };
const EMPTY_MEETING: Meeting = { kind: "", hostGroup: "", hostId: "" };

/** A parent: the student found by roll number or name (only what the server may tell the phone) */
type FoundStudent = VisitStudentMatch;
type ParentWho = "FATHER" | "MOTHER" | "GUARDIAN";
const PARENT_BUTTONS: { who: ParentWho; has: keyof FoundStudent["has"]; label: string }[] = [
  { who: "FATHER", has: "father", label: "Father" },
  { who: "MOTHER", has: "mother", label: "Mother" },
  { who: "GUARDIAN", has: "guardian", label: "Guardian" },
];
type ParentState = {
  /** The roll number or name as typed */
  roll: string;
  found: FoundStudent | null;
  /** A name matched several students: the parent picks theirs */
  matches?: FoundStudent[];
  /** The last Find found nobody (the parent can still type their details) */
  notFound: boolean;
  /** A saved parent picked, or "TYPED": "Not listed? Type my details" */
  who: "" | ParentWho | "TYPED";
};
const EMPTY_PARENT: ParentState = { roll: "", found: null, matches: [], notFound: false, who: "" };
/** Server answers for an unknown roll number / name (see src/lib/visits/requests.ts) */
const NO_STUDENT = "No student found with this roll number";
const NO_NAME = "No student found with this name. Check the spelling or type the roll number.";
/** A search with a digit is a roll number; otherwise a name */
const isRollSearch = (v: string) => /\d/.test(v);
/** What was typed, as sent: a roll number in CAPITALS without spaces, or the name with single spaces */
const searchText = (v: string) => (isRollSearch(v) ? v.replace(/\s+/g, "").toUpperCase() : v.trim().replace(/\s+/g, " "));

type Draft = { visitors: VisitorsValues; admission: Record<string, string>; meeting: Meeting; parent?: ParentState };

/** A parent part of a draft, if it still makes sense */
function restoreParent(p: unknown): ParentState {
  if (!p || typeof p !== "object") return EMPTY_PARENT;
  const v = p as Partial<ParentState>;
  const roll = typeof v.roll === "string" ? v.roll.slice(0, 60) : "";
  const f = v.found as Partial<FoundStudent> | null | undefined;
  const found: FoundStudent | null =
    f && typeof f === "object" && typeof f.studentName === "string" && typeof f.roll === "string" && f.has && typeof f.has === "object"
      ? {
          roll: f.roll,
          studentName: f.studentName,
          department: typeof f.department === "string" ? f.department : null,
          year: typeof f.year === "number" ? f.year : null,
          has: { father: f.has.father === true, mother: f.has.mother === true, guardian: f.has.guardian === true },
        }
      : null;
  const notFound = !found && v.notFound === true;
  let who: ParentState["who"] = v.who === "FATHER" || v.who === "MOTHER" || v.who === "GUARDIAN" || v.who === "TYPED" ? v.who : "";
  if (who === "TYPED" && !found && !notFound) who = "";
  if (who && who !== "TYPED" && !(found && found.has[who === "FATHER" ? "father" : who === "MOTHER" ? "mother" : "guardian"])) who = "";
  return { roll, found, matches: [], notFound, who };
}

/** Group of a faculty / staff member: their department ("CSE" and "Computer Science" are one), else their title */
const hostGroupKey = (h: { department: string | null; title: string }) =>
  (h.department && listedDepartmentCode(h.department)) || h.department || h.title;

const labelCls = "field-label block text-sm font-medium text-zinc-300";
const fieldCls =
  "flex h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10";
const chipCls = (selected: boolean) =>
  cn(
    "flex min-h-14 items-center justify-center rounded-2xl border px-2 py-2 text-center text-sm font-medium leading-snug transition-colors",
    selected ? "border-orange-500/50 bg-orange-500/10 text-orange-500" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
  );
const Star = () => <span className="text-orange-500">*</span>;
/** Same phone rule as the server (src/lib/visits/requests.ts) */
const PHONE_RE = /^\+?[0-9][0-9\s-]{8,16}[0-9]$/;
/** Admission Book boxes that must be filled (as the server checks them) */
const ADMISSION_REQUIRED = ADMISSION_FIELDS.filter((f) => ADMISSION.required.includes(f.key));

/**
 * The box a server message is about, so it can be shown to the visitor
 * (the server checks the same things in the same order).
 */
const FIELD_OF_MESSAGE: [RegExp, string][] = [
  [/full name|your name|Visitor name/i, "v-name"],
  [/phone number/i, "v-phone"],
  [/address/i, "v-address"],
  [/vehicle/i, "v-vehicle"],
  [/faculty member|person you are meeting/i, "v-host-group"],
  [/the work/i, "v-detail"],
  [/roll number|Find the student/i, "v-roll"],
];

/** Brings the box into view and puts the cursor in it (the visitor sees what is missing) */
function showField(id: string | null) {
  if (!id) return;
  // After React has drawn the message
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      el.focus({ preventScroll: true });
    }
  });
}

export function CheckInForm({ token }: { token: string }) {
  const t = useT();
  // Anything that is not a check-in QR is not worth asking the server about
  const wellFormed = token.startsWith("GV1.");

  /** The confirmation of a form this phone sent (undefined: not read from the phone yet) */
  const [sent, setSent] = useState<SentVisit | null | undefined>(undefined);
  const [form, setForm] = useState<VisitFormOk | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNo, setLoadNo] = useState(0);

  const [visitors, setVisitors] = useState<VisitorsValues>(EMPTY_VISITORS);
  const [admission, setAdmission] = useState<Record<string, string>>({});
  const [meeting, setMeeting] = useState<Meeting>(EMPTY_MEETING);
  const [parent, setParent] = useState<ParentState>(EMPTY_PARENT);
  /** A parent's Find in progress, and its problem */
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The box the message above the button is about (outlined in red until it is changed) */
  const [badField, setBadField] = useState<string | null>(null);
  /** The QR is too old to send the form: scan again (what was typed is kept) */
  const [tooLate, setTooLate] = useState(false);

  // Already sent from this phone (a reload): show the confirmation, ask nothing
  useEffect(() => {
    setSent(readSentVisit());
  }, []);

  const showForm = sent === null;
  useEffect(() => {
    if (!showForm) return;
    if (!wellFormed) {
      setLoadError("invalid");
      return;
    }
    let cancelled = false;
    setLoadError(null);
    void fetchVisitForm(token).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      // A reload, or the QR scanned again: bring back what was typed
      const draft = readDraft<Draft>(res.register);
      if (draft) {
        const v = { ...EMPTY_VISITORS, ...draft.visitors };
        // A choice no longer on the form is chosen again
        if (!isComingFor(v.comingFor)) v.comingFor = "";
        setVisitors(v);
        setAdmission(draft.admission ?? {});
        const m = { ...EMPTY_MEETING, ...draft.meeting };
        const gone =
          (m.kind !== "" && m.kind !== "HOST" && m.kind !== "NONE") ||
          (m.kind === "HOST" && !!m.hostId && !res.hosts.some((h) => h.id === m.hostId));
        setMeeting(gone ? EMPTY_MEETING : { kind: m.kind, hostGroup: m.hostGroup, hostId: m.hostId });
        setParent(restoreParent(draft.parent));
      }
      setForm(res);
    });
    return () => {
      cancelled = true;
    };
  }, [token, wellFormed, loadNo, showForm]);

  // Keep a draft while typing (a page reload must not lose it)
  const register: CheckInRegister | null = form?.register ?? null;
  useEffect(() => {
    if (!register || sending || !showForm) return;
    saveDraft(register, { visitors, admission, meeting, parent } satisfies Draft);
  }, [register, visitors, admission, meeting, parent, sending, showForm]);

  const hosts = useMemo(() => form?.hosts ?? [], [form]);

  // Faculty / staff grouped by department (or their title when they have none):
  // college departments first, in the usual order, then the rest A–Z
  const hostGroups = useMemo(() => {
    const keys = Array.from(new Set(hosts.map(hostGroupKey)));
    const order = (k: string) => {
      const code = listedDepartmentCode(k);
      const i = code ? DEPARTMENTS.findIndex((d) => d.code === code) : -1;
      return i >= 0 ? i : DEPARTMENTS.length;
    };
    return keys.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  }, [hosts]);
  const groupLabel = (key: string) => {
    const code = listedDepartmentCode(key);
    const dept = code ? DEPARTMENTS.find((d) => d.code === code) : undefined;
    return dept ? departmentLabel(dept) : t(key);
  };
  const groupHosts = hosts.filter((h) => hostGroupKey(h) === meeting.hostGroup);

  /** "Fill another form": forget the confirmation and open an empty form */
  function fillAnother() {
    clearSentVisit();
    setVisitors(EMPTY_VISITORS);
    setAdmission({});
    setMeeting(EMPTY_MEETING);
    setParent(EMPTY_PARENT);
    setFindError(null);
    setError(null);
    setTooLate(false);
    setForm(null);
    setLoadNo((n) => n + 1);
    setSent(null);
    window.scrollTo({ top: 0 });
  }

  if (sent === undefined) return <PhoneLoading />;
  if (sent) return <VisitSent sent={sent} onAnother={fillAnother} />;

  if (loadError) {
    if (loadError === "expired" || loadError === "invalid") {
      return (
        <StateCard tone="info" icon={<QrCode />} title={loadError === "expired" ? t("This QR has expired") : t("This QR is not valid")}>
          <p>{t("Please scan the QR shown by the security officer at the gate again.")}</p>
        </StateCard>
      );
    }
    return (
      <div className="space-y-4">
        <StateCard tone="bad" icon={<RotateCcw />} title={t("Could not open the form")}>
          <p>{visitMessage(t, loadError)}</p>
        </StateCard>
        <button type="button" className={bigButtonCls} onClick={() => setLoadNo((n) => n + 1)}>
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
          {t("Try again")}
        </button>
      </div>
    );
  }

  if (!form) return <PhoneLoading label={t("Opening the form…")} />;

  if (tooLate) {
    return (
      <StateCard tone="info" icon={<Clock />} title={t("This QR has expired")}>
        <p>{t("Please scan the QR shown by the security officer at the gate again.")}</p>
        <p className="text-sm">{t("What you typed is kept on this phone.")}</p>
      </StateCard>
    );
  }

  const isVisitors = form.register === "VISITORS";
  const comingFor = isComingFor(visitors.comingFor) ? visitors.comingFor : null;
  const isParent = comingFor === "PARENT";
  const setV = (patch: Partial<VisitorsValues>) => setVisitors((v) => ({ ...v, ...patch }));
  const setA = (key: string, value: string) => setAdmission((a) => ({ ...a, [key]: value }));
  /** A parent picked from the record, or typing their own details */
  const parentTyping = parent.who === "TYPED" && (!!parent.found || parent.notFound);
  /** The vehicle question shows once the rest is known (a parent: after picking Father / Mother / Guardian or typing) */
  const showVehicle = !!comingFor && (!isParent || !!parent.who);

  /** "Coming for": the extra box of the other choice is cleared */
  function pickComingFor(value: string) {
    setError(null);
    setVisitors((v) => (v.comingFor === value ? v : { ...v, comingFor: value, detail: "" }));
  }

  /** A parent's Find: the student by exact roll number, or by name (a few to pick from); one call per tap */
  async function findStudent() {
    if (finding) return;
    const q = searchText(parent.roll);
    setFindError(null);
    setError(null);
    if (isRollSearch(q) ? !PATTERNS.STUDENT_ROLL.test(q) : q.replace(/[^\p{L}]/gu, "").length < 3) {
      setFindError(t(isRollSearch(q) ? "Enter a valid roll number" : "Type at least 3 letters of the student's name"));
      return;
    }
    setFinding(true);
    const res = await findVisitStudent(token, q);
    setFinding(false);
    if (res.ok) {
      const keepTyped = (p: ParentState): ParentState["who"] => (p.who === "TYPED" ? "TYPED" : "");
      if (res.students.length === 1) {
        setParent((p) => ({ roll: q, found: res.students[0], matches: [], notFound: false, who: keepTyped(p) }));
      } else {
        setParent((p) => ({ roll: q, found: null, matches: res.students, notFound: false, who: keepTyped(p) }));
      }
      return;
    }
    if (res.error === "expired" || res.error === "invalid") {
      setTooLate(true);
      return;
    }
    if (res.error === NO_STUDENT || res.error === NO_NAME) {
      setParent((p) => ({ roll: q, found: null, matches: [], notFound: true, who: p.who === "TYPED" ? "TYPED" : "" }));
    }
    setFindError(visitMessage(t, res.error));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !form) return;
    setError(null);
    setBadField(null);
    // The message above the button, and the box it is about outlined in red and brought into view
    const fail = (message: string, field: string | null = null) => {
      setError(t(message));
      setBadField(field);
      showField(field);
      return;
    };

    let data: Record<string, unknown>;
    let typedName: string;
    let host: VisitHost | undefined;
    if (isVisitors) {
      if (!comingFor) return fail("Choose what you are coming for", "v-coming");
      const vehicle = { vehicleNumber: visitors.onFoot ? "" : visitors.vehicleNumber.trim().toUpperCase(), onFoot: visitors.onFoot };
      const typed = { name: visitors.name.trim(), phone: visitors.phone.trim(), address: visitors.address.trim() };
      const detail = visitors.detail.trim();
      const checkTyped = (): [string, string] | null => {
        if (typed.name.length < 2) return ["Enter the full name", "v-name"];
        if (!typed.phone) return ["Enter the phone number", "v-phone"];
        if (!PHONE_RE.test(typed.phone)) return ["Enter a valid phone number (10–15 digits)", "v-phone"];
        if (!typed.address) return ["Enter the address or company", "v-address"];
        return null;
      };
      const noVehicle = () => fail("Enter the vehicle number, or choose On foot", "v-vehicle");
      if (isParent) {
        // The parent's details are filled in by the server from the student's record
        const typing = parentTyping;
        if (!parent.found && !typing) return fail("Enter the student's roll number or name and tap Find", "v-roll");
        if (!parent.who) return fail("Tap Father, Mother or Guardian, or type your details", "v-parent-who");
        if (typing) {
          const missing = checkTyped();
          if (missing) return fail(...missing);
        }
        if (!vehicle.onFoot && !vehicle.vehicleNumber) return noVehicle();
        const student = parent.found ? `${parent.found.studentName} (${parent.found.roll})` : searchText(parent.roll);
        const missing = missingComingForDetail(comingFor, { student });
        if (missing) return fail(missing, "v-roll");
        data = {
          comingFor,
          ...vehicle,
          ...(parent.found ? { studentRoll: parent.found.roll } : { detail: searchText(parent.roll) }),
          ...(typing ? typed : { parentWho: parent.who }),
        };
        typedName = typing ? typed.name : parent.found?.studentName ?? "";
      } else {
        host = comingFor === "MEETING" ? hosts.find((h) => h.id === meeting.hostId) : undefined;
        const typedMissing = checkTyped();
        if (typedMissing) return fail(...typedMissing);
        const missing = missingComingForDetail(comingFor, { detail, hostProfileId: host?.id });
        if (missing) return fail(missing, comingFor === "MEETING" ? (meeting.hostGroup ? "v-host" : "v-host-group") : "v-detail");
        if (!vehicle.onFoot && !vehicle.vehicleNumber) return noVehicle();
        const f = comingForFields(comingFor, { detail, hostProfileId: host?.id });
        data = { comingFor, detail, hostProfileId: f.hostProfileId, ...typed, ...vehicle };
        typedName = typed.name;
      }
    } else {
      for (const f of ADMISSION_REQUIRED) {
        if (!(admission[f.key] ?? "").trim()) return fail(t("{field} is required", { field: t(f.label) }), `a-${f.key}`);
      }
      for (const f of ADMISSION_FIELDS) {
        const v = (admission[f.key] ?? "").trim();
        if (f.type === "phone" && v && !PHONE_RE.test(v)) return fail(`${t(f.label)}: ${t("Enter a valid phone number (10–15 digits)")}`, `a-${f.key}`);
      }
      if (!meeting.kind && hosts.length > 0) return fail("Choose who you are meeting", "v-meeting");
      host = meeting.kind === "HOST" ? hosts.find((h) => h.id === meeting.hostId) : undefined;
      if (meeting.kind === "HOST" && !host) return fail("Choose the person you are meeting from the list", meeting.hostGroup ? "v-host" : "v-host-group");
      data = Object.fromEntries(ADMISSION_FIELDS.map((f) => [f.key, (admission[f.key] ?? "").trim()]));
      typedName = (admission.parentName ?? "").trim();
    }

    setSending(true);
    const res = await submitVisit({ t: token, data, ...(host ? { hostProfileId: host.id } : {}) });
    setSending(false);
    if (res.ok) {
      const confirmation: SentVisit = {
        register: form.register,
        // A parent found by roll number: the server answers with the student's name
        name: (typeof res.name === "string" && res.name.trim()) || typedName,
        at: typeof res.at === "string" && !Number.isNaN(Date.parse(res.at)) ? res.at : new Date().toISOString(),
        hostName: host?.name ?? null,
        forStudent: res.forStudent === true,
      };
      saveSentVisit(confirmation);
      clearDraft(form.register);
      setSent(confirmation);
      window.scrollTo({ top: 0 });
      return;
    }
    if (res.error === "expired" || res.error === "invalid") {
      setTooLate(true);
      return;
    }
    // The server's message, with its box shown when it names one
    let field: string | null = null;
    if (!isVisitors) {
      const named = ADMISSION_FIELDS.find((f) => res.error.startsWith(f.label));
      if (named) field = `a-${named.key}`;
    } else {
      field = FIELD_OF_MESSAGE.find(([re]) => re.test(res.error))?.[1] ?? null;
      // A parent picked from the record has no name / phone / address boxes
      if (isParent && !parentTyping && field && ["v-name", "v-phone", "v-address"].includes(field)) field = null;
    }
    setError(visitMessage(t, res.error));
    setBadField(field);
    showField(field);
  }

  /** Full name, phone and address boxes (everyone except a parent picked from the record) */
  const contactFields = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="v-name" className={labelCls}>
          {t("Full Name")} <Star />
        </label>
        <Input
          id="v-name"
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
          autoCapitalize="words"
          value={visitors.name}
          onChange={(e) => setV({ name: e.target.value })}
          className="text-base"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="v-phone" className={labelCls}>
          {t("Phone Number")} <Star />
        </label>
        <Input
          id="v-phone"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={15}
          value={visitors.phone}
          onChange={(e) => setV({ phone: e.target.value })}
          className="text-base"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="v-address" className={labelCls}>
          {t("Address / Company")} <Star />
        </label>
        <Input
          id="v-address"
          required
          maxLength={300}
          autoComplete="street-address"
          value={visitors.address}
          onChange={(e) => setV({ address: e.target.value })}
          className="text-base"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">{t("Fill in your details")}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t(isVisitors ? "Visitors Book & Pass" : "Admission Book & Pass")}
          {form.gate ? ` · ${form.gate}` : ""}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {isVisitors
            ? t("Send this form. The security officer will check it at the gate.")
            : t("Send this form. The security officer will check it and take your photo at the gate.")}
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <form
            data-look="clear"
            noValidate
            onSubmit={handleSubmit}
            // Typing or choosing in the box that was missing clears its red outline
            onInput={(e) => badField && (e.target as HTMLElement).id === badField && setBadField(null)}
            onChange={(e) => badField && (e.target as HTMLElement).id === badField && setBadField(null)}
            className="space-y-6"
          >
            {/* The box that is missing: red outline (found by its id) */}
            {badField && (
              <style>{`#${CSS.escape(badField)}{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.25)!important}`}</style>
            )}
            {isVisitors ? (
              <>
                {/* "Coming for" first: the rest of the form follows from it */}
                <div className="space-y-1.5">
                  <label htmlFor="v-coming" className={labelCls}>
                    {t("Coming for")} <Star />
                  </label>
                  <ThemedSelect id="v-coming" value={comingFor ?? ""} onChange={(e) => pickComingFor(e.target.value)} className={fieldCls}>
                    <option value="">{t("— Select —")}</option>
                    {COMING_FOR_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(COMING_FOR[k].label)}
                      </option>
                    ))}
                  </ThemedSelect>
                </div>

                {isParent ? (
                  <ParentPart
                    parent={parent}
                    setParent={setParent}
                    finding={finding}
                    findError={findError}
                    onRollTyped={() => setFindError(null)}
                    onFind={() => void findStudent()}
                    contactFields={contactFields}
                  />
                ) : comingFor ? (
                  <>
                    {contactFields}
                    {comingFor === "MEETING" && (
                      <HostPicker
                        meeting={meeting}
                        setMeeting={setMeeting}
                        hostGroups={hostGroups}
                        groupLabel={groupLabel}
                        groupHosts={groupHosts}
                      />
                    )}
                    {(comingFor === "DELIVERY" || comingFor === "OTHER") && (
                      <div className="space-y-1.5">
                        <label htmlFor="v-detail" className={labelCls}>
                          {t(COMING_FOR[comingFor].detailLabel)} {comingFor === "OTHER" && <Star />}
                        </label>
                        <Input
                          id="v-detail"
                          required={comingFor === "OTHER"}
                          maxLength={150}
                          value={visitors.detail}
                          onChange={(e) => setV({ detail: e.target.value })}
                          className="text-base"
                        />
                      </div>
                    )}
                  </>
                ) : null}

                {showVehicle && (
                  /* Vehicle number: required ("No vehicle" when on foot) */
                  <div className="space-y-1.5">
                    <label htmlFor="v-vehicle" className={labelCls}>
                      {t("Vehicle Number")} <Star />
                    </label>
                    <Input
                      id="v-vehicle"
                      required={!visitors.onFoot}
                      disabled={visitors.onFoot}
                      maxLength={30}
                      autoComplete="off"
                      autoCapitalize="characters"
                      placeholder={visitors.onFoot ? t("No vehicle") : undefined}
                      value={visitors.onFoot ? "" : visitors.vehicleNumber}
                      onChange={(e) => setV({ vehicleNumber: e.target.value.toUpperCase() })}
                      className="text-base disabled:opacity-60"
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={visitors.onFoot}
                      onClick={() => setV({ onFoot: !visitors.onFoot })}
                      className={cn(
                        "h-12 w-full rounded-2xl border px-4 text-sm font-medium transition-colors",
                        visitors.onFoot
                          ? "border-orange-500/50 bg-orange-500/10 text-orange-500"
                          : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                      )}
                    >
                      {visitors.onFoot ? "✓ " : ""}
                      {t("No vehicle (on foot)")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-4">
                  {ADMISSION_FIELDS.map((f) => (
                    <AdmissionField
                      key={f.key}
                      f={f}
                      value={admission[f.key] ?? ""}
                      onChange={(v) => setA(f.key, v)}
                      required={ADMISSION.required.includes(f.key)}
                    />
                  ))}
                  {/* Referral Name: the college's people as suggestions (any name can be typed) */}
                  <datalist id="v-people">
                    {hosts.map((h) => (
                      <option key={h.id} value={h.name} />
                    ))}
                  </datalist>
                </div>

                <MeetingChoice
                  meeting={meeting}
                  setMeeting={setMeeting}
                  hostGroups={hostGroups}
                  groupLabel={groupLabel}
                  groupHosts={groupHosts}
                  hasHosts={hosts.length > 0}
                />
              </>
            )}

            {error && <PhoneAlert>{error}</PhoneAlert>}

            {(!isVisitors || showVehicle) && (
              <button type="submit" className={bigButtonCls} disabled={sending || finding}>
                {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
                {sending ? t("Sending…") : t("Send to security")}
              </button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Parent / Guardian: the student by roll number, then which parent came. Only
 * the student's name / class and which parents are saved reach the phone.
 */
function ParentPart({
  parent,
  setParent,
  finding,
  findError,
  onRollTyped,
  onFind,
  contactFields,
}: {
  parent: ParentState;
  setParent: React.Dispatch<React.SetStateAction<ParentState>>;
  finding: boolean;
  findError: string | null;
  onRollTyped: () => void;
  onFind: () => void;
  contactFields: React.ReactNode;
}) {
  const t = useT();
  const { found } = parent;
  const typing = parent.who === "TYPED" && (!!found || parent.notFound);
  const deptCode = found?.department ? listedDepartmentCode(found.department) || found.department : null;
  const classLine = found ? [deptCode, found.year ? t("Year {n}", { n: found.year }) : null, found.roll].filter(Boolean).join(" · ") : "";
  const saved = found ? PARENT_BUTTONS.filter((b) => found.has[b.has]) : [];

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-950/60 p-4">
        {found ? (
          <div className="flex items-start gap-3">
            <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-base font-semibold text-zinc-100">{found.studentName}</p>
              <p className="break-words text-sm text-zinc-500">{classLine}</p>
            </div>
            <button
              type="button"
              onClick={() => setParent((p) => ({ ...p, found: null, matches: [], notFound: false, who: "" }))}
              className="h-11 shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-orange-500 hover:bg-zinc-950"
            >
              {t("Change")}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="v-roll" className={labelCls}>
              {t("Student's roll number or name")} <Star />
            </label>
            <div className="flex gap-2">
              <Input
                id="v-roll"
                maxLength={30}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                value={parent.roll}
                onChange={(e) => {
                  onRollTyped();
                  const v = e.target.value;
                  // Roll numbers in CAPITALS as typed; names as typed. A new search hides the old list
                  setParent((p) => ({ ...p, roll: isRollSearch(v) ? v.toUpperCase() : v, matches: [] }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onFind();
                  }
                }}
                className="min-w-0 flex-1 text-base"
              />
              <button
                type="button"
                onClick={onFind}
                disabled={finding}
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-orange-600 px-4 text-base font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
              >
                {finding ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
                {t("Find")}
              </button>
            </div>
            {findError && (
              <p role="alert" className="rounded-2xl border-2 border-red-500 bg-red-50 px-3 py-2.5 text-base font-bold leading-snug text-red-700">
                {findError}
              </p>
            )}
            {/* A name matched several students: tap yours */}
            {!!parent.matches?.length && (
              <div className="space-y-2 pt-1">
                <p className="text-sm font-semibold text-zinc-300">{t("Tap your child's name")}</p>
                <ul className="space-y-2">
                  {parent.matches.map((m) => {
                    const dept = m.department ? listedDepartmentCode(m.department) || m.department : null;
                    const line = [dept, m.year ? t("Year {n}", { n: m.year }) : null, m.roll].filter(Boolean).join(" · ");
                    return (
                      <li key={m.roll}>
                        <button
                          type="button"
                          onClick={() => setParent((p) => ({ ...p, found: m, matches: [], notFound: false }))}
                          className="flex min-h-14 w-full items-start gap-3 rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900 px-4 py-3 text-left transition-colors hover:border-orange-500/60 active:bg-orange-500/10"
                        >
                          <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-base font-semibold text-zinc-100">{m.studentName}</span>
                            <span className="block break-words text-sm text-zinc-500">{line}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {found && (
          <>
            <p id="v-parent-who" className={labelCls}>
              {t("Who are you?")} <Star />
            </p>
            {saved.length > 0 && (
              <div role="radiogroup" aria-labelledby="v-parent-who" className="grid grid-cols-3 gap-2">
                {saved.map(({ who, label }) => (
                  <button
                    key={who}
                    type="button"
                    role="radio"
                    aria-checked={parent.who === who}
                    onClick={() => setParent((p) => ({ ...p, who }))}
                    className={chipCls(parent.who === who)}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            )}
            {saved.length === 0 && (
              <p className="text-sm leading-relaxed text-zinc-500">{t("Your details are not saved for this student. Please type them.")}</p>
            )}
            {parent.who && parent.who !== "TYPED" && (
              <p className="text-xs leading-relaxed text-zinc-500">
                {t("Your name, mobile number and address are filled in from the student's record.")}
              </p>
            )}
          </>
        )}

        {(found || parent.notFound) && (
          <button
            type="button"
            aria-pressed={typing}
            onClick={() => setParent((p) => ({ ...p, who: "TYPED" }))}
            className={cn(
              "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-4 py-2 text-center text-base font-bold leading-snug transition-colors",
              typing
                ? "border-orange-600 bg-orange-600 text-white"
                : "border-dashed border-orange-500 bg-orange-50 text-orange-700 hover:bg-orange-100"
            )}
          >
            {typing ? <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> : <PencilLine className="h-5 w-5 shrink-0" aria-hidden="true" />}
            {t("Not listed? Type my details")}
          </button>
        )}
      </div>

      {typing && contactFields}
    </div>
  );
}

/** One Admission Book field, as on Security's form */
function AdmissionField({
  f,
  value,
  onChange,
  required,
}: {
  f: FieldDef;
  value: string;
  onChange: (v: string) => void;
  required: boolean;
}) {
  const t = useT();
  const id = `a-${f.key}`;
  let input: React.ReactNode;
  switch (f.type) {
    case "department":
      input = <DepartmentSelect id={id} value={value} onChange={onChange} required={required} allowOther />;
      break;
    case "select":
      input = (
        <ThemedSelect id={id} value={value} required={required} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
          <option value="">{t("— Select —")}</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {t(o)}
            </option>
          ))}
        </ThemedSelect>
      );
      break;
    case "textarea":
      input = (
        <textarea
          id={id}
          value={value}
          maxLength={1000}
          rows={3}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldCls, "h-auto min-h-[96px] resize-none py-3")}
        />
      );
      break;
    case "phone":
      input = (
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete={f.key === "parentMobile" ? "tel" : "off"}
          maxLength={15}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={fieldCls}
        />
      );
      break;
    default:
      input = (
        <input
          id={id}
          type="text"
          maxLength={200}
          value={value}
          list={f.type === "person" ? "v-people" : undefined}
          autoComplete={f.key === "parentName" ? "name" : "off"}
          autoCapitalize={f.type === "person" || f.key === "parentName" ? "words" : undefined}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={fieldCls}
        />
      );
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelCls}>
        {t(f.label)} {required && <span className="text-orange-500">*</span>}
      </label>
      {input}
      {f.quickValues?.length ? (
            <div className="flex flex-wrap gap-2">
              {f.quickValues.map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={value === q}
                  onClick={() => onChange(value === q ? "" : q)}
                  className={cn(
                    "inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
                    value === q ? "border-orange-500 bg-orange-500/10 text-orange-600" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-950"
                  )}
                >
                  {t(q)}
                </button>
              ))}
            </div>
          ) : null}
      {f.hint && <p className="text-xs text-zinc-500">{t(f.hint)}</p>}
    </div>
  );
}

/** Meeting a faculty member (Visitors Book): Department → name */
function HostPicker({
  meeting,
  setMeeting,
  hostGroups,
  groupLabel,
  groupHosts,
}: {
  meeting: Meeting;
  setMeeting: React.Dispatch<React.SetStateAction<Meeting>>;
  hostGroups: string[];
  groupLabel: (key: string) => string;
  groupHosts: VisitHost[];
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="v-host-group" className={labelCls}>
          {t("Department")} <Star />
        </label>
        <ThemedSelect
          id="v-host-group"
          value={meeting.hostGroup}
          onChange={(e) => setMeeting((m) => ({ ...m, kind: "HOST", hostGroup: e.target.value, hostId: "" }))}
          className={fieldCls}
        >
          <option value="">{t("— Select —")}</option>
          {hostGroups.map((g) => (
            <option key={g} value={g}>
              {groupLabel(g)}
            </option>
          ))}
        </ThemedSelect>
      </div>
      {meeting.hostGroup && (
        <div className="space-y-1.5">
          <label htmlFor="v-host" className={labelCls}>
            {t("Select faculty")} <Star />
          </label>
          <ThemedSelect
            id="v-host"
            value={meeting.hostId}
            onChange={(e) => setMeeting((m) => ({ ...m, kind: "HOST", hostId: e.target.value }))}
            className={fieldCls}
          >
            <option value="">{t("— Select —")}</option>
            {groupHosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title ? `${h.name} — ${t(h.title)}` : h.name}
              </option>
            ))}
          </ThemedSelect>
        </div>
      )}
      <p className="text-xs leading-relaxed text-zinc-500">
        {t("After the meeting, they give you a 4-digit code. Tell it to the security officer when you leave.")}
      </p>
    </div>
  );
}

/** "Who are you meeting?": faculty / staff (Department → name) or nobody specific */
function MeetingChoice({
  meeting,
  setMeeting,
  hostGroups,
  groupLabel,
  groupHosts,
  hasHosts,
}: {
  meeting: Meeting;
  setMeeting: React.Dispatch<React.SetStateAction<Meeting>>;
  hostGroups: string[];
  groupLabel: (key: string) => string;
  groupHosts: VisitHost[];
  hasHosts: boolean;
}) {
  const t = useT();
  const choices = [
    hasHosts && { kind: "HOST" as const, icon: UserRound, label: t("Faculty / staff") },
    { kind: "NONE" as const, icon: Users, label: t("Nobody specific") },
  ].filter(Boolean) as { kind: Meeting["kind"]; icon: typeof Users; label: string }[];

  return (
    <div className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-950/60 p-4">
      <p id="v-meeting" className={cn(labelCls, "flex items-center gap-1.5")}>
        <KeyRound className="h-4 w-4 text-orange-500" aria-hidden="true" />
        {t("Who are you meeting?")} {hasHosts && <span className="text-orange-500">*</span>}
      </p>
      <div role="radiogroup" aria-labelledby="v-meeting" className="grid grid-cols-1 gap-2">
        {choices.map(({ kind, icon: Icon, label }) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={meeting.kind === kind}
            onClick={() => setMeeting((m) => ({ ...m, kind }))}
            className={cn(chipCls(meeting.kind === kind), "justify-start gap-3 px-4 text-left text-base")}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {meeting.kind === "HOST" && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <label htmlFor="v-host-group" className={labelCls}>
              {t("Department")}
            </label>
            <ThemedSelect
              id="v-host-group"
              value={meeting.hostGroup}
              onChange={(e) => setMeeting((m) => ({ ...m, hostGroup: e.target.value, hostId: "" }))}
              className={fieldCls}
            >
              <option value="">{t("— Select —")}</option>
              {hostGroups.map((g) => (
                <option key={g} value={g}>
                  {groupLabel(g)}
                </option>
              ))}
            </ThemedSelect>
          </div>
          {meeting.hostGroup && (
            <div className="space-y-1.5">
              <label htmlFor="v-host" className={labelCls}>
                {t("Name")}
              </label>
              <ThemedSelect
                id="v-host"
                value={meeting.hostId}
                onChange={(e) => setMeeting((m) => ({ ...m, hostId: e.target.value }))}
                className={fieldCls}
              >
                <option value="">{t("— Select —")}</option>
                {groupHosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.title ? `${h.name} — ${t(h.title)}` : h.name}
                  </option>
                ))}
              </ThemedSelect>
            </div>
          )}
          <p className="text-xs leading-relaxed text-zinc-500">
            {t("After the meeting, they give you a 4-digit code. Tell it to the security officer when you leave.")}
          </p>
        </div>
      )}

      {meeting.kind === "NONE" && (
        <p className="text-xs leading-relaxed text-zinc-500">{t("When you leave, the security officer will mark your exit.")}</p>
      )}
    </div>
  );
}

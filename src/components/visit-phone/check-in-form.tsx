"use client";

/**
 * The check-in form on the visitor's own phone (opened by scanning the QR on
 * Security's screen). The same fields, order and choices as the guard's own
 * form for that register, minus the photo (Security takes it when letting the
 * visitor in), the gate and the times (automatic). Plus "Who are you meeting?":
 * a faculty / staff member gives a 4-digit code the visitor tells Security when
 * leaving; otherwise Security just marks the exit.
 *
 * The Visitors form has the same categories as Security's form (parents too).
 * After sending, the phone shows a confirmation
 * kept on the phone (see visit-sent.tsx): no more calls to the server.
 */
import { useEffect, useMemo, useState } from "react";
import { Clock, KeyRound, Loader2, QrCode, RotateCcw, Send, UserRound, Users } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { DepartmentSelect } from "@/components/ui/department-select";
import { REGISTER_BY_KEY, type EntryRegister, type FieldDef } from "@/lib/registers/definitions";
import { DEPARTMENTS, departmentLabel, listedDepartmentCode } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { fetchVisitForm, submitVisit, visitMessage, type VisitFormOk, type VisitHost } from "@/components/visit-phone/visit-api";
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

/** Reasons in the Purpose dropdown: Security's Visitors form without "Parent Visit" (sent in English) */
const VISIT_PURPOSES = ["Meeting", "Admission Enquiry", "Delivery", "Maintenance / Repair", "Event", "Interview"];
const OTHER_PURPOSE = "__other__";

/** Who fills this form (parents are registered by Security, not here) */
const CATEGORIES = [
  ["GUEST", "Guest / Visitor"],
  ["PARENT", "Parent / Guardian"],
  ["VENDOR", "Vendor / Delivery"],
  ["WORKER", "Worker / Staff"],
] as const;
const CATEGORY_VALUES: readonly string[] = CATEGORIES.map(([v]) => v);

const ADMISSION = REGISTER_BY_KEY.ADMISSION as EntryRegister;
/** Admission Book fields typed on the phone (date and times are set when Security lets them in) */
const ADMISSION_FIELDS: FieldDef[] = ADMISSION.fields.filter((f) => f.type !== "date" && f.type !== "time");

type VisitorsValues = {
  name: string;
  phone: string;
  vehicleNumber: string;
  onFoot: boolean;
  category: string;
  purpose: string;
  /** "Other" picked in Purpose: a box to type the reason */
  purposeOther: boolean;
  visitingStudent: string;
  department: string;
  address: string;
  remarks: string;
};

const EMPTY_VISITORS: VisitorsValues = {
  name: "",
  phone: "",
  vehicleNumber: "",
  onFoot: false,
  category: "GUEST",
  purpose: "",
  purposeOther: false,
  visitingStudent: "",
  department: "",
  address: "",
  remarks: "",
};

/** Who the visitor came for: a faculty / staff member (they give the exit code), or nobody specific */
type Meeting = { kind: "" | "HOST" | "NONE"; hostGroup: string; hostId: string };
const EMPTY_MEETING: Meeting = { kind: "", hostGroup: "", hostId: "" };

type Draft = { visitors: VisitorsValues; admission: Record<string, string>; meeting: Meeting };

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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        if (!CATEGORY_VALUES.includes(v.category)) v.category = EMPTY_VISITORS.category;
        setVisitors(v);
        setAdmission(draft.admission ?? {});
        const m = { ...EMPTY_MEETING, ...draft.meeting };
        const gone =
          (m.kind !== "" && m.kind !== "HOST" && m.kind !== "NONE") ||
          (m.kind === "HOST" && !!m.hostId && !res.hosts.some((h) => h.id === m.hostId));
        setMeeting(gone ? EMPTY_MEETING : { kind: m.kind, hostGroup: m.hostGroup, hostId: m.hostId });
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
    saveDraft(register, { visitors, admission, meeting } satisfies Draft);
  }, [register, visitors, admission, meeting, sending, showForm]);

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
  const setV = (patch: Partial<VisitorsValues>) => setVisitors((v) => ({ ...v, ...patch }));
  const setA = (key: string, value: string) => setAdmission((a) => ({ ...a, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !form) return;
    setError(null);
    if (isVisitors && !visitors.onFoot && !visitors.vehicleNumber.trim()) {
      setError(t("Enter the vehicle number, or choose On foot"));
      return;
    }
    if (!meeting.kind && hosts.length > 0) {
      setError(t("Choose who you are meeting"));
      return;
    }
    const host = meeting.kind === "HOST" ? hosts.find((h) => h.id === meeting.hostId) : undefined;
    if (meeting.kind === "HOST" && !host) {
      setError(t("Choose the person you are meeting from the list"));
      return;
    }

    let data: Record<string, unknown>;
    let typedName: string;
    if (isVisitors) {
      const { onFoot, purposeOther: _other, vehicleNumber, ...rest } = visitors;
      data = { ...rest, vehicleNumber: onFoot ? "" : vehicleNumber.trim().toUpperCase(), onFoot };
      typedName = visitors.name.trim();
    } else {
      data = Object.fromEntries(ADMISSION_FIELDS.map((f) => [f.key, (admission[f.key] ?? "").trim()]));
      typedName = (admission.parentName ?? "").trim();
    }

    setSending(true);
    const res = await submitVisit({ t: token, data, ...(host ? { hostProfileId: host.id } : {}) });
    setSending(false);
    if (res.ok) {
      const confirmation: SentVisit = {
        register: form.register,
        name: (typeof res.name === "string" && res.name.trim()) || typedName,
        at: typeof res.at === "string" && !Number.isNaN(Date.parse(res.at)) ? res.at : new Date().toISOString(),
        hostName: host?.name ?? null,
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
    setError(visitMessage(t, res.error));
  }

  const purposeValue = VISIT_PURPOSES.includes(visitors.purpose)
    ? visitors.purpose
    : visitors.purposeOther || visitors.purpose
    ? OTHER_PURPOSE
    : "";

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">{t("Fill in your details")}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t(isVisitors ? "Visitors Book & Pass" : "Admission Book & Pass")}
          {form.gate ? ` · ${form.gate}` : ""}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {t("Send this form. The security officer will check it and take your photo at the gate.")}
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={handleSubmit} className="space-y-6">
            {isVisitors ? (
              <>
                {/* Who */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="v-name" className={labelCls}>
                      {t("Full Name")} <span className="text-orange-500">*</span>
                    </label>
                    <Input
                      id="v-name"
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      autoCapitalize="words"
                      placeholder={t("Enter full name")}
                      value={visitors.name}
                      onChange={(e) => setV({ name: e.target.value })}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="v-phone" className={labelCls}>
                      {t("Phone Number")} <span className="text-orange-500">*</span>
                    </label>
                    <Input
                      id="v-phone"
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={15}
                      placeholder={t("Enter phone")}
                      value={visitors.phone}
                      onChange={(e) => setV({ phone: e.target.value })}
                      className="text-base"
                    />
                  </div>

                  {/* Vehicle number: required ("No vehicle" when on foot) */}
                  <div className="space-y-1.5">
                    <label htmlFor="v-vehicle" className={labelCls}>
                      {t("Vehicle Number")} <span className="text-orange-500">*</span>
                    </label>
                    <Input
                      id="v-vehicle"
                      required={!visitors.onFoot}
                      disabled={visitors.onFoot}
                      maxLength={30}
                      autoComplete="off"
                      autoCapitalize="characters"
                      placeholder={visitors.onFoot ? t("No vehicle") : t("E.g., TS 09 EA 1234")}
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
                </div>

                {/* Category: one tap */}
                <div className="space-y-1.5">
                  <p id="v-category" className={labelCls}>
                    {t("Category")}
                  </p>
                  <div role="radiogroup" aria-labelledby="v-category" className="grid grid-cols-3 gap-2">
                    {CATEGORIES.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={visitors.category === value}
                        onClick={() => setV({ category: value })}
                        className={chipCls(visitors.category === value)}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="v-purpose" className={labelCls}>
                    {t("Reason / Purpose of Visit")}
                  </label>
                  <ThemedSelect
                    id="v-purpose"
                    value={purposeValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      setV({ purposeOther: v === OTHER_PURPOSE, purpose: v === OTHER_PURPOSE ? "" : v });
                    }}
                    className={fieldCls}
                  >
                    <option value="">{t("— Select —")}</option>
                    {VISIT_PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {t(p)}
                      </option>
                    ))}
                    <option value={OTHER_PURPOSE}>{t("Other (type the reason)")}</option>
                  </ThemedSelect>
                  {purposeValue === OTHER_PURPOSE && (
                    <Input
                      id="v-purpose-other"
                      maxLength={200}
                      placeholder={t("Type the reason")}
                      aria-label={t("Type the reason")}
                      value={visitors.purpose}
                      onChange={(e) => setV({ purpose: e.target.value })}
                      className="text-base"
                    />
                  )}
                </div>

                <MeetingChoice
                  meeting={meeting}
                  setMeeting={setMeeting}
                  hostGroups={hostGroups}
                  groupLabel={groupLabel}
                  groupHosts={groupHosts}
                  hasHosts={hosts.length > 0}
                />

                {/* Other (optional) details */}
                <div className="space-y-4 border-t border-zinc-800/70 pt-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t("More details (optional)")}</p>
                  <div className="space-y-1.5">
                    <label htmlFor="v-visiting" className={labelCls}>
                      {t("Person to Visit")}
                    </label>
                    <Input
                      id="v-visiting"
                      maxLength={100}
                      placeholder={t("Name or Roll No of the person")}
                      value={visitors.visitingStudent}
                      onChange={(e) => setV({ visitingStudent: e.target.value })}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="v-department" className={labelCls}>
                      {t("Department")}
                    </label>
                    <DepartmentSelect
                      allowOther
                      id="v-department"
                      placeholder="Department being visited"
                      value={visitors.department}
                      onChange={(v) => setV({ department: v })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="v-address" className={labelCls}>
                      {t("Address")}
                    </label>
                    <Input
                      id="v-address"
                      maxLength={300}
                      autoComplete="street-address"
                      placeholder={t("Your address")}
                      value={visitors.address}
                      onChange={(e) => setV({ address: e.target.value })}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="v-remarks" className={labelCls}>
                      {t("Remarks")}
                    </label>
                    <Input
                      id="v-remarks"
                      maxLength={500}
                      placeholder={t("Any notes")}
                      value={visitors.remarks}
                      onChange={(e) => setV({ remarks: e.target.value })}
                      className="text-base"
                    />
                  </div>
                </div>
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

            <button type="submit" className={bigButtonCls} disabled={sending}>
              {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
              {sending ? t("Sending…") : t("Send to security")}
            </button>
          </form>
        </CardContent>
      </Card>
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
          placeholder={f.placeholder ? t(f.placeholder) : undefined}
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
          placeholder={f.placeholder ? t(f.placeholder) : undefined}
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
      {f.hint && <p className="text-xs text-zinc-500">{t(f.hint)}</p>}
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

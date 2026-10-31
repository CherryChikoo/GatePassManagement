"use client";

/**
 * Security checks a visitor who filled the form on their own phone (Show QR →
 * arrivals): everything they typed in labelled boxes, the name / mobile /
 * vehicle can be corrected, the photo is taken here (required), then Accept
 * (the normal Visitors Book visitor / Admission Book record is made) or
 * Reject with a reason (the phone says "Please speak to the security officer").
 *
 * The photo is compressed and uploaded the moment it is taken, like the
 * Visitors Book form, so Accept is usually instant.
 */
import { useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Loader2, RotateCcw, ShieldX, UserCheck } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Modal } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { callGate } from "@/lib/gate-call";
import { actionErrorMessage } from "@/lib/deployment";
import { compressPhoto } from "@/lib/images/compress-photo";
import { formatTime } from "@/lib/utils";
import { REGISTER_BY_KEY, type EntryRegister } from "@/lib/registers/definitions";
import type { Arrival } from "@/server/actions/visit-requests";

const PHONE_RE = /^\+?[0-9][0-9\s-]{8,16}[0-9]$/;
const ON_FOOT = "On foot";

/** Visitors Book categories as the manual form names them */
const CATEGORY_LABEL: Record<string, string> = {
  GUEST: "Guest / Visitor",
  PARENT: "Parent / Guardian",
  VENDOR: "Vendor / Delivery",
  WORKER: "Worker / Staff",
};

/** Reject chips (sent in English; "Other" sends the typed text) */
const REJECT_REASONS = ["Wrong details", "Not allowed now"];
const OTHER = "Other";

const ADMISSION_DEF = REGISTER_BY_KEY.ADMISSION as EntryRegister;
/** Shown as the correctable name / mobile, or set by the server at Accept */
const ADMISSION_SKIP = new Set(["parentName", "parentMobile", "visitDate", "timeIn", "timeOut", "direction"]);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

type Upload = { data: string; promise: Promise<{ path: string | null; error: string | null }> };

export function ArrivalReview({
  arrival,
  onClose,
  onDone,
}: {
  arrival: Arrival;
  onClose: () => void;
  /** Accepted or rejected: the message to show on the Show QR screen */
  onDone: (message: string) => void;
}) {
  const t = useT();
  const isVisitors = arrival.register === "VISITORS";
  const data = arrival.data ?? {};
  const sentVehicle = isVisitors ? str(data.vehicleNumber) : "";

  // Corrections (only changed values are sent)
  const [name, setName] = useState(arrival.name);
  const [phone, setPhone] = useState(arrival.phone);
  const [vehicle, setVehicle] = useState(sentVehicle);

  const [photo, setPhoto] = useState<string | null>(null);
  const upload = useRef<Upload | null>(null);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same camera tap again still fires
    if (!file) return;
    setError(null);
    try {
      const data = await compressPhoto(file);
      setPhoto(data);
      // Upload now, in the background: usually done before Accept is tapped
      upload.current = {
        data,
        promise: callGate("uploadOutsiderPhoto", [data, "visitor"], 30_000).catch(() => ({ path: null, error: "Photo upload failed" })),
      };
    } catch (err: any) {
      setError(t(err?.message || "Could not read the photo"));
    }
  };

  const accept = async () => {
    if (busy) return;
    setError(null);
    if (!photo) {
      setError(t("Take the visitor's photo before letting them in"));
      return;
    }
    const fixName = name.trim();
    const fixPhone = phone.trim();
    const fixVehicle = vehicle.trim();
    if (fixName.length < 2) return setError(t("Visitor name is required"));
    if (!PHONE_RE.test(fixPhone)) return setError(t("Enter a valid phone number (10–15 digits)"));
    if (isVisitors && !fixVehicle) return setError(t("Enter the vehicle number, or tap On foot"));

    setBusy("accept");
    try {
      // The upload started when the photo was taken; once more if it failed
      let path: string | null = null;
      if (upload.current?.data === photo) path = (await upload.current.promise).path;
      if (!path) {
        const res = await callGate("uploadOutsiderPhoto", [photo, fixName || "visitor"], 30_000);
        if (!res.path) {
          setError(t(res.error || "Photo upload failed"));
          return;
        }
        path = res.path;
        upload.current = { data: photo, promise: Promise.resolve(res) };
      }

      const fixes: { photoUrl: string; name?: string; phone?: string; vehicleNumber?: string } = { photoUrl: path };
      if (fixName !== arrival.name) fixes.name = fixName;
      if (fixPhone !== arrival.phone) fixes.phone = fixPhone;
      if (isVisitors && fixVehicle.toUpperCase() !== sentVehicle.toUpperCase()) {
        fixes.vehicleNumber = fixVehicle.toUpperCase() === ON_FOOT.toUpperCase() ? ON_FOOT : fixVehicle.toUpperCase();
      }
      const res = await callGate("acceptArrival", [arrival.id, fixes], 30_000);
      if ("error" in res) {
        setError(t(res.error));
        return;
      }
      onDone(t("{name} is let in.", { name: fixName }));
    } catch (err) {
      setError(actionErrorMessage(err, t("Could not let the visitor in. Please try again.")));
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (busy) return;
    setError(null);
    const why = reason === OTHER ? otherText.trim() : reason ?? "";
    if (why.length < 2) {
      setError(t("Choose or write a reason"));
      return;
    }
    setBusy("reject");
    try {
      const res = await callGate("rejectArrival", [arrival.id, why], 20_000);
      if ("error" in res) {
        setError(t(res.error));
        return;
      }
      onDone(t("{name} was turned away.", { name: arrival.name }));
    } catch (err) {
      setError(actionErrorMessage(err, t("Could not save. Please try again.")));
    } finally {
      setBusy(null);
    }
  };

  // Everything else the visitor typed, in the order of the manual form
  const facts: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => {
    if (value) facts.push({ label: t(label), value });
  };
  if (isVisitors) {
    const category = str(data.category);
    add("Category", category ? t(CATEGORY_LABEL[category] ?? category) : "");
    add("Reason / Purpose of Visit", str(data.purpose) && t(str(data.purpose)));
  }
  add("Meeting (faculty / staff)", arrival.hostName ?? "");
  add("Office work", arrival.officeName ?? "");
  if (isVisitors) {
    add("Person to Visit", str(data.visitingStudent));
    add("Department", str(data.department));
    add("Address", str(data.address));
    add("Remarks", str(data.remarks));
  } else {
    for (const f of ADMISSION_DEF.fields) {
      if (ADMISSION_SKIP.has(f.key)) continue;
      const v = str(data[f.key]);
      add(f.label, f.type === "select" ? t(v) : v);
    }
  }

  const labelCls = "field-label block text-sm font-medium text-zinc-300";

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={arrival.name}>
      <div className="space-y-5">
        <p className="text-sm text-zinc-500">
          {t("Sent at {time}", { time: formatTime(arrival.createdAt) })}
          {!arrival.mine && arrival.gate ? ` · ${t("Gate")}: ${arrival.gate}` : ""}
        </p>

        {/* Name / mobile / vehicle: Security may correct what the visitor typed */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="arrival-name" className={labelCls}>
              {t(isVisitors ? "Full Name" : "Parent / Guardian Name")}
            </label>
            <Input id="arrival-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="words" maxLength={100} className="text-base" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="arrival-phone" className={labelCls}>
              {t(isVisitors ? "Phone Number" : "Parent / Guardian Mobile Number")}
            </label>
            <div className="flex gap-2">
              <Input id="arrival-phone" wrapperClassName="min-w-0 flex-1" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" maxLength={20} className="text-base" />
              {PHONE_RE.test(arrival.phone) && (
                <a
                  href={`tel:${arrival.phone.replace(/[\s-]/g, "")}`}
                  className="inline-flex h-12 shrink-0 items-center rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-950"
                >
                  {t("Call")}
                </a>
              )}
            </div>
          </div>
          {isVisitors && (
            <div className="space-y-1.5">
              <label htmlFor="arrival-vehicle" className={labelCls}>
                {t("Vehicle Number")}
              </label>
              <div className="flex gap-2">
                <Input
                  id="arrival-vehicle"
                  wrapperClassName="min-w-0 flex-1"
                  value={vehicle === ON_FOOT ? t(ON_FOOT) : vehicle}
                  onChange={(e) => setVehicle(e.target.value.toUpperCase())}
                  onFocus={() => vehicle === ON_FOOT && setVehicle("")}
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={30}
                  className="text-base uppercase"
                />
                {vehicle !== ON_FOOT && (
                  <button
                    type="button"
                    onClick={() => setVehicle(ON_FOOT)}
                    className="inline-flex h-12 shrink-0 items-center rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-950"
                  >
                    {t(ON_FOOT)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Everything else, as typed */}
        {facts.length > 0 && (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <dt className="text-xs font-medium text-zinc-500">{f.label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-[15px] font-medium text-zinc-100">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Photo (required) */}
        <div className="space-y-2">
          <p className={labelCls}>
            {t("Visitor Photo")} <span className="text-orange-400">*</span>
          </p>
          {photo ? (
            <div className="flex items-center gap-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <img src={photo} alt="" className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
              <div className="min-w-0 space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {t("Photo Captured")}
                </p>
                <label
                  htmlFor="arrival-photo"
                  className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-950"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("Retake Photo")}
                </label>
              </div>
            </div>
          ) : (
            <label
              htmlFor="arrival-photo"
              className="flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-dashed border-orange-500/40 bg-orange-500/5 px-4 py-6 text-center transition-colors hover:bg-orange-500/10 active:bg-orange-500/10"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 text-white">
                <Camera className="h-7 w-7" />
              </span>
              <span className="text-base font-medium text-zinc-100">{t("Take Photo")}</span>
              <span className="text-xs text-zinc-500">{t("Capture the visitor's face with the device camera.")}</span>
            </label>
          )}
          <input id="arrival-photo" type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {!rejecting ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={accept}
              disabled={!!busy}
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-emerald-600 text-lg font-semibold text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,0.7)] transition-[background-color,transform] hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
            >
              {busy === "accept" ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserCheck className="h-5 w-5" />}
              {busy === "accept" ? t("Letting in…") : t("Accept")}
            </button>
            {!photo && <p className="text-center text-xs text-zinc-500">{t("Take the photo first, then tap Accept.")}</p>}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setRejecting(true);
              }}
              disabled={!!busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-red-500/30 bg-zinc-900 text-[15px] font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-60"
            >
              <ShieldX className="h-4 w-4" />
              {t("Reject")}
            </button>
          </div>
        ) : (
          <div className="space-y-3 rounded-3xl border border-red-500/25 bg-red-500/5 p-4">
            <p id="reject-reason" className="text-sm font-medium text-zinc-200">
              {t("Why is this visitor not allowed?")}
            </p>
            <div role="radiogroup" aria-labelledby="reject-reason" className="flex flex-wrap gap-2">
              {[...REJECT_REASONS, OTHER].map((r) => {
                const on = reason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setReason(r)}
                    className={
                      "h-11 rounded-full border px-4 text-sm font-medium transition-colors " +
                      (on ? "border-red-500 bg-red-600 text-white" : "border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-950")
                    }
                  >
                    {t(r)}
                  </button>
                );
              })}
            </div>
            {reason === OTHER && (
              <textarea
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                maxLength={200}
                rows={2}
                autoFocus
                placeholder={t("Write the reason")}
                aria-label={t("Write the reason")}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20"
              />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejecting(false);
                  setReason(null);
                  setError(null);
                }}
                disabled={!!busy}
                className="h-12 flex-1 rounded-full border border-zinc-800 bg-zinc-900 text-[15px] font-medium text-zinc-200 hover:bg-zinc-950 disabled:opacity-60"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={!!busy || !reason}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-red-600 text-[15px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === "reject" && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("Reject")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

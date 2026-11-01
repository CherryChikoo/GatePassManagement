"use client";

/**
 * Car Book and Auto Book (Security): 3 buttons like the Admission Book —
 * New trip (the register's form), New driver / car (register one so it shows in
 * the lists), Old records (the usual list, with its Mark In / Mark Out buttons).
 * Screens open in place: ?view=trip|new|log.
 */
import { useEffect, useMemo, useState } from "react";
import { Car, CarTaxiFront, CheckCircle2, History, Loader2, Route, Save, UserPlus } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { GoBackButton } from "@/components/ui/go-back-button";
import { Card, CardContent } from "@/components/ui/card";
import { HUB_PAGE_TOP, HubScreenHeader, HubTiles, useHubView } from "@/components/visits/hub-tiles";
import { EntryRegisterView } from "@/components/registers/entry-register-view";
import { RegisterForm, clearRegisterDraft, inputCls } from "@/components/registers/register-form";
import { invalidateVehicleOptions } from "@/components/registers/combo-input";
import { invalidateEntryLists } from "@/components/registers/entry-list-cache";
import { localizeRegister } from "@/components/registers/localize";
import { newClientToken } from "@/components/registers/format";
import { callGate } from "@/lib/gate-call";
import { actionErrorMessage } from "@/lib/deployment";
import { scrollPageToTop } from "@/lib/ui/scroll-top";
import { cn } from "@/lib/utils";
import type { EntryRegister } from "@/lib/registers/definitions";

const VIEWS = ["trip", "new", "log"] as const;

export function VehicleHub({ register, canCreate }: { register: EntryRegister; canCreate: boolean }) {
  const t = useT();
  const def = useMemo(() => localizeRegister(register, t), [register, t]);
  const isCar = register.key === "CAR_BOOK";
  const { view, go, back } = useHubView(VIEWS);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // ── New trip ──
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [token, setToken] = useState(newClientToken);
  const [formKey, setFormKey] = useState(0);
  const openView = (v: (typeof VIEWS)[number]) => {
    setNotice(null);
    setFormError(null);
    go(v);
  };
  async function save(payload: Parameters<Parameters<typeof RegisterForm>[0]["onSubmit"]>[0]) {
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const res: any = await callGate("createRegisterEntry", [register.key, payload, token]);
      if (res?.error) {
        setFormError(res.error);
        scrollPageToTop();
      } else {
        clearRegisterDraft(register.key);
        invalidateEntryLists(register.key);
        setToken(newClientToken());
        setFormKey((k) => k + 1);
        setNotice(t("Record saved."));
        // Saved: Old records, with the new trip on top (Mark In / Mark Out there)
        go("log", { replace: true });
      }
    } catch (err) {
      setFormError(actionErrorMessage(err, t("Could not save. Please try again.")));
      scrollPageToTop();
    }
    setBusy(false);
  }

  const noticeBox = notice && (
    <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
      <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
    </div>
  );

  if (view === "hub") {
    const Icon = isCar ? Car : CarTaxiFront;
    return (
      <div className={cn("space-y-5", HUB_PAGE_TOP)}>
        <div>
          <GoBackButton className="mb-3" />
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <Icon className="h-5 w-5" />
            </span>
            <h1 className="min-w-0 break-words text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">{def.title}</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{def.description}</p>
        </div>
        {noticeBox}
        <HubTiles
          tiles={[
            ...(canCreate
              ? [
                  {
                    key: "trip",
                    icon: Route,
                    title: t("New trip"),
                    hint: isCar ? t("Car going out or coming in") : t("Auto coming in or going out"),
                    primary: true,
                    onClick: () => openView("trip"),
                  },
                  {
                    key: "new",
                    icon: UserPlus,
                    title: t("New driver / car"),
                    hint: isCar ? t("Register a driver or a car") : t("Register a driver or an auto"),
                    onClick: () => openView("new"),
                  },
                ]
              : []),
            {
              key: "log",
              icon: History,
              title: t("Old records"),
              hint: t("Records of any day, and Mark In / Out"),
              onClick: () => openView("log"),
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", HUB_PAGE_TOP)}>
      <HubScreenHeader
        onBack={back}
        title={view === "trip" ? t("New trip") : view === "new" ? t("New driver / car") : t("Old records")}
        subtitle={def.title}
      />

      {view === "trip" &&
        (canCreate ? (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardContent className="p-5 sm:p-6">
                {formError && (
                  <div role="alert" className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {formError}
                  </div>
                )}
                <RegisterForm key={formKey} def={def} staff={[]} busy={busy} onSubmit={(payload) => void save(payload)} />
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t("You cannot add records to this register.")}</p>
        ))}

      {view === "new" &&
        (canCreate ? (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardContent className="p-5 sm:p-6">
                <FleetForm kind={isCar ? "Car" : "Auto"} />
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t("You cannot add records to this register.")}</p>
        ))}

      {view === "log" && (
        <>
          {noticeBox}
          <EntryRegisterView def={def} canCreate={canCreate} />
        </>
      )}
    </div>
  );
}

/**
 * New driver / car: saved as an ordinary record of the hidden "Drivers &
 * Vehicles" register (VEHICLE_FLEET). The lists in the trip form pick it up.
 */
function FleetForm({ kind }: { kind: "Car" | "Auto" }) {
  const t = useT();
  const [type, setType] = useState<"Car" | "Auto">(kind);
  const [v, setV] = useState({ driverName: "", driverPhone: "", vehicleName: "", vehicleNumber: "" });
  const [token, setToken] = useState(newClientToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    setSaved(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (![v.driverName, v.vehicleName, v.vehicleNumber].some((x) => x.trim())) {
      setError(t("Enter the driver's name, or the vehicle's name or number."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res: any = await callGate("createRegisterEntry", ["VEHICLE_FLEET", { fields: { ...v, vehicleType: type }, groups: {} }, token]);
      if (res?.error) {
        setError(res.error);
      } else {
        invalidateVehicleOptions();
        setToken(newClientToken());
        setSaved([v.driverName.trim(), [v.vehicleName.trim(), v.vehicleNumber.trim()].filter(Boolean).join(" · ")].filter(Boolean).join(" — "));
        setV({ driverName: "", driverPhone: "", vehicleName: "", vehicleNumber: "" });
      }
    } catch (err) {
      setError(actionErrorMessage(err, t("Could not save. Please try again.")));
    }
    setBusy(false);
  }

  const field = (k: keyof typeof v, label: string, extra?: { type?: string; placeholder?: string }) => (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={`fleet-${k}`} className="field-label block text-sm font-medium text-zinc-200">
        {label}
      </label>
      <input
        id={`fleet-${k}`}
        type={extra?.type ?? "text"}
        maxLength={k === "driverPhone" ? 15 : 200}
        autoComplete="off"
        value={v[k]}
        placeholder={extra?.placeholder}
        onChange={set(k)}
        className={inputCls}
      />
    </div>
  );

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5">
      {saved && (
        <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">
            {t("Saved")}: {saved}
          </span>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <fieldset>
        <legend className="sr-only">{t("Vehicle type")}</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-0.5">
          {(["Car", "Auto"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={type === k}
              onClick={() => setType(k)}
              className={cn(
                "min-h-11 rounded-lg px-2 text-sm font-semibold transition-colors",
                type === k ? "bg-zinc-900 text-orange-500 shadow-card ring-1 ring-orange-500/40" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {t(k)}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-zinc-500">{t("Enter the driver's name, or the vehicle's name or number. Fill both to save a driver and a vehicle.")}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("driverName", t("Driver Name"))}
        {field("driverPhone", t("Driver Phone"), { type: "tel" })}
        {field("vehicleName", type === "Car" ? t("Car Name") : t("Auto Name"), { placeholder: t("e.g. Innova") })}
        {field("vehicleNumber", type === "Car" ? t("Car Number") : t("Auto Number"), { placeholder: t("e.g. AP 39 T 1234") })}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-orange-600 text-base font-semibold text-white shadow-[0_6px_16px_-8px_rgba(207,62,37,0.55)] transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        {busy ? t("Saving…") : t("Save")}
      </button>
    </form>
  );
}

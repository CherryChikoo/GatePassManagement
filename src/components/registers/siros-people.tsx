"use client";

/**
 * Siros Venture labour form pieces: the coolies of an entry picked from the
 * registered ones (by name or number, like adding security to a shift), and
 * registering a new coolie / contractor with a photo (they get a number).
 */
import { useState } from "react";
import { ZoomablePhoto } from "@/components/ui/zoomable-photo";
import { Check, Info, Loader2, Plus, Search, UserPlus, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Modal } from "@/components/ui/primitives";
import { prefetchGateData, useGateData } from "@/lib/gate-cache";
import { callGate } from "@/lib/gate-call";
import { actionErrorMessage } from "@/lib/deployment";
import { cn, formatDate } from "@/lib/utils";
import { addSirosPerson, type SirosPerson } from "@/server/actions/siros-people";

type Values = Record<string, string>;
const PEOPLE_KEY = "siros-people";
// The people list changes only when someone registers; "who is inside" when an entry is saved / marked Out
const LIVE = ["reg:SIROS_PERSON"];
const INSIDE_LIVE = ["reg:SIROS_DAILY_LABOUR"];
export type SirosPeopleData = { people: SirosPerson[]; inside: { coolies: string[]; contractors: string[] } };

/** Everyone registered (shared by every box of the form; refreshed when someone registers). */
export function useSirosPeople(enabled: boolean): SirosPeopleData | null {
  const { data } = useGateData<{ people?: SirosPerson[] }>(
    enabled ? PEOPLE_KEY : null,
    () => callGate("listSirosPeople", [], 15_000) as Promise<{ people?: SirosPerson[] }>,
    LIVE
  );
  // Small and separate: a save elsewhere refreshes only this
  const inside = useGateData<{ inside?: SirosPeopleData["inside"] }>(
    enabled ? "siros-inside" : null,
    () => callGate("getSirosInside", [], 15_000) as Promise<{ inside?: SirosPeopleData["inside"] }>,
    INSIDE_LIVE
  );
  return data?.people ? { people: data.people, inside: inside.data?.inside ?? { coolies: [], contractors: [] } } : null;
}

/** "12 · Ramu" style label (the number is what the person tells the guard) */
const tag = (p: { no: number | string; name: string }) => `${p.no} · ${p.name}`;

function NoBadge({ no }: { no: number | string }) {
  return (
    <span className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 px-2 text-sm font-bold tabular-nums text-orange-600">
      {no}
    </span>
  );
}

/** The entry's coolies: the list with ✕, the count, and "+ Add coolie" (search by name or number). */
export function CooliePicker({
  rows,
  onChange,
  people,
}: {
  rows: Values[];
  onChange: (rows: Values[]) => void;
  people: SirosPeopleData | null;
}) {
  const t = useT();
  const added = rows.filter((r) => (r.name ?? "").trim() !== "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const coolies = (people?.people ?? []).filter((p) => p.kind === "COOLIE");
  // On another entry not yet marked Out: can't be added until then
  const isInside = (p: SirosPerson) => !!people?.inside.coolies.includes(String(p.no));
  const shown = q ? coolies.filter((p) => String(p.no) === q || String(p.no).startsWith(q) || p.name.toLowerCase().includes(q)) : coolies;
  const isAdded = (p: SirosPerson) => added.some((r) => r.no === String(p.no));
  const [viewNo, setViewNo] = useState<number | null>(null);

  return (
    <fieldset className="overflow-hidden rounded-2xl border border-zinc-800">
      <legend className="sr-only">{t("Coolies")}</legend>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/70 bg-zinc-950 px-4 py-3">
        <p className="text-base font-semibold text-zinc-100">{t("Coolies")}</p>
        <span className="rounded-full bg-orange-600 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-white">{added.length}</span>
      </div>
      {added.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-zinc-500">{t("No coolies added yet.")}</p>
      ) : (
        <ul className="divide-y divide-zinc-800/70">
          {added.map((r) => (
            <li key={r.no || r.name} className="flex min-h-14 items-center gap-3 px-4 py-2">
              {/* Tap for the coolie's full details */}
              <button
                type="button"
                onPointerDown={() => prefetchSirosPerson(r.no)}
                onClick={() => r.no && setViewNo(Number(r.no))}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition-colors hover:bg-zinc-950"
              >
                <NoBadge no={r.no || "—"} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-base font-medium text-zinc-100">{r.name}</span>
                  {r.gender && <span className="block text-xs text-zinc-500">{t(r.gender)}</span>}
                </span>
                {r.no && <Info className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />}
              </button>
              <button
                type="button"
                aria-label={t("Remove")}
                onClick={() => onChange(added.filter((x) => x !== r))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <X className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        className="flex h-14 w-full items-center justify-center gap-2 border-t border-zinc-800/70 bg-orange-500/10 text-base font-semibold text-orange-600 transition-colors hover:bg-orange-500/15"
      >
        <Plus className="h-5 w-5" /> {t("Add coolie")}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("Add coolie")} className="max-w-lg">
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Type name or number")}
              className="h-12 w-full rounded-full border border-zinc-800 bg-zinc-950 pl-11 pr-4 text-base text-zinc-100 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
          </label>
          <ul className="max-h-[55dvh] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800 divide-y divide-zinc-800/70">
            {people === null ? (
              <li className="px-4 py-6 text-center text-sm text-zinc-500">{t("Loading…")}</li>
            ) : shown.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-zinc-500">{t("Not found. Register them with “New coolie” below the form.")}</li>
            ) : (
              shown.map((p) => {
                const on = isAdded(p);
                const away = !on && isInside(p);
                return (
                  <li key={p.id} className="flex items-center">
                    <button
                      type="button"
                      disabled={on || away}
                      onClick={() => onChange([...added, { no: String(p.no), name: p.name, gender: p.gender ?? "" }])}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                        "min-w-0 flex-1",
                        on ? "bg-emerald-500/10" : away ? "cursor-not-allowed opacity-60" : "hover:bg-zinc-950"
                      )}
                    >
                      <NoBadge no={p.no} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-base text-zinc-100">{p.name}</span>
                        {p.gender && <span className="block text-xs text-zinc-500">{t(p.gender)}</span>}
                      </span>
                      {on ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("Added")}
                        </span>
                      ) : away ? (
                        <span className="shrink-0 rounded-full bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-zinc-500">{t("Inside — mark Out first")}</span>
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600">
                          <Plus className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onPointerDown={() => prefetchSirosPerson(p.no)}
                      onClick={() => setViewNo(p.no)}
                      aria-label={`${t("Details")} — ${p.name}`}
                      className="flex h-14 w-12 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-950 hover:text-zinc-100"
                    >
                      <Info className="h-5 w-5" />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 text-base font-semibold text-white shadow-card transition-[background-color,transform] hover:bg-orange-700 active:scale-[0.98]"
          >
            <Check className="h-5 w-5" /> {t("Done")}
          </button>
        </div>
      </Modal>
      <SirosPersonDialog no={viewNo} onClose={() => setViewNo(null)} />
    </fieldset>
  );
}

/**
 * "+ New coolie" / "+ New contractor" (bottom of the form): photo, name, and
 * gender (coolie) or phone (contractor). Saved at once; the number is shown
 * big so the guard can tell the person, and they are put on this entry.
 */
export function SirosNewPeople({
  renderPhoto,
  onRegistered,
}: {
  renderPhoto: (value: string, onChange: (v: string) => void) => React.ReactNode;
  onRegistered: (p: SirosPerson) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<"COOLIE" | "CONTRACTOR" | null>(null);
  const [photo, setPhoto] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SirosPerson | null>(null);

  const start = (k: "COOLIE" | "CONTRACTOR") => {
    setKind(k);
    setPhoto("");
    setName("");
    setGender("");
    setPhone("");
    setError(null);
    setDone(null);
  };
  const save = async () => {
    if (!kind || busy) return;
    setBusy(true);
    setError(null);
    const res: any = await addSirosPerson({ kind, name, gender, phone, photoUrl: photo }).catch((e) => ({
      error: actionErrorMessage(e, "Could not save. Please try again."),
    }));
    setBusy(false);
    if (res?.error) return setError(t(res.error));
    setDone(res.person);
    onRegistered(res.person);
  };

  const inputCls =
    "h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 text-base text-zinc-100 outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10";
  const newBtn =
    "flex min-h-12 w-full min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-center text-sm font-medium leading-tight text-zinc-200 shadow-card transition-colors hover:bg-zinc-950 sm:gap-2 sm:text-base";

  return (
    <>
      {/* Registering a first-timer: plain buttons, so they are not mistaken for "+ Add coolie" */}
      <div className="space-y-2.5 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4">
        <p className="text-sm font-medium text-zinc-400">{t("First time at the gate? Register them:")}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => start("COOLIE")} className={newBtn}>
          <UserPlus className="h-5 w-5 shrink-0" /> {t("New coolie")}
        </button>
        <button type="button" onClick={() => start("CONTRACTOR")} className={newBtn}>
          <UserPlus className="h-5 w-5 shrink-0" /> {t("New contractor")}
        </button>
      </div>
      </div>

      <Modal open={!!kind} onClose={() => !busy && setKind(null)} title={kind === "CONTRACTOR" ? t("New contractor") : t("New coolie")} className="max-w-lg">
        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-zinc-500">{t("Registered. Tell them their number:")}</p>
            <p className="text-6xl font-bold tabular-nums text-orange-600">{done.no}</p>
            <p className="text-lg font-semibold text-zinc-100">{done.name}</p>
            <p className="text-sm text-zinc-500">{done.kind === "CONTRACTOR" ? t("Filled in as the contractor of this entry.") : t("Added to this entry.")}</p>
            <button
              type="button"
              onClick={() => setKind(null)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 text-base font-semibold text-white hover:bg-orange-700"
            >
              <Check className="h-5 w-5" /> {t("Done")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Photo first (once, when they register) */}
            <div className="flex justify-center [&>*]:w-full [&>*]:max-w-[220px]">{renderPhoto(photo, setPhoto)}</div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-200">
                {t("Name")} <span className="text-orange-500">*</span>
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="off" className={inputCls} />
            </label>
            {kind === "COOLIE" ? (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium text-zinc-200">
                  {t("Gender")} <span className="text-orange-500">*</span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {["Male", "Female"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={gender === g}
                      onClick={() => setGender(g)}
                      className={cn(
                        "h-12 rounded-2xl border text-base font-semibold transition-colors",
                        gender === g ? "border-orange-500 bg-orange-500/10 text-orange-600" : "border-zinc-800 bg-zinc-900 text-zinc-300"
                      )}
                    >
                      {t(g)}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-200">{t("Phone Number")}</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={15} autoComplete="off" className={inputCls} />
              </label>
            )}
            {error && <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 text-base font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              <Check className="h-5 w-5" /> {busy ? t("Saving…") : t("Register and get number")}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Contractor box items: "7 · Ravi Constructions" (fills the name; the phone comes along) */
export function contractorItems(data: SirosPeopleData | null, typedBefore: string[] = []) {
  // Contractors still inside on an entry not marked Out are left out of the list
  const inside = new Set(data?.inside.contractors ?? []);
  const registered = (data?.people ?? [])
    .filter((p) => p.kind === "CONTRACTOR" && !inside.has(p.name.trim().toLowerCase()))
    .map((p) => ({ fill: p.name, label: tag(p), extra: p.phone ?? "" }));
  // Then names typed in earlier entries (not registered, not inside now)
  const known = new Set((data?.people ?? []).map((p) => p.name.trim().toLowerCase()));
  const typed = typedBefore
    .filter((n) => !known.has(n.trim().toLowerCase()) && !inside.has(n.trim().toLowerCase()))
    .map((n) => ({ fill: n }));
  return [...registered, ...typed];
}

type PersonDetails = {
  no: number;
  kind: "COOLIE" | "CONTRACTOR";
  name: string;
  gender: string | null;
  phone: string | null;
  photo: string | null;
  registeredAt: string;
  registeredBy: string;
  inside: boolean;
};

const personKey = (no: number) => `siros-person|${no}`;
const loadPerson = (no: number) => () =>
  callGate("getSirosPersonDetails", [no], 15_000) as Promise<{ person?: PersonDetails; error?: string }>;
/** Start loading a person's photo / registration before the details open (on touch). */
export function prefetchSirosPerson(no: number | string | null | undefined) {
  const n = Number(no);
  if (n > 0) prefetchGateData(personKey(n), loadPerson(n), LIVE);
}

/**
 * Full details of one coolie / contractor (by number). Name, number, gender / phone
 * and "inside now" show at once (from the list already on the phone); the photo and
 * "registered on / by" load in the background.
 */
export function SirosPersonDialog({ no, onClose }: { no: number | null; onClose: () => void }) {
  const t = useT();
  const list = useSirosPeople(no !== null);
  const known = no !== null ? list?.people.find((x) => x.no === no) ?? null : null;
  const { data, error, loading } = useGateData<{ person?: PersonDetails; error?: string }>(
    no ? personKey(no) : null,
    no ? loadPerson(no) : () => Promise.resolve({}),
    LIVE
  );
  const full = data?.person;
  const base = full ?? known;
  const inside =
    base && list
      ? base.kind === "COOLIE"
        ? list.inside.coolies.includes(String(base.no))
        : list.inside.contractors.includes(base.name.trim().toLowerCase())
      : !!full?.inside;
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-baseline gap-3 px-4 py-3">
      <dt className="text-base font-semibold text-zinc-300">{label}</dt>
      <dd className="min-w-0 break-words text-lg font-bold text-zinc-100">{value}</dd>
    </div>
  );
  const waiting = <span className="inline-block h-4 w-28 animate-pulse rounded bg-zinc-800" aria-hidden="true" />;
  return (
    <Modal open={!!no} onClose={onClose} title={base ? (base.kind === "CONTRACTOR" ? t("Contractor") : t("Coolie")) : t("Details")} className="max-w-md">
      {!base ? (
        <p className="flex items-center justify-center gap-2 py-10 text-base text-zinc-500">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {loading ? t("Loading…") : t(error ?? data?.error ?? "Not found")}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 text-center">
            {full?.photo ? (
              <ZoomablePhoto src={full.photo} alt={base.name} className="aspect-square w-44 rounded-3xl object-cover shadow-card" />
            ) : (
              <span className={cn("flex aspect-square w-44 items-center justify-center rounded-3xl bg-zinc-950 text-5xl font-bold text-zinc-400", !full && "animate-pulse")}>
                {base.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-2xl font-bold text-zinc-100">{base.name}</p>
              <p className="mt-1 inline-flex items-center gap-2">
                <span className="rounded-xl bg-orange-500/10 px-3 py-1 text-lg font-bold tabular-nums text-orange-600">
                  {t("No.")} {base.no}
                </span>
                <span className={cn("rounded-xl px-3 py-1 text-sm font-bold", inside ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-950 text-zinc-400")}>
                  {inside ? t("Inside now") : t("Not inside")}
                </span>
              </p>
            </div>
          </div>
          <dl className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900">
            {row(t("Type"), base.kind === "CONTRACTOR" ? t("Contractor") : t("Coolie"))}
            {base.gender && row(t("Gender"), t(base.gender))}
            {base.phone && row(t("Phone Number"), base.phone)}
            {row(t("Registered on"), full ? formatDate(full.registeredAt) : waiting)}
            {row(t("Registered by"), full ? full.registeredBy || "—" : waiting)}
          </dl>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-900 text-base font-semibold text-zinc-100 hover:bg-zinc-950"
          >
            {t("Close")}
          </button>
        </div>
      )}
    </Modal>
  );
}

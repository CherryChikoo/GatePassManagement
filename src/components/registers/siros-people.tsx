"use client";

/**
 * Siros Venture labour form pieces: the coolies of an entry picked from the
 * registered ones (by name or number, like adding security to a shift), and
 * registering a new coolie / contractor with a photo (they get a number).
 */
import { useRef, useState } from "react";
import { ZoomablePhoto } from "@/components/ui/zoomable-photo";
import { Check, Info, Loader2, Plus, Search, UserPlus, Users, X } from "lucide-react";
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

/**
 * The entry's coolies: the list with ✕, the count, and "+ Add coolie". The
 * pop-up starts with an empty search box: typing a name or number shows the
 * matching coolies (tap = added, the box clears for the next one); nobody
 * matching → "+ New coolie" registers them (photo, gender) and adds them.
 */
export function CooliePicker({
  rows,
  onChange,
  people,
  renderPhoto,
}: {
  rows: Values[];
  onChange: (rows: Values[]) => void;
  people: SirosPeopleData | null;
  /** The photo box of the new-coolie form */
  renderPhoto: (value: string, onChange: (v: string) => void) => React.ReactNode;
}) {
  const t = useT();
  const added = rows.filter((r) => (r.name ?? "").trim() !== "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const coolies = (people?.people ?? []).filter((p) => p.kind === "COOLIE");
  // On another entry not yet marked Out: can't be added until then
  const isInside = (p: SirosPerson) => !!people?.inside.coolies.includes(String(p.no));
  const isAdded = (p: SirosPerson) => added.some((r) => r.no === String(p.no));
  // Nothing typed: no list (the guard types a name or number)
  const shown = q
    ? coolies.filter((p) => String(p.no).startsWith(q) || p.name.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const exact = q !== "" && coolies.some((p) => p.name.trim().toLowerCase() === q || String(p.no) === q);
  const canAddNew = q !== "" && !/^\d+$/.test(q) && !exact;
  const [viewNo, setViewNo] = useState<number | null>(null);
  const add = (p: SirosPerson) => {
    onChange([...added, { no: String(p.no), name: p.name, gender: p.gender ?? "" }]);
    // Ready for the next one
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const remove = (r: Values) => onChange(added.filter((x) => x !== r));

  return (
    <fieldset className="overflow-hidden rounded-2xl border-[1.5px] border-zinc-700 bg-zinc-900">
      <legend className="sr-only">{t("Coolies")}</legend>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        <p className="flex items-center gap-2 text-lg font-bold text-zinc-100">
          <Users className="h-5 w-5 text-orange-600" aria-hidden="true" /> {t("Coolies")}
        </p>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-base font-bold tabular-nums",
            added.length ? "bg-emerald-600 text-white" : "border-[1.5px] border-zinc-700 bg-zinc-950 text-zinc-300"
          )}
        >
          {added.length}
        </span>
      </div>
      {added.length > 0 && (
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
                  <span className="block break-words text-lg font-semibold text-zinc-100">{r.name}</span>
                  {r.gender && <span className="block text-sm text-zinc-500">{t(r.gender)}</span>}
                </span>
                {r.no && <Info className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" />}
              </button>
              <button
                type="button"
                aria-label={`${t("Remove")} — ${r.name}`}
                onClick={() => remove(r)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700"
              >
                <X className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Not like the Save button: an outlined button inside the card */}
      <div className={cn("p-3", added.length > 0 && "border-t border-zinc-800")}>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setOpen(true);
          }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-500 bg-orange-50 text-lg font-bold text-orange-700 transition-[background-color,transform] hover:bg-orange-100 active:scale-[0.99]"
        >
          <UserPlus className="h-5 w-5" aria-hidden="true" /> {t("Add coolie")}
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("Add coolie")} className="max-w-lg">
        <div className="space-y-3">
          {/* Already on this entry: small tags, ✕ removes */}
          {added.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {added.map((r) => (
                <span key={r.no || r.name} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 py-1 pl-3 pr-1 text-sm font-semibold text-emerald-800">
                  {r.no ? `${r.no} · ` : ""}
                  {r.name}
                  <button
                    type="button"
                    aria-label={`${t("Remove")} — ${r.name}`}
                    onClick={() => remove(r)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-white hover:bg-emerald-800"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <label className="block space-y-1.5">
            <span className="text-base font-bold text-zinc-100">{t("Name or number")}</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                inputMode="search"
                autoComplete="off"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  // Enter: the only match is added
                  const free = shown.filter((p) => !isAdded(p) && !isInside(p));
                  if (free.length === 1) add(free[0]);
                }}
                className="h-14 w-full rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-950 pl-12 pr-4 text-lg text-zinc-100 outline-none focus:border-orange-500 focus:bg-zinc-900 focus:ring-4 focus:ring-orange-500/15"
              />
            </span>
          </label>

          {q !== "" && (
            <ul className="max-h-[45dvh] divide-y divide-zinc-800/70 overflow-y-auto overscroll-contain rounded-2xl border-[1.5px] border-zinc-700">
              {people === null ? (
                <li className="flex items-center justify-center gap-2 px-4 py-5 text-base text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {t("Loading…")}
                </li>
              ) : shown.length === 0 ? (
                <li className="px-4 py-4 text-center text-base font-semibold text-zinc-400">{t("No coolie with this name or number.")}</li>
              ) : (
                shown.map((p) => {
                  const on = isAdded(p);
                  const away = !on && isInside(p);
                  return (
                    <li key={p.id} className="flex items-center">
                      <button
                        type="button"
                        disabled={on || away}
                        onClick={() => add(p)}
                        className={cn(
                          "flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left transition-colors",
                          on ? "bg-emerald-500/10" : away ? "cursor-not-allowed opacity-60" : "hover:bg-orange-500/10 active:bg-orange-500/15"
                        )}
                      >
                        <NoBadge no={p.no} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-lg font-semibold text-zinc-100">{p.name}</span>
                          {p.gender && <span className="block text-sm text-zinc-500">{t(p.gender)}</span>}
                          {away && (
                            <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-2.5 py-0.5 text-sm font-semibold text-amber-700">
                              {t("Inside — mark Out first")}
                            </span>
                          )}
                        </span>
                        {on ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-sm font-bold text-white">
                            <Check className="h-4 w-4" aria-hidden="true" /> {t("Added")}
                          </span>
                        ) : away ? null : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-600 px-3 py-1.5 text-sm font-bold text-white">
                            <Plus className="h-4 w-4" aria-hidden="true" /> {t("Add")}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onPointerDown={() => prefetchSirosPerson(p.no)}
                        onClick={() => setViewNo(p.no)}
                        aria-label={`${t("Details")} — ${p.name}`}
                        className="flex h-16 w-12 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-950 hover:text-zinc-100"
                      >
                        <Info className="h-5 w-5" />
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}

          {/* Not registered yet: register this name now (photo, gender) */}
          {canAddNew && (
            <button
              type="button"
              onClick={() => setNewName(query.trim())}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-500 bg-orange-50 px-4 py-2 text-center text-base font-bold text-orange-700 hover:bg-orange-100"
            >
              <UserPlus className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{t("New coolie: {name}", { name: query.trim() })}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-card transition-[background-color,transform] hover:bg-emerald-700 active:scale-[0.98]"
          >
            <Check className="h-5 w-5" /> {t("Done")} {added.length > 0 && `· ${added.length}`}
          </button>
        </div>
      </Modal>
      <NewSirosPersonDialog
        kind={newName !== null ? "COOLIE" : null}
        initialName={newName ?? ""}
        renderPhoto={renderPhoto}
        onClose={() => setNewName(null)}
        onRegistered={(p) => {
          add(p);
        }}
      />
      <SirosPersonDialog no={viewNo} onClose={() => setViewNo(null)} />
    </fieldset>
  );
}

/**
 * Registering a coolie / contractor for the first time: photo, name, and gender
 * (coolie) or phone (contractor). Saved at once; the number is shown big so
 * the guard can tell the person.
 */
export function NewSirosPersonDialog({
  kind,
  initialName = "",
  renderPhoto,
  onClose,
  onRegistered,
}: {
  /** Open for this kind; null = closed */
  kind: "COOLIE" | "CONTRACTOR" | null;
  initialName?: string;
  renderPhoto: (value: string, onChange: (v: string) => void) => React.ReactNode;
  onClose: () => void;
  onRegistered: (p: SirosPerson) => void;
}) {
  const t = useT();
  const [photo, setPhoto] = useState("");
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SirosPerson | null>(null);
  // A fresh form each time it opens (with the typed name)
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = kind ? `${kind}|${initialName}` : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key) {
      setPhoto("");
      setName(initialName);
      setGender("");
      setPhone("");
      setError(null);
      setDone(null);
    }
  }

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
    "h-14 w-full rounded-2xl border-[1.5px] border-zinc-600 bg-zinc-950 px-4 text-lg text-zinc-100 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15";

  return (
    <Modal open={!!kind} onClose={() => !busy && onClose()} title={kind === "CONTRACTOR" ? t("New contractor") : t("New coolie")} className="max-w-lg">
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-base font-semibold text-zinc-400">{t("Registered. Tell them their number:")}</p>
          <p className="text-6xl font-bold tabular-nums text-orange-600">{done.no}</p>
          <p className="text-xl font-bold text-zinc-100">{done.name}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-bold text-white hover:bg-emerald-700"
          >
            <Check className="h-5 w-5" /> {t("Done")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Photo first (once, when they register) */}
          <div className="flex justify-center [&>*]:w-full [&>*]:max-w-[220px]">{renderPhoto(photo, setPhoto)}</div>
          <label className="block space-y-1.5">
            <span className="text-base font-bold text-zinc-100">
              {t("Name")} <span className="text-orange-500">*</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="off" className={inputCls} />
          </label>
          {kind === "COOLIE" ? (
            <fieldset className="space-y-1.5">
              <legend className="text-base font-bold text-zinc-100">
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
                      "h-14 rounded-2xl border-2 text-lg font-bold transition-colors",
                      gender === g ? "border-orange-600 bg-orange-600 text-white" : "border-zinc-700 bg-zinc-900 text-zinc-200"
                    )}
                  >
                    {t(g)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-base font-bold text-zinc-100">{t("Phone Number")}</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={15} autoComplete="off" className={inputCls} />
            </label>
          )}
          {error && <p role="alert" className="rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3 text-base font-bold text-red-700">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 text-lg font-bold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} {busy ? t("Saving…") : t("Register and get number")}
          </button>
        </div>
      )}
    </Modal>
  );
}

/**
 * Contractor box: type, and the matching contractors show under the box
 * (registered ones with their number, then names typed in earlier entries).
 * A name not in the list is simply saved ("New contractor") and suggested
 * from then on: no registering needed.
 */
export function ContractorInput({
  id,
  value,
  onChange,
  items,
  loading,
  onPick,
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  items: { fill: string; label?: string; extra?: string }[];
  loading: boolean;
  onPick?: (item: { fill: string; label?: string; extra?: string }) => void;
  required?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const q = value.trim().toLowerCase();
  const matches = (q ? items.filter((i) => (i.label ?? i.fill).toLowerCase().includes(q)) : items).slice(0, 8);
  const known = q !== "" && items.some((i) => i.fill.trim().toLowerCase() === q);
  const pick = (i: { fill: string; label?: string; extra?: string }) => {
    onChange(i.fill);
    onPick?.(i);
    setOpen(false);
    setHi(-1);
  };
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input
          id={id}
          value={value}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHi(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && matches.length) {
              e.preventDefault();
              setOpen(true);
              setHi((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp" && matches.length) {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (open && hi >= 0 && matches[hi]) pick(matches[hi]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="flex h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 pl-12 pr-4 text-base text-zinc-100 outline-none transition-colors focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
        />
        {open && (loading || matches.length > 0) && (
          <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-1 shadow-card">
            {loading ? (
              <li className="flex items-center gap-2 px-3 py-3 text-base text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" /> {t("Loading…")}
              </li>
            ) : (
              matches.map((i, n) => (
                <li key={`${i.fill}|${n}`} role="option" aria-selected={n === hi}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerEnter={() => setHi(n)}
                    onClick={() => pick(i)}
                    className={cn(
                      "flex min-h-12 w-full items-center rounded-xl px-3 py-2 text-left text-base font-semibold text-zinc-100 sm:min-h-14 sm:text-lg",
                      n === hi ? "bg-orange-500/15" : "hover:bg-orange-500/10"
                    )}
                  >
                    {i.label ?? i.fill}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {/* A name typed for the first time: saved with this entry and suggested next time.
          Shown once the guard has finished typing (list closed), so nothing jumps while typing */}
      {!open && q !== "" && !known && !loading && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-2.5 py-1 text-sm font-bold text-sky-700">
          <UserPlus className="h-4 w-4" aria-hidden="true" /> {t("New contractor — saved for next time")}
        </span>
      )}
    </div>
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

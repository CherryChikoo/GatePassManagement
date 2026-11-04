"use client";
import { useRouter } from "next/navigation";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowLeftRight,
  BedDouble,
  BedSingle,
  Briefcase,
  Car,
  CarTaxiFront,
  ChevronRight,
  CalendarClock,
  Truck,
  ClipboardCheck,
  ClipboardList,
  ContactRound,
  FileSignature,
  HardHat,
  House,
  KeyRound,
  NotebookPen,
  Package,
  PackageOpen,
  Plus,
  QrCode,
  School,
  Search,
  Shovel,
  ShieldCheck,
  Undo2,
  UsersRound,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { GoBackButton } from "@/components/ui/go-back-button";
import { REGISTERS, REGISTER_BY_KEY, SECURITY_EDITABLE_REGISTERS, isEntryRegister, type RegisterDef, type RegisterKey } from "@/lib/registers/definitions";
import { slugForKey } from "@/lib/registers/custom";
import { useGateData } from "@/lib/gate-cache";
import { REGISTER_COUNTS_QUERY } from "@/lib/gate-queries";
import { EntryRegisterView } from "./entry-register-view";
import { prefetchEntryList } from "./entry-list-cache";
import { useLiveTopics } from "@/lib/realtime/live";
import dynamic from "next/dynamic";
import { Modal } from "@/components/ui/primitives";
import { QuickEntryModal } from "./quick-entry";
import type { CheckInRegister } from "@/components/visits/arrival-alert";
import { warmCheckInQr } from "@/components/visits/checkin-qr-cache";
import { CheckInQrFrame, CheckInQrPlaceholder } from "@/components/visits/checkin-qr-frame";
import { AttendanceSheetView } from "./attendance-sheet";
import { SecurityDutyView, prefetchSecurityDuty } from "./security-duty";
import { prefetchMyDuties } from "./my-shift";
import { localizeRegister } from "./localize";
import { FacultyBookView,
  StudentBookView, HomeOutingSummaryView, HostelOutingView, VisitorsBookView } from "./derived-views";

export type RegisterViewer = "SECURITY" | "ADMIN" | "SECURITY_SUPERVISOR";

const BASE: Record<RegisterViewer, string> = {
  SECURITY: "/security",
  ADMIN: "/admin",
  SECURITY_SUPERVISOR: "/supervisor",
};

/** One recognisable icon per register (the list is long; icons make it scannable). */
/** Pass books (then Car Book and Auto Book) shown first on the registers list (lower = earlier); everything else keeps its order */
/** The registers list in sections, so guards find a register by what it is for */
const REGISTER_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Passes", keys: ["BOYS_HOSTEL_OUTING", "LADIES_HOSTEL_OUTING", "FACULTY_BOOK", "STUDENT_BOOK", "HOME_OUTING_SUMMARY"] },
  { title: "Visitors", keys: ["VISITORS", "ADMISSION"] },
  { title: "Vehicles", keys: ["CAR_BOOK", "AUTO_IN_OUT", "WORK_VEHICLES", "AUTO_BOOK"] },
  { title: "Stock & materials", keys: ["SIROS_STOCK", "COLLEGE_STOCK", "RETURNABLE"] },
  { title: "Labour", keys: ["DAILY_LABOUR", "LABOUR_CONTRACT", "SIROS_DAILY_LABOUR", "SIROS_LABOUR_CONTRACT", "COOLI_BOOK"] },
  { title: "Daily & keys", keys: ["COLLEGE_DAILY", "KEYS"] },
  { title: "Staff", keys: ["SECURITY_DAILY", "SECURITY_ATTENDANCE"] },
];
/** Each section's own colour (tile icon, border and heading) */
const GROUP_TONE: Record<string, { icon: string; border: string; text: string; dot: string }> = {
  Passes: { icon: "bg-sky-500/15 text-sky-700", border: "border-sky-500/25", text: "text-sky-700", dot: "bg-sky-500" },
  Visitors: { icon: "bg-emerald-500/15 text-emerald-700", border: "border-emerald-500/25", text: "text-emerald-700", dot: "bg-emerald-500" },
  Vehicles: { icon: "bg-purple-500/15 text-purple-700", border: "border-purple-500/25", text: "text-purple-700", dot: "bg-purple-500" },
  "Stock & materials": { icon: "bg-amber-500/15 text-amber-700", border: "border-amber-500/25", text: "text-amber-700", dot: "bg-amber-500" },
  Labour: { icon: "bg-orange-500/15 text-orange-600", border: "border-orange-500/25", text: "text-orange-600", dot: "bg-orange-500" },
  "Daily & keys": { icon: "bg-cyan-500/15 text-cyan-700", border: "border-cyan-500/25", text: "text-cyan-700", dot: "bg-cyan-500" },
  Staff: { icon: "bg-blue-500/15 text-blue-700", border: "border-blue-500/25", text: "text-blue-700", dot: "bg-blue-500" },
};
const OTHER_TONE = { icon: "bg-zinc-950 text-zinc-300", border: "border-zinc-700", text: "text-zinc-400", dot: "bg-zinc-400" };

/** Registers in no section above (e.g. created in the portal) */
const OTHER_GROUP = "Other registers";

const PASS_BOOK_ORDER = ["BOYS_HOSTEL_OUTING", "LADIES_HOSTEL_OUTING", "FACULTY_BOOK", "STUDENT_BOOK", "CAR_BOOK", "AUTO_IN_OUT"];
const passBookRank = (key: string) => {
  const i = PASS_BOOK_ORDER.indexOf(key);
  return i < 0 ? PASS_BOOK_ORDER.length : i;
};

const REGISTER_ICON: Record<RegisterKey, LucideIcon> = {
  FACULTY_BOOK: Briefcase,
  VISITORS: ContactRound,
  STUDENT_BOOK: GraduationCap,
  ADMISSION: School,
  CAR_BOOK: Car,
  AUTO_BOOK: CarTaxiFront,
  DAILY_LABOUR: HardHat,
  LABOUR_CONTRACT: FileSignature,
  SIROS_STOCK: Package,
  COLLEGE_STOCK: PackageOpen,
  SIROS_LABOUR_CONTRACT: UsersRound,
  SIROS_DAILY_LABOUR: HardHat,
  COOLI_BOOK: Shovel,
  COLLEGE_DAILY: NotebookPen,
  BOYS_HOSTEL_OUTING: BedDouble,
  LADIES_HOSTEL_OUTING: BedSingle,
  SECURITY_DAILY: ShieldCheck,
  SECURITY_ATTENDANCE: ClipboardCheck,
  HOME_OUTING_SUMMARY: House,
  AUTO_IN_OUT: ArrowLeftRight,
  WORK_VEHICLES: Truck,
  KEYS: KeyRound,
  RETURNABLE: Undo2,
  VEHICLE_FLEET: Car,
};


/** Show QR (QR code library + visitor review): loaded only when a QR button is
 *  touched, so the registers list itself stays light. Meanwhile the pop-up shows
 *  the QR's own frame with a QR-shaped placeholder (nothing moves when it loads). */
const loadCheckInQrScreen = () => import("@/components/visits/checkin-qr-screen");
const CheckInQrScreen = dynamic(() => loadCheckInQrScreen().then((m) => m.CheckInQrScreen), {
  ssr: false,
  loading: () => (
    <CheckInQrFrame inModal>
      <CheckInQrPlaceholder />
    </CheckInQrFrame>
  ),
});

/** A QR button was touched: its code, the QR (only if none is kept) and the drawing code start loading */
function warmQr(register: CheckInRegister) {
  void loadCheckInQrScreen().catch(() => {});
  warmCheckInQr(register);
}

/** The register last opened from the list: coming back shows the list at that register */
const LAST_OPENED_KEY = "gatepass:last-register";
const LAST_OPENED_MAX_AGE_MS = 6 * 60 * 60_000;

function rememberOpenedRegister(key: string) {
  try {
    sessionStorage.setItem(LAST_OPENED_KEY, JSON.stringify({ key, at: Date.now() }));
  } catch {}
}

export function RegistersHub({
  viewer,
  hidden = [],
  creatable = [],
  registers,
  extraRegisters,
  canBuild = false,
}: {
  viewer: RegisterViewer;
  hidden?: string[];
  /** Registers this user may add to: they get a "+" that opens the form right here */
  creatable?: string[];
  /** Built-in + portal-created registers (from the server); defaults to the built-in ones */
  registers?: RegisterDef[];
  /** Only the registers made in the portal (the built-in ones are already in the app): a much smaller page */
  extraRegisters?: RegisterDef[];
  /** Main Admin / Security Supervisor: show "Create & manage registers" */
  canBuild?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const base = BASE[viewer];
  const isSecurity = viewer === "SECURITY";
  const allRegisters = registers ?? [...REGISTERS, ...(extraRegisters ?? [])];
  // Today's counts: the last ones show at once; fetched again only when a register
  // changed (live) — the gate cache (src/lib/gate-cache.ts) keeps them between visits.
  // The live listener keeps the connection up while this list is open.
  const countsData = useGateData<Record<string, number>>(REGISTER_COUNTS_QUERY.key, REGISTER_COUNTS_QUERY.fetch, REGISTER_COUNTS_QUERY.topics);
  const counts = countsData.data ?? {};
  useLiveTopics(["reg:"], () => {});
  // Guards: their shift details are ready before they tap the button (no request while the kept copy is fresh)
  useEffect(() => {
    if (isSecurity) prefetchMyDuties();
  }, [isSecurity]);

  const [query, setQuery] = useState("");
  const [quickKey, setQuickKey] = useState<string | null>(null);
  // Visitors Book / Admission Book: the check-in QR shown as a pop-up right on the list
  const [qrKey, setQrKey] = useState<CheckInRegister | null>(null);

  // Back from a register: the list opens where that register is (not at the top),
  // and its row glows for a moment so the guard sees where they were
  useEffect(() => {
    let saved: { key?: string; at?: number } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(LAST_OPENED_KEY) || "null");
    } catch {}
    if (!saved?.key || !saved.at || Date.now() - saved.at > LAST_OPENED_MAX_AGE_MS) return;
    const row = document.querySelector<HTMLElement>(`[data-register-row="${CSS.escape(saved.key)}"]`);
    if (!row) return;
    // After the router's own scroll on arrival
    const frame = requestAnimationFrame(() => row.scrollIntoView({ block: "center" }));
    // A soft pulse: the tile lifts a little and an orange glow spreads out and fades (twice)
    row.classList.add("animate-return");
    const timer = setTimeout(() => row.classList.remove("animate-return"), 1700);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  // The pass books come first (hostel outings, faculty, students), then the rest in their usual order
  const visible = allRegisters
    .filter((r) => !hidden.includes(r.key))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => passBookRank(a.r.key) - passBookRank(b.r.key) || a.i - b.i)
    .map(({ r }) => r);
  const q = query.trim().toLowerCase();
  const list = q
    ? visible.filter((r) => `${r.title} ${t(r.title)} ${r.description} ${t(r.description)}`.toLowerCase().includes(q))
    : visible;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {!isSecurity && <BackButton href={base} label={t("Back to Dashboard")} />}
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 flex flex-wrap items-center gap-2">
            {t(isSecurity ? "Registers" : "Security Registers")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isSecurity
              ? t("Tap + to add an entry straight away, or open a register to see its records.")
              : t("All gate registers. Security cannot change saved records; only Main Admin can edit or delete them.")}
          </p>
        </div>
        {canBuild && (
          <Link
            href={`${base}/registers/manage`}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 shadow-card hover:bg-zinc-950 transition-colors"
          >
            <Plus className="h-4 w-4 text-orange-400" />
            <span className="hidden sm:inline">{t("Create & manage registers")}</span>
            <span className="sm:hidden">{t("New register")}</span>
          </Link>
        )}
      </div>

      {/* Every guard: their own shifts, with Start / End duty */}
      {isSecurity && (
        <Link
          href="/security/my-shift"
          // Fully preloaded (the page itself is tiny), so opening it shows no loading screen
          prefetch={true}
          // Back from My shift: the list opens here, with this button glowing (like the registers)
          data-register-row="MY_SHIFT"
          onClick={() => rememberOpenedRegister("MY_SHIFT")}
          onPointerDown={() => {
            router.prefetch("/security/my-shift");
            prefetchMyDuties();
          }}
          onFocus={prefetchMyDuties}
          className="flex items-center gap-3 rounded-3xl border border-orange-500/30 bg-zinc-900 px-4 py-4 shadow-card transition-[background-color,transform] hover:bg-orange-500/5 active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white">
            <CalendarClock className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold leading-snug text-zinc-100">{t("My shift details")}</span>
            <span className="block text-sm text-zinc-500">{t("Start and end your duty")}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden="true" />
        </Link>
      )}

      {/* Find a register quickly */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search registers…")}
          aria-label={t("Search registers…")}
          className="h-12 w-full rounded-full border border-zinc-800 bg-zinc-900 pl-11 pr-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
        />
      </div>

      {list.length === 0 && (
        <p className="rounded-3xl border border-zinc-800/80 bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-500 shadow-card">
          {t("No register matches your search.")}
        </p>
      )}
      {[...REGISTER_GROUPS, { title: OTHER_GROUP, keys: [] as string[] }].map((group) => {
        const known = new Set(REGISTER_GROUPS.flatMap((g) => g.keys));
        const rows = list.filter((r) => (group.title === OTHER_GROUP ? !known.has(r.key) : group.keys.includes(r.key)));
        if (rows.length === 0) return null;
        return (
      <section key={group.title} className="space-y-2.5">
        {isSecurity ? (
          <h2 className={cn("flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide", (GROUP_TONE[group.title] ?? OTHER_TONE).text)}>
            <span className={cn("h-2.5 w-2.5 rounded-full", (GROUP_TONE[group.title] ?? OTHER_TONE).dot)} aria-hidden="true" />
            {t(group.title)}
          </h2>
        ) : (
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(group.title)}</h2>
        )}
      <ul
        className={
          isSecurity
            ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
            : "overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card divide-y divide-zinc-800/70"
        }
      >
        {rows.map((r) => {
          const Icon = REGISTER_ICON[r.key as RegisterKey] ?? ClipboardList;
          // Security: the Visitors Book is the Visitors screen itself (its 4 buttons; no second visitors screen)
          const href = isSecurity && r.key === "VISITORS" ? "/security/visitors" : `${base}/registers/${slugForKey(r.key)}`;
          const n = counts[r.key] ?? 0;
          // Visitors Book / Admission Book: a QR button shows the check-in QR here (visitors fill the form on their phone)
          const checkInQr = isSecurity && (r.key === "VISITORS" || (r.key === "ADMISSION" && creatable.includes(r.key)));
          // "+": entry registers open their form here
          // Attendance opens its monthly sheet instead of a form
          const quickAdd = isEntryRegister(r) && creatable.includes(r.key) && !["SECURITY_ATTENDANCE", "SECURITY_DAILY"].includes(r.key);
          // On touch: the register's page and its list start loading while the tap completes
          const prefetch = () => {
            router.prefetch(href);
            if (isEntryRegister(r) && !["SECURITY_ATTENDANCE", "SECURITY_DAILY"].includes(r.key)) prefetchEntryList(r.key);
            if (r.key === "SECURITY_DAILY") prefetchSecurityDuty();
          };
          const tone = GROUP_TONE[group.title] ?? OTHER_TONE;
          const tileName = r.key === "VISITORS" ? t("Visitors Book") : t(r.title);
          if (isSecurity) {
            const action = checkInQr ? (
              <button
                type="button"
                onPointerDown={() => warmQr(r.key as CheckInRegister)}
                onFocus={() => warmQr(r.key as CheckInRegister)}
                onClick={() => setQrKey(r.key as CheckInRegister)}
                aria-label={`${t("Show QR")} — ${tileName}`}
                className="absolute right-2.5 top-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] transition-[background-color,transform] hover:bg-orange-700 active:scale-95"
              >
                <QrCode className="h-5 w-5" />
              </button>
            ) : quickAdd ? (
              <button
                type="button"
                onClick={() => setQuickKey(r.key)}
                aria-label={`${t("New entry")} — ${tileName}`}
                className="absolute right-2.5 top-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] transition-[background-color,transform] hover:bg-orange-700 active:scale-95"
              >
                <Plus className="h-5 w-5" />
              </button>
            ) : null;
            return (
              <li key={r.key} data-register-row={r.key} className="relative min-w-0 rounded-3xl transition-colors duration-700">
                <Link
                  href={href}
                  // Fully preloaded while on screen (live site): a tap opens the register without the loading screen.
                  // Light: these pages do no database work of their own (kept lookups), and are reused for 5 minutes.
                  prefetch={true}
                  onPointerDown={prefetch}
                  onFocus={prefetch}
                  onClick={() => rememberOpenedRegister(r.key)}
                  className={cn(
                    "flex h-full min-h-[8.5rem] flex-col gap-2 rounded-3xl border-[1.5px] bg-zinc-900 p-3.5 shadow-card transition-[background-color,transform] hover:bg-zinc-950 active:scale-[0.98]",
                    tone.border,
                    action && "pr-14"
                  )}
                >
                  <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tone.icon)}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="break-words text-base font-bold leading-snug text-zinc-100 sm:text-lg">{tileName}</span>
                  {n > 0 && (
                    <span className="mt-auto w-fit rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-zinc-300">
                      {t("{n} today", { n })}
                    </span>
                  )}
                </Link>
                {action}
              </li>
            );
          }
          return (
            <li key={r.key} data-register-row={r.key} className="flex items-center gap-2 pr-2 sm:pr-3 transition-colors duration-700">
              <Link
                href={href}
                // Start loading the list on tap, while the page opens
                onPointerDown={prefetch}
                onFocus={prefetch}
                onClick={() => rememberOpenedRegister(r.key)}
                className="group flex min-w-0 flex-1 items-center gap-3 px-3 sm:px-4 py-3.5 hover:bg-zinc-950/70 transition-colors"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 min-w-0">
                    {/* Security: just the name, large (wraps to a second line instead of cutting off) */}
                    <span
                      className={
                        isSecurity
                          ? "line-clamp-2 text-lg font-semibold leading-snug text-zinc-100"
                          : "truncate text-[15px] font-medium text-zinc-100"
                      }
                    >
                      {/* Security: this row opens the Visitors screen; named "Visitors Book" */}
                      {isSecurity && r.key === "VISITORS" ? t("Visitors Book") : t(r.title)}
                    </span>
                    {n > 0 && (
                      <span className="shrink-0 rounded-full bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400 tabular-nums">
                        {t("{n} today", { n })}
                      </span>
                    )}
                  </span>
                  {!isSecurity && <span className="mt-0.5 block truncate text-xs text-zinc-500">{t(r.description)}</span>}
                </span>
              </Link>
              {checkInQr ? (
                <button
                  type="button"
                  // The QR screen's code and the QR start loading while the tap completes
                  // (no request when a usable QR is already kept in this tab)
                  onPointerDown={() => warmQr(r.key as CheckInRegister)}
                  onFocus={() => warmQr(r.key as CheckInRegister)}
                  onClick={() => setQrKey(r.key as CheckInRegister)}
                  aria-label={`${t("Show QR")} — ${r.key === "VISITORS" ? t("Visitors Book") : t(r.title)}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] hover:bg-orange-700 active:scale-95 transition-[background-color,transform]"
                >
                  <QrCode className="h-5 w-5" />
                </button>
              ) : quickAdd ? (
                <button
                  type="button"
                  onClick={() => setQuickKey(r.key)}
                  aria-label={`${t("New entry")} — ${t(r.title)}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] hover:bg-orange-700 active:scale-95 transition-[background-color,transform]"
                >
                  <Plus className="h-5 w-5" />
                </button>
              ) : (
                <Link href={href} aria-hidden="true" tabIndex={-1} className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-600">
                  <ChevronRight className="h-5 w-5" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      </section>
        );
      })}

      {quickKey && (
        <QuickEntryModal
          registerKey={quickKey}
          def={allRegisters.find((r) => r.key === quickKey)}
          onClose={() => setQuickKey(null)}
          onSaved={() => void countsData.reload()}
        />
      )}

      {qrKey && (
        <Modal
          open
          onClose={() => setQrKey(null)}
          // Short, so it fits beside "Go Back" on a phone (also in Telugu)
          title={`${t(qrKey === "VISITORS" ? "Visitors" : "Admission")} QR`}
          className="max-w-xl"
        >
          <CheckInQrScreen key={qrKey} register={qrKey} inModal />
        </Modal>
      )}
    </div>
  );
}

export function RegisterPage({
  registerKey,
  viewer,
  canCreate,
  register,
}: {
  registerKey: string;
  viewer: RegisterViewer;
  /** May add entries (decided on the server, e.g. attendance = Head Security / Admin) */
  canCreate: boolean;
  /** The definition when it isn't built in (portal-created registers) */
  register?: RegisterDef;
}) {
  const t = useT();
  // Display copy in the reader's language (saved values and validation stay on the original)
  const def = useMemo(
    () => localizeRegister(register ?? REGISTER_BY_KEY[registerKey as RegisterKey], t),
    [register, registerKey, t]
  );
  const base = BASE[viewer];
  const isSecurity = viewer === "SECURITY";

  let body: React.ReactNode;
  if (def.key === "SECURITY_DAILY") {
    // Duty plan for the coming days (Head Security)
    body = <SecurityDutyView />;
  } else if (def.key === "SECURITY_ATTENDANCE") {
    // Monthly sheet like the paper register (marks + day remarks)
    body = <AttendanceSheetView />;
  } else if (isEntryRegister(def)) {
    body = (
      <EntryRegisterView
        def={def}
        canCreate={canCreate}
        canAdminEdit={viewer === "ADMIN"}
        canEdit={isSecurity && SECURITY_EDITABLE_REGISTERS.includes(def.key)}
      />
    );
  } else if (def.key === "FACULTY_BOOK") {
    body = <FacultyBookView canMarkIn={isSecurity} />;
  } else if (def.key === "STUDENT_BOOK") {
    body = <StudentBookView />;
  } else if (def.key === "VISITORS") {
    body = <VisitorsBookView canRegister={isSecurity} canAdminEdit={viewer === "ADMIN"} />;
  } else if (def.key === "BOYS_HOSTEL_OUTING") {
    body = <HostelOutingView hostel="BOYS" />;
  } else if (def.key === "LADIES_HOSTEL_OUTING") {
    body = <HostelOutingView hostel="LADIES" />;
  }

  const header = (
    <div>
      {isSecurity ? <GoBackButton className="mb-3" /> : <BackButton href={`${base}/registers`} label={t("All registers")} />}
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
        {def.title}
      </h1>
      {!isSecurity && <p className="text-sm text-zinc-400 mt-1">{def.description}</p>}
    </div>
  );
  // Home outing passbook: two buttons (Information / Counts); its screens have their own "←" heading
  if (!body) return <HomeOutingSummaryView header={header} title={def.title} />;

  return (
    // Duty plan: centred with its heading on wide screens (two columns from lg)
    <div className={def.key === "SECURITY_DAILY" ? "mx-auto w-full max-w-[1100px] space-y-5" : "space-y-5"}>
      {header}
      {body}
    </div>
  );
}

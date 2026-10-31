"use client";
import { useRouter } from "next/navigation";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  BedDouble,
  BedSingle,
  Briefcase,
  Car,
  CarTaxiFront,
  ChevronRight,
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
import { QuickEntryModal } from "./quick-entry";
import { AttendanceSheetView } from "./attendance-sheet";
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
/** Pass books shown first on the registers list (lower = earlier); everything else keeps its order */
const PASS_BOOK_ORDER = ["BOYS_HOSTEL_OUTING", "LADIES_HOSTEL_OUTING", "FACULTY_BOOK", "STUDENT_BOOK"];
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
  KEYS: KeyRound,
  RETURNABLE: Undo2,
};


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
  canBuild = false,
}: {
  viewer: RegisterViewer;
  hidden?: string[];
  /** Registers this user may add to: they get a "+" that opens the form right here */
  creatable?: string[];
  /** Built-in + portal-created registers (from the server); defaults to the built-in ones */
  registers?: RegisterDef[];
  /** Main Admin / Security Supervisor: show "Create & manage registers" */
  canBuild?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const base = BASE[viewer];
  const isSecurity = viewer === "SECURITY";
  const allRegisters = registers ?? REGISTERS;
  // Today's counts: the last ones show at once; fetched again only when a register
  // changed (live) — the gate cache (src/lib/gate-cache.ts) keeps them between visits.
  // The live listener keeps the connection up while this list is open.
  const countsData = useGateData<Record<string, number>>(REGISTER_COUNTS_QUERY.key, REGISTER_COUNTS_QUERY.fetch, REGISTER_COUNTS_QUERY.topics);
  const counts = countsData.data ?? {};
  useLiveTopics(["reg:"], () => {});

  const [query, setQuery] = useState("");
  const [quickKey, setQuickKey] = useState<string | null>(null);

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
    row.classList.add("bg-orange-500/10");
    const timer = setTimeout(() => row.classList.remove("bg-orange-500/10"), 1500);
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

      <ul className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card divide-y divide-zinc-800/70">
        {list.map((r) => {
          const Icon = REGISTER_ICON[r.key as RegisterKey] ?? ClipboardList;
          // Security: the Visitors Book is the Visitors screen itself (no second visitors screen)
          const href = isSecurity && r.key === "VISITORS" ? "/security/visitors?view=log" : `${base}/registers/${slugForKey(r.key)}`;
          const n = counts[r.key] ?? 0;
          // "+": entry registers open their form here; the visitors book opens visitor registration
          // Attendance opens its monthly sheet instead of a form
          const quickAdd = isEntryRegister(r) && creatable.includes(r.key) && r.key !== "SECURITY_ATTENDANCE";
          const visitorAdd = isSecurity && r.key === "VISITORS";
          // On touch: the register's page and its list start loading while the tap completes
          const prefetch = () => {
            router.prefetch(href);
            if (isEntryRegister(r) && r.key !== "SECURITY_ATTENDANCE") prefetchEntryList(r.key);
          };
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
              {quickAdd ? (
                <button
                  type="button"
                  onClick={() => setQuickKey(r.key)}
                  aria-label={`${t("New entry")} — ${t(r.title)}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] hover:bg-orange-700 active:scale-95 transition-[background-color,transform]"
                >
                  <Plus className="h-5 w-5" />
                </button>
              ) : visitorAdd ? (
                <Link
                  href="/security/visitors?view=new"
                  aria-label={t("New visitor")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)] hover:bg-orange-700 active:scale-95 transition-[background-color,transform]"
                >
                  <Plus className="h-5 w-5" />
                </Link>
              ) : (
                <Link href={href} aria-hidden="true" tabIndex={-1} className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-600">
                  <ChevronRight className="h-5 w-5" />
                </Link>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-zinc-500">{t("No register matches your search.")}</li>}
      </ul>

      {quickKey && (
        <QuickEntryModal
          registerKey={quickKey}
          def={allRegisters.find((r) => r.key === quickKey)}
          onClose={() => setQuickKey(null)}
          onSaved={() => void countsData.reload()}
        />
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
  if (def.key === "SECURITY_ATTENDANCE") {
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
  } else {
    body = <HomeOutingSummaryView />;
  }

  return (
    <div className="space-y-5">
      <div>
        {isSecurity ? <GoBackButton className="mb-3" /> : <BackButton href={`${base}/registers`} label={t("All registers")} />}
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
          {def.title}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{def.description}</p>
      </div>
      {body}
    </div>
  );
}

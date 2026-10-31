"use client";

/**
 * "Parent of a student?" box at the top of the Visitors form: type a roll
 * number or name, pick the student, then tap Father / Mother / Guardian and
 * the form fills itself from the student's saved parent details.
 */
import { useEffect, useReducer, useState } from "react";
import { GraduationCap, Loader2, Search, UserRound, X } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { callGate } from "@/lib/gate-call";
import type { StudentParents } from "@/server/actions/visit-requests";

export type ParentWho = "FATHER" | "MOTHER" | "GUARDIAN";

/** The parent's name and mobile for the chosen button (null when not saved). */
export function parentOf(s: StudentParents, who: ParentWho): { name: string; phone: string } | null {
  const [name, phone] =
    who === "FATHER" ? [s.fatherName, s.fatherPhone] : who === "MOTHER" ? [s.motherName, s.motherPhone] : [s.guardianName, s.guardianPhone];
  return name?.trim() ? { name: name.trim(), phone: phone?.trim() ?? "" } : null;
}

// ─── Answers kept for this visit to the page ─────────────────────────────────

/** The server sends at most this many students for one search. */
const MAX_ROWS = 10;
/** Wait after the last key before asking the server. */
const DEBOUNCE_MS = 175;

/**
 * Same rules as the server: a search with a digit is a roll number (saved in
 * CAPITALS, "starts with", from 2 characters); otherwise a name ("contains",
 * from 3 letters). The key tells both apart so their answers never mix.
 */
function searchKey(query: string): { q: string; key: string; roll: boolean } | null {
  const q = query.trim().slice(0, 50);
  const roll = /\d/.test(q);
  if (q.length < (roll ? 2 : 3)) return null;
  return { q, roll, key: roll ? `r:${q.toUpperCase()}` : `n:${q.toLowerCase()}` };
}

/**
 * Server answers by search key, so typing back or searching again is instant.
 * Kept a few minutes only (parent details edited meanwhile show up), and an
 * empty answer is never kept (it may only mean "too many searches just now").
 */
const answers = new Map<string, { rows: StudentParents[]; at: number }>();
const ANSWER_MAX_AGE_MS = 5 * 60_000;

function answerFor(key: string): StudentParents[] | null {
  const a = answers.get(key);
  if (!a) return null;
  if (Date.now() - a.at > ANSWER_MAX_AGE_MS) {
    answers.delete(key);
    return null;
  }
  return a.rows;
}
/** Searches already on their way to the server. */
const asking = new Set<string>();

function remember(key: string, rows: StudentParents[]) {
  answers.delete(key);
  if (rows.length === 0) return;
  answers.set(key, { rows, at: Date.now() });
  // Keep the newest few hundred searches only
  if (answers.size > 300) answers.delete(answers.keys().next().value as string);
}

/**
 * The students for this search without asking the server, when possible:
 * its own answer, or a shorter search's answer narrowed down here. `complete`
 * is false when the shorter answer was cut at the maximum (the server may know
 * more students), so those rows only show until the server answers.
 */
function fromAnswers(s: { key: string; roll: boolean }): { rows: StudentParents[]; complete: boolean } | null {
  const own = answerFor(s.key);
  if (own) return { rows: own, complete: true };
  const text = s.key.slice(2);
  for (let len = text.length - 1; len >= 1; len--) {
    const shorter = answerFor(s.key.slice(0, 2 + len));
    if (!shorter) continue;
    const rows = shorter.filter((st) => (s.roll ? st.roll.toUpperCase().startsWith(text) : st.name.toLowerCase().includes(text)));
    return { rows, complete: shorter.length < MAX_ROWS };
  }
  return null;
}

// ─── The box ─────────────────────────────────────────────────────────────────

export function ParentSearch({ onPick }: { onPick: (student: StudentParents, who: ParentWho) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [student, setStudent] = useState<StudentParents | null>(null);
  // The search key that could not be answered (shows the error for it)
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // Shows a server answer that just arrived (answers live outside React)
  const [, answered] = useReducer((n: number) => n + 1, 0);

  // Everything shown is looked up by the search typed NOW, so a late answer for
  // an older search can never replace it (it is only kept for later)
  const search = searchKey(query);
  const known = search ? fromAnswers(search) : null;
  const needsServer = !!search && !known?.complete;
  const key = search?.key ?? null;
  const q = search?.q ?? "";

  useEffect(() => {
    if (!key || !needsServer || asking.has(key)) return;
    const timer = setTimeout(() => {
      asking.add(key);
      callGate("searchStudentParents", [q], 15_000)
        .then((res: any) => {
          if (Array.isArray(res)) {
            remember(key, res);
            answered();
          } else {
            setFailedKey(key);
          }
        })
        .catch(() => setFailedKey(key))
        .finally(() => asking.delete(key));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, q, needsServer]);

  const failed = !!key && failedKey === key && needsServer;
  const searching = needsServer && !failed;
  const results = known?.rows ?? null;

  const clear = () => {
    setQuery("");
    setStudent(null);
    setFailedKey(null);
  };

  const studentDetails = (s: StudentParents) =>
    [s.department, s.year ? t("Year {n}", { n: s.year }) : null, s.section].filter(Boolean).join(" · ");

  const parentButtons: { who: ParentWho; label: string }[] = [
    { who: "FATHER", label: t("Father") },
    { who: "MOTHER", label: t("Mother") },
    { who: "GUARDIAN", label: t("Guardian") },
  ];

  /** Name, then the roll number in bold, then department · year · section (wraps, never cut). */
  const studentText = (s: StudentParents) => {
    const details = studentDetails(s);
    return (
      <>
        <span className="block break-words text-base font-medium leading-snug text-zinc-100">{s.name}</span>
        <span className="mt-0.5 block break-all text-sm font-bold tracking-wide text-zinc-200">{s.roll}</span>
        {details && <span className="mt-0.5 block break-words text-sm leading-snug text-zinc-500">{details}</span>}
      </>
    );
  };

  return (
    <div className="space-y-2 rounded-3xl border border-orange-500/25 bg-orange-500/5 p-3 sm:p-4">
      <label htmlFor="parent-search" className="field-label flex items-center gap-1.5 text-sm font-medium text-zinc-300">
        <GraduationCap className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
        {t("Parent of a student? Type roll no / name")}
      </label>

      {student ? (
        /* The student picked: which parent came? */
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">{studentText(student)}</div>
            <button
              type="button"
              onClick={() => setStudent(null)}
              className="h-11 shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-orange-500 hover:bg-zinc-950"
            >
              {t("Change")}
            </button>
          </div>
          <p className="text-xs font-medium text-zinc-500">{t("Who came?")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {parentButtons.map(({ who, label }) => {
              const p = parentOf(student, who);
              const relation = who === "GUARDIAN" && student.guardianRelation ? ` (${student.guardianRelation})` : "";
              return (
                <button
                  key={who}
                  type="button"
                  disabled={!p}
                  onClick={() => {
                    onPick(student, who);
                    clear();
                  }}
                  className="flex min-h-14 flex-col items-start justify-center rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-left transition-colors hover:border-orange-500/50 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm font-semibold text-zinc-100">
                    {label}
                    {relation}
                  </span>
                  <span className="max-w-full break-words text-xs text-zinc-500">{p ? p.name : t("Not saved")}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            {/* The search icon turns into a small spinner while the server is asked: nothing moves */}
            {searching ? (
              <Loader2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-orange-500" aria-hidden="true" />
            ) : (
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            )}
            <input
              id="parent-search"
              // Plain text box (not type="search") so the browser adds no second clear button
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-busy={searching}
              placeholder={t("Roll no or student name")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFailedKey(null);
              }}
              // Enter here must not save the visitor form
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 pl-11 pr-14 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
            {query && (
              <button
                type="button"
                aria-label={t("Clear")}
                title={t("Clear")}
                onClick={clear}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-950 hover:text-zinc-300 active:bg-zinc-800"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
          {failed && <p role="alert" className="px-1 text-sm text-red-400">{t("Could not search. Please try again.")}</p>}
          {results && results.length === 0 && !searching && <p className="px-1 text-sm text-zinc-500">{t("No student found.")}</p>}
          {results && results.length > 0 && (
            <ul className="max-h-80 divide-y divide-zinc-800 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800 bg-zinc-900">
              {results.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStudent(s)}
                    className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-950 active:bg-orange-500/10"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">{studentText(s)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

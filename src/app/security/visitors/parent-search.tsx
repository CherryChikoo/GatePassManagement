"use client";

/**
 * "Parent of a student?" box at the top of the Visitors form: type a roll
 * number or name, pick the student, then tap Father / Mother / Guardian and
 * the form fills itself from the student's saved parent details.
 */
import { useEffect, useRef, useState } from "react";
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

export function ParentSearch({ onPick }: { onPick: (student: StudentParents, who: ParentWho) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentParents[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentParents | null>(null);
  // Only the newest search may show its answer
  const searchNo = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const no = ++searchNo.current;
    // Same rule as the server: roll numbers from 2 characters, names from 3 letters
    if (q.length < (/\d/.test(q) ? 2 : 3)) {
      setResults(null);
      setSearching(false);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      callGate("searchStudentParents", [q], 15_000)
        .then((res: any) => {
          if (no !== searchNo.current) return;
          if (Array.isArray(res)) {
            setResults(res);
            setError(null);
          } else {
            setResults(null);
            setError(t("Could not search. Please try again."));
          }
        })
        .catch(() => {
          if (no === searchNo.current) {
            setResults(null);
            setError(t("Could not search. Please try again."));
          }
        })
        .finally(() => no === searchNo.current && setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, t]);

  const clear = () => {
    setQuery("");
    setResults(null);
    setStudent(null);
    setError(null);
  };

  const studentLine = (s: StudentParents) =>
    [s.roll, s.department, s.year ? t("Year {n}", { n: s.year }) : null, s.section].filter(Boolean).join(" · ");

  const parentButtons: { who: ParentWho; label: string }[] = [
    { who: "FATHER", label: t("Father") },
    { who: "MOTHER", label: t("Mother") },
    { who: "GUARDIAN", label: t("Guardian") },
  ];

  return (
    <div className="space-y-2 rounded-3xl border border-orange-500/25 bg-orange-500/5 p-3 sm:p-4">
      <label htmlFor="parent-search" className="field-label flex items-center gap-1.5 text-sm font-medium text-zinc-300">
        <GraduationCap className="h-4 w-4 text-orange-500" aria-hidden="true" />
        {t("Parent of a student? Type roll no / name")}
      </label>

      {student ? (
        /* The student picked: which parent came? */
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-100 break-words">{student.name}</p>
              <p className="text-xs text-zinc-500">{studentLine(student)}</p>
            </div>
            <button
              type="button"
              onClick={() => setStudent(null)}
              className="h-10 shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-orange-500 hover:bg-zinc-950"
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
                  <span className="max-w-full truncate text-xs text-zinc-500">{p ? p.name : t("Not saved")}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id="parent-search"
              type="search"
              autoComplete="off"
              placeholder={t("Roll no or student name")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Enter here must not save the visitor form
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 pl-11 pr-11 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors hover:border-zinc-700 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            />
            {searching ? (
              <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />
            ) : query ? (
              <button
                type="button"
                aria-label={t("Clear")}
                onClick={clear}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-950"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {error && <p role="alert" className="px-1 text-sm text-red-400">{error}</p>}
          {results && results.length === 0 && !searching && <p className="px-1 text-sm text-zinc-500">{t("No student found.")}</p>}
          {results && results.length > 0 && (
            <ul className="max-h-72 divide-y divide-zinc-800 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900">
              {results.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStudent(s)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-950"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-100">{s.name}</span>
                      <span className="block truncate text-xs text-zinc-500">{studentLine(s)}</span>
                    </span>
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

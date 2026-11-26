/**
 * Year and semester of a student, written one way everywhere:
 * "2nd Year · Sem 3" (Telugu: "2వ సంవత్సరం · సెమిస్టర్ 3").
 *
 * Semesters are counted through the whole course: 1st Year = Sem 1 and 2,
 * 2nd Year = Sem 3 and 4, and so on.
 */

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th" … */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "2nd Year" (Telugu through `t`) */
export function yearLabel(year: number, t?: Translate): string {
  const english = `${ordinal(year)} Year`;
  if (!t) return english;
  const translated = t("Year {n}", { n: year });
  return translated === `Year ${year}` ? english : translated;
}

/** "Sem 3" (Telugu through `t`) */
export function semLabel(sem: number, t?: Translate): string {
  return t ? t("Sem {n}", { n: sem }) : `Sem ${sem}`;
}

/** "2nd Year · Sem 3" — either part may be missing */
export function studyLabel(year: number | null | undefined, sem: number | null | undefined, t?: Translate): string {
  return [year ? yearLabel(year, t) : null, sem ? semLabel(sem, t) : null].filter(Boolean).join(" · ");
}

/** The two semesters of a year: 2nd Year → [3, 4] */
export function semestersOfYear(year: number): [number, number] {
  return [year * 2 - 1, year * 2];
}

/** A semester that fits the year (a missing or wrong one counts as the year's first) */
export function fittedSemester(year: number, sem: number | null | undefined): number {
  const [first, second] = semestersOfYear(year);
  return sem === first || sem === second ? sem : first;
}

export type Step = { kind: "semester" | "year"; year: number; semester: number } | { kind: "graduate" };

/**
 * One "Promote": the next semester. The second semester of a year goes on to
 * the next year's first semester; the course's last semester graduates.
 */
export function nextStep(year: number, sem: number | null | undefined, courseYears: number): Step {
  const now = fittedSemester(year, sem);
  if (now === year * 2 - 1) return { kind: "semester", year, semester: now + 1 };
  if (year < courseYears) return { kind: "year", year: year + 1, semester: now + 1 };
  return { kind: "graduate" };
}

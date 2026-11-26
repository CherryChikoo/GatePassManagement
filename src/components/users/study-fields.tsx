"use client";

import { useEffect, useState } from "react";
import { getCourseOptions } from "@/server/actions/promotion";
import { semestersOfYear, yearLabel } from "@/lib/students/study";

const box =
  "h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40";

let cached: { code: string; name: string; years: number }[] | null = null;

/**
 * Course, year and semester of a student (form names: course, year, semester).
 * Year stops at the course's length; the semester is one of the year's two
 * (2nd Year → Sem 3 or Sem 4).
 */
export function StudyFields({
  course: initialCourse,
  year: initialYear,
  semester: initialSemester,
}: {
  course?: string | null;
  year?: number | null;
  semester?: number | null;
}) {
  const [courses, setCourses] = useState(cached ?? []);
  const [course, setCourse] = useState(initialCourse ?? "");
  const [year, setYear] = useState<number | "">(initialYear ?? "");
  const [semester, setSemester] = useState<number | "">(initialSemester ?? "");

  useEffect(() => {
    if (cached) return;
    getCourseOptions()
      .then((c) => {
        cached = c;
        setCourses(c);
      })
      .catch(() => {});
  }, []);

  const maxYears = courses.find((c) => c.code === course)?.years ?? 6;
  const sems = year ? semestersOfYear(year) : null;

  return (
    <>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-300">Course</span>
        <select
          name="course"
          value={course}
          onChange={(e) => {
            setCourse(e.target.value);
            const yrs = courses.find((c) => c.code === e.target.value)?.years ?? 6;
            if (year && year > yrs) {
              setYear("");
              setSemester("");
            }
          }}
          className={box}
        >
          <option value="">Choose…</option>
          {courses.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
          {course && !courses.some((c) => c.code === course) && <option value={course}>{course}</option>}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-300">Year</span>
        <select
          name="year"
          value={year}
          onChange={(e) => {
            const y = e.target.value ? Number(e.target.value) : "";
            setYear(y);
            // The year's first semester unless the chosen one still fits
            setSemester(y ? (semester && semestersOfYear(y).includes(semester) ? semester : semestersOfYear(y)[0]) : "");
          }}
          className={box}
        >
          <option value="">Choose…</option>
          {Array.from({ length: maxYears }, (_, i) => i + 1).map((y) => (
            <option key={y} value={y}>
              {yearLabel(y)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-300">Semester</span>
        <select name="semester" value={semester} onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : "")} className={box} disabled={!sems}>
          <option value="">{sems ? "Choose…" : "Choose the year first"}</option>
          {sems?.map((s) => (
            <option key={s} value={s}>
              Sem {s}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

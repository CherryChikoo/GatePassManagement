"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, GraduationCap, Loader2, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/primitives";
import { BackButton } from "@/components/ui/back-button";
import { actionErrorMessage } from "@/lib/deployment";
import { formatDateTime } from "@/lib/utils";
import {
  deleteCourse,
  getLastPromotion,
  listCourses,
  listGraduates,
  listPromotionStudents,
  listStudentDepartments,
  previewPromotion,
  promoteStudents,
  removeGraduates,
  saveCourse,
  undoLastPromotion,
  type PromotionFilter,
} from "@/server/actions/promotion";

type Course = { id: string; code: string; name: string; years: number; students: number };
type Preview = Awaited<ReturnType<typeof previewPromotion>>;
type StudentRow = Awaited<ReturnType<typeof listPromotionStudents>>["students"][number];
type Last = Awaited<ReturnType<typeof getLastPromotion>>;
type Grad = { year: number; course: string | null; n: number };

const box = "h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40";
const YEAR_WORDS = ["", "1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "6th Year"];

function Alert({ text, tone, onClose }: { text: string; tone: "red" | "green"; onClose: () => void }) {
  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold ${
        tone === "red" ? "border border-red-500/30 bg-red-500/10 text-red-500" : "bg-emerald-600 text-white"
      }`}
    >
      <span className="min-w-0 flex-1">{text}</span>
      <button type="button" onClick={onClose} className="shrink-0 px-2 text-xs font-bold hover:underline">
        OK
      </button>
    </div>
  );
}

export function PromotionClient() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // ─── Courses ───
  const [courses, setCourses] = useState<Course[]>([]);
  const [noCourse, setNoCourse] = useState(0);
  const [editing, setEditing] = useState<Partial<Course> | null>(null);
  const [saving, setSaving] = useState(false);
  const loadCourses = useCallback(async () => {
    const res = await listCourses();
    setCourses(res.courses);
    setNoCourse(res.noCourse);
  }, []);

  // ─── Choosing students ───
  const [departments, setDepartments] = useState<string[]>([]);
  const [filter, setFilter] = useState<{ course: string; department: string; year: number }>({ course: "", department: "", year: 0 });
  /** all: everyone matching (ticks = hold back); ticked: only the ticked students */
  const [mode, setMode] = useState<"all" | "ticked">("all");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{ students: StudentRow[]; total: number; pageSize: number } | null>(null);

  // ─── Preview / promote / undo ───
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [last, setLast] = useState<Last>(null);

  // ─── Graduates ───
  const [grads, setGrads] = useState<Grad[]>([]);
  const [removing, setRemoving] = useState<Grad | null>(null);
  const [typed, setTyped] = useState("");
  const [removeNote, setRemoveNote] = useState<string | null>(null);

  const chosen = useCallback(
    (): PromotionFilter => ({
      course: filter.course,
      department: filter.department,
      year: filter.year,
      ...(mode === "ticked" ? { ids: [...ticked] } : { holdBack: [...ticked] }),
    }),
    [filter, mode, ticked]
  );

  const refreshAll = useCallback(async () => {
    try {
      const [, deps, l, g] = await Promise.all([loadCourses(), listStudentDepartments(), getLastPromotion(), listGraduates()]);
      setDepartments(deps);
      setLast(l);
      setGrads(g);
    } catch (err) {
      setError(actionErrorMessage(err, "Could not load. Please try again."));
    }
  }, [loadCourses]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // The student list follows the filter, search and page
  useEffect(() => {
    let stop = false;
    const id = setTimeout(async () => {
      try {
        const res = await listPromotionStudents({ course: filter.course, department: filter.department, year: filter.year }, page, q);
        if (!stop) setList(res);
      } catch (err) {
        if (!stop) setError(actionErrorMessage(err, "Could not load the students."));
      }
    }, 250);
    return () => {
      stop = true;
      clearTimeout(id);
    };
  }, [filter, page, q]);

  // Any change of choice: the old preview no longer applies
  useEffect(() => setPreview(null), [filter, mode, ticked]);

  async function onSaveCourse() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveCourse({ id: editing.id, code: editing.code ?? "", name: editing.name ?? "", years: Number(editing.years) });
      if (res.error) setError(res.error);
      else {
        setEditing(null);
        await loadCourses();
      }
    } catch (err) {
      setError(actionErrorMessage(err, "Could not save the course."));
    }
    setSaving(false);
  }

  async function onDeleteCourse(c: Course) {
    if (!window.confirm(`Delete the course ${c.name}?`)) return;
    const res = await deleteCourse(c.id).catch((err) => ({ error: actionErrorMessage(err, "Could not delete.") }));
    if (res.error) setError(res.error);
    else await loadCourses();
  }

  async function onPreview() {
    if (mode === "ticked" && ticked.size === 0) {
      setError("Tick the students to promote");
      return;
    }
    setBusy("preview");
    setError(null);
    try {
      setPreview(await previewPromotion(chosen()));
    } catch (err) {
      setError(actionErrorMessage(err, "Could not make the preview."));
    }
    setBusy(null);
  }

  async function onPromote() {
    if (!preview) return;
    setBusy("promote");
    setError(null);
    try {
      const res = await promoteStudents(chosen(), { moving: preview.moving, graduating: preview.graduating });
      if (res.error) {
        setError(res.error);
        if ("changed" in res && res.changed) setPreview(await previewPromotion(chosen()));
      } else {
        setDone(`Promoted: ${res.moved} moved on, ${res.graduated} graduated.`);
        setPreview(null);
        setTicked(new Set());
        setPage(1);
        setFilter((f) => ({ ...f }));
        await refreshAll();
      }
    } catch (err) {
      setError(actionErrorMessage(err, "Could not promote. Please try again."));
    }
    setConfirming(false);
    setBusy(null);
  }

  async function onUndo() {
    if (!last || !window.confirm("Undo the last promotion? Every student goes back to where they were.")) return;
    setBusy("undo");
    setError(null);
    try {
      const res = await undoLastPromotion(last.id);
      if (res.error) setError(res.error);
      else {
        setDone(`Undone: ${res.restored} students are back where they were.`);
        setFilter((f) => ({ ...f }));
        await refreshAll();
      }
    } catch (err) {
      setError(actionErrorMessage(err, "Could not undo. Please try again."));
    }
    setBusy(null);
  }

  async function onRemove() {
    if (!removing || typed !== "DELETE") return;
    setBusy("remove");
    setError(null);
    let deleted = 0;
    let cleared = 0;
    try {
      // In parts of 100, until none are left
      for (let round = 0; round < 200; round++) {
        const res = await removeGraduates(removing.year, removing.course, typed);
        if (res.error) {
          setError(res.error);
          break;
        }
        deleted += res.deleted ?? 0;
        cleared += res.cleared ?? 0;
        setRemoveNote(`Removing… ${deleted + cleared} done, ${res.left} left`);
        if (!res.left || (res.deleted ?? 0) + (res.cleared ?? 0) === 0) break;
      }
      setDone(`Graduates removed: ${deleted} deleted fully, ${cleared} kept as name and roll only (they have gate records).`);
      setRemoving(null);
      setTyped("");
      await refreshAll();
    } catch (err) {
      setError(actionErrorMessage(err, "Could not remove. Please try again."));
    }
    setRemoveNote(null);
    setBusy(null);
  }

  const courseName = (code: string | null) => courses.find((c) => c.code === code)?.name ?? code ?? "No course";
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const toggle = (id: string) =>
    setTicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <BackButton href="/admin" label="Back to Dashboard" className="-ml-2" />
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">Promotion</h1>
      </div>

      {error && <Alert text={error} tone="red" onClose={() => setError(null)} />}
      {done && <Alert text={done} tone="green" onClose={() => setDone(null)} />}

      {last?.canUndo && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-base font-semibold text-zinc-100">
              Last promotion: {formatDateTime(last.createdAt)} by {last.createdBy} — {last.moved} moved on, {last.graduated} graduated
            </p>
            <Button variant="outline" onClick={onUndo} disabled={!!busy}>
              {busy === "undo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Undo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Courses ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-zinc-100">Courses</h2>
            <Button size="sm" onClick={() => setEditing({ code: "", name: "", years: 4 })}>
              <Plus className="h-4 w-4" /> Add course
            </Button>
          </div>
          {noCourse > 0 && (
            <p className="rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-700">
              {noCourse} students have no course yet. They are not promoted until a course is set.
            </p>
          )}
          {courses.length === 0 ? (
            <p className="text-sm text-zinc-500">No courses yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
              {courses.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-zinc-100">
                      {c.name} <span className="font-semibold text-zinc-500">({c.code})</span>
                    </span>
                    <span className="block text-sm text-zinc-400">
                      {c.years} years · {c.students} students
                    </span>
                  </span>
                  <button type="button" onClick={() => setEditing(c)} className="rounded-full p-2 text-zinc-400 hover:bg-zinc-950" aria-label={`Edit ${c.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onDeleteCourse(c)} className="rounded-full p-2 text-red-500 hover:bg-red-500/10" aria-label={`Delete ${c.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Promote ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-lg font-bold text-zinc-100">Promote students</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <select className={box} value={filter.course} onChange={(e) => { setFilter((f) => ({ ...f, course: e.target.value })); setPage(1); }} aria-label="Course">
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className={box} value={filter.department} onChange={(e) => { setFilter((f) => ({ ...f, department: e.target.value })); setPage(1); }} aria-label="Department">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select className={box} value={filter.year} onChange={(e) => { setFilter((f) => ({ ...f, year: Number(e.target.value) })); setPage(1); }} aria-label="Year">
              <option value={0}>All years</option>
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <option key={y} value={y}>
                  {YEAR_WORDS[y]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["all", "Everyone shown"],
                ["ticked", "Only ticked"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setTicked(new Set());
                }}
                className={`h-11 rounded-xl border-2 text-sm font-bold ${mode === m ? "border-orange-500 bg-orange-500/10 text-orange-600" : "border-zinc-800 text-zinc-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm font-semibold text-zinc-400">
            {mode === "all" ? `Tick a student to hold them back (${ticked.size} held back)` : `Tick the students to promote (${ticked.size} ticked)`}
          </p>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              className={`${box} pl-9`}
              placeholder="Roll number or name"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
            {!list && <li className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</li>}
            {list?.students.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-500">No students</li>}
            {list?.students.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                  <input type="checkbox" checked={ticked.has(s.id)} onChange={() => toggle(s.id)} className="h-5 w-5 accent-orange-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-zinc-100">
                      {s.roll} · {s.name}
                    </span>
                    <span className="block truncate text-sm text-zinc-400">
                      {[courseName(s.course), s.department, s.study].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {list && list.total > list.pageSize && (
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm font-semibold text-zinc-400 tabular-nums">
                Page {page} of {pages} · {list.total} students
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}

          <Button onClick={onPreview} disabled={!!busy} className="w-full">
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Preview
          </Button>

          {preview && (
            <div className="space-y-3 rounded-2xl border-2 border-orange-500/60 p-4">
              {preview.rows.length === 0 ? (
                <p className="text-sm font-semibold text-zinc-400">Nobody to promote.</p>
              ) : (
                <ul className="space-y-2">
                  {preview.rows.map((r) => (
                    <li key={`${r.course}|${r.from}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-zinc-100">{r.course}</span>
                      <span className="text-zinc-400">{r.from}</span>
                      <ArrowRight className="h-4 w-4 text-zinc-500" />
                      <span className={r.graduate ? "font-bold text-purple-600" : "font-bold text-emerald-600"}>{r.to}</span>
                      <span className="ml-auto rounded-full bg-zinc-950 px-2.5 py-0.5 font-bold tabular-nums text-zinc-100">{r.n}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(preview.noCourse > 0 || preview.noYear > 0) && (
                <p className="text-sm font-semibold text-amber-700">
                  Left as they are: {preview.noCourse > 0 ? `${preview.noCourse} with no course` : ""}
                  {preview.noCourse > 0 && preview.noYear > 0 ? ", " : ""}
                  {preview.noYear > 0 ? `${preview.noYear} with no year` : ""}
                </p>
              )}
              {preview.moving + preview.graduating > 0 && (
                <Button onClick={() => setConfirming(true)} disabled={!!busy} className="w-full">
                  Promote {preview.moving + preview.graduating} students
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Graduates ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
            <GraduationCap className="h-5 w-5 text-purple-600" /> Graduates
          </h2>
          {grads.length === 0 ? (
            <p className="text-sm text-zinc-500">No graduates yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
              {grads.map((g) => (
                <li key={`${g.year}|${g.course}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 font-semibold text-zinc-100">
                    {g.year} · {courseName(g.course)} · <span className="tabular-nums">{g.n}</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => { setRemoving(g); setTyped(""); }} disabled={!!busy}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Course add / edit */}
      <Modal open={!!editing} onClose={() => !saving && setEditing(null)} title={editing?.id ? "Edit course" : "Add course"}>
        {editing && (
          <div className="space-y-3">
            <input className={box} placeholder="Course name, e.g. B.Tech" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <input className={box} placeholder="Code, e.g. BTECH" value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} />
            <select className={box} value={editing.years ?? 4} onChange={(e) => setEditing({ ...editing, years: Number(e.target.value) })} aria-label="Years">
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <option key={y} value={y}>
                  {y} {y === 1 ? "year" : "years"}
                </option>
              ))}
            </select>
            <Button onClick={onSaveCourse} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </div>
        )}
      </Modal>

      {/* Promote: confirm */}
      <Modal open={confirming} onClose={() => busy !== "promote" && setConfirming(false)} title="Promote students">
        {preview && (
          <div className="space-y-4">
            <p className="text-base font-semibold text-zinc-100">
              {preview.moving} move to the next semester / year. {preview.graduating} graduate (their login is switched off).
            </p>
            <Button onClick={onPromote} disabled={busy === "promote"} className="w-full">
              {busy === "promote" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Promote
            </Button>
          </div>
        )}
      </Modal>

      {/* Graduates: remove */}
      <Modal open={!!removing} onClose={() => busy !== "remove" && setRemoving(null)} title="Remove graduates">
        {removing && (
          <div className="space-y-4">
            <p className="text-base font-semibold text-zinc-100">
              {removing.n} graduates of {removing.year} · {courseName(removing.course)}: their logins and personal details (phone, parents, address, photo) are deleted for good.
              Graduates with gate records keep only their name and roll number on those records.
            </p>
            <input className={box} placeholder="Type DELETE" value={typed} onChange={(e) => setTyped(e.target.value)} />
            {removeNote && <p className="text-sm font-semibold text-zinc-400">{removeNote}</p>}
            <Button onClick={onRemove} disabled={typed !== "DELETE" || busy === "remove"} className="w-full bg-red-600 hover:bg-red-700">
              {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove for good
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

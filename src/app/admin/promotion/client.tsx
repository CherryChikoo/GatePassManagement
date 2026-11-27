"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  GraduationCap,
  History,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, StatCard } from "@/components/ui/primitives";
import { ThemedSelect } from "@/components/ui/themed-select";
import { PagerBar } from "@/components/ui/pager-bar";
import { BackButton } from "@/components/ui/back-button";
import { actionErrorMessage } from "@/lib/deployment";
import { cn, formatDateTime } from "@/lib/utils";
import { yearLabel } from "@/lib/students/study";
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

/** Section label, as on the dashboards */
function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">{children}</h2>
      {action}
    </div>
  );
}

function Notice({ text, tone, onClose }: { text: string; tone: "error" | "done"; onClose: () => void }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm animate-fade-in",
        tone === "error" ? "border-red-500/20 bg-red-500/10 text-red-500" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
      )}
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", tone === "error" ? "bg-red-500/15" : "bg-emerald-500/15")}>
        {tone === "error" ? <TriangleAlert className="h-4 w-4" /> : <Check className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1 font-medium">{text}</span>
      <button type="button" onClick={onClose} className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold hover:bg-black/5">
        OK
      </button>
    </div>
  );
}

/** A small rounded tag (code, years, semester) */
function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "orange" | "green" | "purple" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "plain" && "bg-zinc-950 text-zinc-300",
        tone === "orange" && "bg-orange-500/10 text-orange-500",
        tone === "green" && "bg-emerald-500/10 text-emerald-600",
        tone === "purple" && "bg-purple-500/10 text-purple-600"
      )}
    >
      {children}
    </span>
  );
}

export function PromotionClient() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // ─── Courses ───
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [noCourse, setNoCourse] = useState(0);
  const [editing, setEditing] = useState<Partial<Course> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const loadCourses = useCallback(async () => {
    const res = await listCourses();
    setCourses(res.courses);
    setNoCourse(res.noCourse);
  }, []);

  // ─── Choosing students ───
  const [departments, setDepartments] = useState<string[]>([]);
  const [filter, setFilter] = useState<{ course: string; department: string; year: number }>({ course: "", department: "", year: 0 });
  /** all: everyone shown (ticks = hold back); ticked: only the ticked students */
  const [mode, setMode] = useState<"all" | "ticked">("all");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{ students: StudentRow[]; total: number; pageSize: number } | null>(null);
  const [reloadNo, setReloadNo] = useState(0);

  // ─── Preview / promote / undo ───
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [undoing, setUndoing] = useState(false);
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
  }, [filter, page, q, reloadNo]);

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

  async function onDeleteCourse() {
    if (!deleting) return;
    setBusy("delete");
    const res = await deleteCourse(deleting.id).catch((err) => ({ error: actionErrorMessage(err, "Could not delete.") }));
    if (res.error) setError(res.error);
    else await loadCourses();
    setDeleting(null);
    setBusy(null);
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
        setDone(`Promoted · ${res.moved} moved on · ${res.graduated} graduated`);
        setPreview(null);
        setTicked(new Set());
        setPage(1);
        setReloadNo((n) => n + 1);
        await refreshAll();
      }
    } catch (err) {
      setError(actionErrorMessage(err, "Could not promote. Please try again."));
    }
    setConfirming(false);
    setBusy(null);
  }

  async function onUndo() {
    if (!last) return;
    setBusy("undo");
    setError(null);
    try {
      const res = await undoLastPromotion(last.id);
      if (res.error) setError(res.error);
      else {
        setDone(`Undone · ${res.restored} students are back where they were`);
        setReloadNo((n) => n + 1);
        await refreshAll();
      }
    } catch (err) {
      setError(actionErrorMessage(err, "Could not undo. Please try again."));
    }
    setUndoing(false);
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
        setRemoveNote(`${deleted + cleared} removed · ${res.left} left`);
        if (!res.left || (res.deleted ?? 0) + (res.cleared ?? 0) === 0) break;
      }
      setDone(`Graduates removed · ${deleted} deleted · ${cleared} kept as name and roll`);
      setRemoving(null);
      setTyped("");
      await refreshAll();
    } catch (err) {
      setError(actionErrorMessage(err, "Could not remove. Please try again."));
    }
    setRemoveNote(null);
    setBusy(null);
  }

  const courseName = (code: string | null) => courses?.find((c) => c.code === code)?.name ?? code ?? "No course";
  const studying = (courses ?? []).reduce((n, c) => n + c.students, 0) + noCourse;
  const graduated = grads.reduce((n, g) => n + g.n, 0);
  const toggle = (id: string) =>
    setTicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <div className="space-y-3">
        <BackButton href="/admin" label="Back to Dashboard" className="-ml-2" />
        <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-zinc-100">Promotion</h1>
      </div>

      {error && <Notice text={error} tone="error" onClose={() => setError(null)} />}
      {done && <Notice text={done} tone="done" onClose={() => setDone(null)} />}

      {/* Last promotion (can be undone for 7 days) */}
      {last?.canUndo && (
        <Card className="border-orange-500/25">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500">
              <History className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-100">Last promotion · {formatDateTime(last.createdAt)}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Pill tone="green">{last.moved} moved on</Pill>
                <Pill tone="purple">{last.graduated} graduated</Pill>
                <Pill>{last.createdBy}</Pill>
              </div>
            </div>
            <Button variant="outline" onClick={() => setUndoing(true)} disabled={!!busy} className="w-full sm:w-auto">
              <RotateCcw className="h-4 w-4" /> Undo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Overview */}
      <section className="space-y-3">
        <SectionLabel>Overview</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard title="Studying" value={courses ? studying : "—"} icon={<UsersRound />} />
          <StatCard title="Courses" value={courses ? courses.length : "—"} icon={<BookOpen />} />
          <StatCard
            title="Without a course"
            value={courses ? noCourse : "—"}
            icon={<TriangleAlert />}
            className={noCourse > 0 ? "border-amber-500/40" : undefined}
          />
          <StatCard title="Graduated" value={graduated} icon={<GraduationCap />} />
        </div>
      </section>

      {/* Courses */}
      <section className="space-y-3">
        <SectionLabel>Courses</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {courses?.map((c) => (
            <Card key={c.id} glow className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`} className="hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-medium text-zinc-100">{c.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Pill>{c.code}</Pill>
                    <Pill tone="orange">
                      {c.years} {c.years === 1 ? "year" : "years"}
                    </Pill>
                  </div>
                </div>
                <p className="mt-auto flex items-baseline gap-2">
                  <span className="text-3xl font-light tabular-nums tracking-tight text-zinc-100">{c.students}</span>
                  <span className="text-sm text-zinc-500">students</span>
                </p>
              </CardContent>
            </Card>
          ))}
          {!courses &&
            [0, 1, 2].map((i) => <div key={i} className="h-[190px] animate-pulse rounded-3xl border border-zinc-800/60 bg-zinc-900" aria-hidden="true" />)}
          <button
            type="button"
            onClick={() => setEditing({ code: "", name: "", years: 4 })}
            className="flex min-h-[190px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-zinc-800 bg-zinc-900/50 text-zinc-400 transition-colors hover:border-orange-500/50 hover:text-orange-500"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold">Add course</span>
          </button>
        </div>
      </section>

      {/* Promote */}
      <section className="space-y-3">
        <SectionLabel>Promote students</SectionLabel>
        <Card>
          <CardContent className="space-y-5 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <ThemedSelect
                aria-label="Course"
                value={filter.course}
                onChange={(e) => {
                  setFilter((f) => ({ ...f, course: e.target.value }));
                  setPage(1);
                }}
              >
                <option value="">All courses</option>
                {(courses ?? []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </ThemedSelect>
              <ThemedSelect
                aria-label="Department"
                value={filter.department}
                onChange={(e) => {
                  setFilter((f) => ({ ...f, department: e.target.value }));
                  setPage(1);
                }}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </ThemedSelect>
              <ThemedSelect
                aria-label="Year"
                value={String(filter.year)}
                onChange={(e) => {
                  setFilter((f) => ({ ...f, year: Number(e.target.value) }));
                  setPage(1);
                }}
              >
                <option value="0">All years</option>
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={String(y)}>
                    {yearLabel(y)}
                  </option>
                ))}
              </ThemedSelect>
            </div>

            {/* Who: everyone shown (ticks hold back) or only the ticked */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex rounded-full bg-zinc-950 p-1" role="tablist" aria-label="Who to promote">
                {(
                  [
                    ["all", "Everyone shown"],
                    ["ticked", "Only ticked"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setTicked(new Set());
                    }}
                    className={cn(
                      "h-10 rounded-full px-5 text-sm font-semibold transition-[background-color,color,box-shadow]",
                      mode === m ? "bg-zinc-900 text-orange-500 shadow-card" : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Pill tone={ticked.size ? "orange" : "plain"}>
                {mode === "all" ? `${ticked.size} held back` : `${ticked.size} ticked`}
              </Pill>
            </div>

            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder="Roll number or name"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />

            <ul className="divide-y divide-zinc-800/70 overflow-hidden rounded-2xl border border-zinc-800/80">
              {!list && (
                <li className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                </li>
              )}
              {list?.students.length === 0 && <li className="px-4 py-10 text-center text-sm text-zinc-500">No students</li>}
              {list?.students.map((s) => {
                const on = ticked.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => toggle(s.id)}
                      aria-pressed={on}
                      className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors", on ? "bg-orange-500/5" : "hover:bg-zinc-950")}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          on ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-700"
                        )}
                        aria-hidden="true"
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-sm font-semibold text-zinc-300">
                        {s.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-zinc-100">{s.name}</span>
                        <span className="block truncate text-xs text-zinc-500">
                          {[s.roll, courseName(s.course), s.department].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {s.study && <Pill>{s.study}</Pill>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {list && list.total > list.pageSize && (
              <PagerBar inline page={page} pageSize={list.pageSize} total={list.total} onPageChange={setPage} itemLabel="students" />
            )}

            <Button size="lg" onClick={onPreview} disabled={!!busy} className="w-full">
              {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />} Preview
            </Button>

            {preview && (
              <div className="space-y-4 rounded-3xl border border-orange-500/25 bg-orange-500/[0.04] p-4 sm:p-5 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-zinc-900 p-4 shadow-card">
                    <p className="text-sm text-zinc-400">Move on</p>
                    <p className="mt-1 text-3xl font-light tabular-nums text-emerald-600">{preview.moving}</p>
                  </div>
                  <div className="rounded-2xl bg-zinc-900 p-4 shadow-card">
                    <p className="text-sm text-zinc-400">Graduate</p>
                    <p className="mt-1 text-3xl font-light tabular-nums text-purple-600">{preview.graduating}</p>
                  </div>
                </div>
                {preview.rows.length > 0 && (
                  <ul className="divide-y divide-zinc-800/70 overflow-hidden rounded-2xl bg-zinc-900 shadow-card">
                    {preview.rows.map((r) => (
                      <li key={`${r.course}|${r.from}`} className="flex flex-wrap items-center gap-2 px-4 py-3">
                        <span className="w-full truncate text-sm font-medium text-zinc-100 sm:w-auto sm:min-w-[8rem]">{r.course}</span>
                        <Pill>{r.from}</Pill>
                        <ArrowRight className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                        <Pill tone={r.graduate ? "purple" : "green"}>
                          {r.graduate && <GraduationCap className="h-3.5 w-3.5" />}
                          {r.to}
                        </Pill>
                        <span className="ml-auto text-xl font-light tabular-nums text-zinc-100">{r.n}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(preview.noCourse > 0 || preview.noYear > 0) && (
                  <p className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-700">
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                    {[preview.noCourse > 0 && `${preview.noCourse} without a course`, preview.noYear > 0 && `${preview.noYear} without a year`]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    stay as they are
                  </p>
                )}
                {preview.moving + preview.graduating > 0 ? (
                  <Button size="lg" onClick={() => setConfirming(true)} disabled={!!busy} className="w-full">
                    Promote {preview.moving + preview.graduating} students
                  </Button>
                ) : (
                  <p className="text-center text-sm text-zinc-500">Nobody to promote</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Graduates */}
      <section className="space-y-3">
        <SectionLabel>Graduates</SectionLabel>
        {grads.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-zinc-500">
                <GraduationCap className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm text-zinc-500">No graduates yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {grads.map((g) => (
              <Card key={`${g.year}|${g.course}`} glow>
                <CardContent className="flex items-center gap-4 p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-100">{courseName(g.course)}</p>
                    <p className="mt-0.5 flex items-baseline gap-2">
                      <span className="text-2xl font-light tabular-nums text-zinc-100">{g.n}</span>
                      <span className="text-sm text-zinc-500">· {g.year}</span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setRemoving(g);
                      setTyped("");
                    }}
                    disabled={!!busy}
                    aria-label={`Remove graduates of ${g.year}`}
                    className="hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Course add / edit */}
      <Modal open={!!editing} onClose={() => !saving && setEditing(null)} title={editing?.id ? "Edit course" : "Add course"}>
        {editing && (
          <div className="space-y-4">
            <Input label="Course name" placeholder="B.Tech" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Input label="Code" placeholder="BTECH" value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} />
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">Years</p>
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setEditing({ ...editing, years: y })}
                    className={cn(
                      "h-12 rounded-2xl border text-base font-semibold tabular-nums transition-colors",
                      (editing.years ?? 4) === y ? "border-orange-500 bg-orange-500/10 text-orange-500" : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
            <Button size="lg" onClick={onSaveCourse} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </Button>
          </div>
        )}
      </Modal>

      {/* Course delete */}
      <Modal open={!!deleting} onClose={() => busy !== "delete" && setDeleting(null)} title="Delete course">
        {deleting && (
          <div className="space-y-5">
            <p className="text-base text-zinc-200">
              Delete <span className="font-semibold">{deleting.name}</span>?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" onClick={() => setDeleting(null)}>
                Keep
              </Button>
              <Button variant="destructive" size="lg" onClick={onDeleteCourse} disabled={busy === "delete"}>
                {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Promote: confirm */}
      <Modal open={confirming} onClose={() => busy !== "promote" && setConfirming(false)} title="Promote students">
        {preview && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-emerald-500/10 p-4 text-center">
                <p className="text-3xl font-light tabular-nums text-emerald-600">{preview.moving}</p>
                <p className="mt-1 text-sm font-medium text-emerald-700">Move on</p>
              </div>
              <div className="rounded-2xl bg-purple-500/10 p-4 text-center">
                <p className="text-3xl font-light tabular-nums text-purple-600">{preview.graduating}</p>
                <p className="mt-1 text-sm font-medium text-purple-700">Graduate</p>
              </div>
            </div>
            <Button size="lg" onClick={onPromote} disabled={busy === "promote"} className="w-full">
              {busy === "promote" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Promote
            </Button>
          </div>
        )}
      </Modal>

      {/* Undo: confirm */}
      <Modal open={undoing} onClose={() => busy !== "undo" && setUndoing(false)} title="Undo last promotion">
        {last && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5">
              <Pill tone="green">{last.moved} moved on</Pill>
              <Pill tone="purple">{last.graduated} graduated</Pill>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" onClick={() => setUndoing(false)}>
                Keep
              </Button>
              <Button size="lg" onClick={onUndo} disabled={busy === "undo"}>
                {busy === "undo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Undo
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Graduates: remove */}
      <Modal open={!!removing} onClose={() => busy !== "remove" && setRemoving(null)} title="Remove graduates">
        {removing && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-red-500/10 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-100">
                  {removing.n} · {courseName(removing.course)} · {removing.year}
                </p>
                <p className="mt-0.5 text-sm text-red-600">Logins and personal details are deleted for good</p>
              </div>
            </div>
            <Input label="Type DELETE" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            {removeNote && (
              <p className="flex items-center gap-2 text-sm font-medium text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> {removeNote}
              </p>
            )}
            <Button variant="destructive" size="lg" onClick={onRemove} disabled={typed !== "DELETE" || busy === "remove"} className="w-full">
              {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove for good
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

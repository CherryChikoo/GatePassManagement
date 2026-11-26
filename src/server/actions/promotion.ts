"use server";

/**
 * Admin → Promotion: courses (how many years each takes), moving students on
 * to the next semester / year, graduating the final semester, undoing the last
 * promotion, and removing graduates.
 *
 * One "Promote" = the next semester for every chosen student (Sem 3 → Sem 4;
 * Sem 4 → 3rd Year Sem 5; the course's last semester → Graduated). Graduates
 * can no longer sign in; their records stay until an admin removes them.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, invalidateProfileCache } from "@/lib/auth/helpers";
import { fittedSemester, nextStep, studyLabel } from "@/lib/students/study";
import { deleteAvatarAdmin } from "@/lib/storage/storage-admin";

const UNDO_DAYS = 7;
const PAGE_SIZE = 50;

export type PromotionFilter = {
  /** Course code, or "" for every course */
  course?: string;
  department?: string;
  /** 1–6, or 0 for every year */
  year?: number;
  /** Only these students (ticked); none = everyone matching the filter */
  ids?: string[];
  /** Ticked to stay where they are (detained) */
  holdBack?: string[];
};

// ─── Courses ────────────────────────────────────────────────────────────────

export async function listCourses() {
  await requireRole("ADMIN");
  const [courses, counts] = await Promise.all([
    prisma.course.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true, years: true } }),
    prisma.student.groupBy({ by: ["course"], where: { graduatedAt: null }, _count: true }),
  ]);
  const studying = new Map(counts.map((c) => [c.course ?? "", c._count]));
  return {
    courses: courses.map((c) => ({ ...c, students: studying.get(c.code) ?? 0 })),
    /** Students with no course yet (cannot be promoted until one is set) */
    noCourse: studying.get("") ?? 0,
  };
}

const CODE_RE = /^[A-Z0-9.&-]{1,20}$/;

export async function saveCourse(input: { id?: string; code: string; name: string; years: number }) {
  await requireRole("ADMIN");
  const code = String(input.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const name = String(input.name ?? "").trim();
  const years = Number(input.years);
  if (!CODE_RE.test(code)) return { error: "Code: letters and numbers only, e.g. BTECH" };
  if (!name || name.length > 80) return { error: "Enter the course name" };
  if (!Number.isInteger(years) || years < 1 || years > 6) return { error: "Years: 1 to 6" };
  try {
    if (input.id) {
      const old = await prisma.course.findUnique({ where: { id: input.id }, select: { code: true } });
      if (!old) return { error: "Course not found" };
      await prisma.$transaction([
        prisma.course.update({ where: { id: input.id }, data: { code, name, years } }),
        // A new code: its students follow
        ...(old.code !== code ? [prisma.student.updateMany({ where: { course: old.code }, data: { course: code } })] : []),
      ]);
    } else {
      await prisma.course.create({ data: { code, name, years } });
    }
  } catch (err: any) {
    if (err?.code === "P2002") return { error: "A course with this code already exists" };
    console.error("[saveCourse]", err?.message);
    return { error: "Could not save the course" };
  }
  revalidatePath("/admin/promotion");
  return { success: true };
}

export async function deleteCourse(id: string) {
  await requireRole("ADMIN");
  const course = await prisma.course.findUnique({ where: { id }, select: { code: true } });
  if (!course) return { error: "Course not found" };
  const used = await prisma.student.count({ where: { course: course.code } });
  if (used > 0) return { error: `${used} students have this course. Move them to another course first.` };
  await prisma.course.delete({ where: { id } });
  revalidatePath("/admin/promotion");
  return { success: true };
}

// ─── Choosing students ──────────────────────────────────────────────────────

function whereOf(f: PromotionFilter): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = { graduatedAt: null };
  if (f.course) where.course = f.course;
  if (f.department) where.department = f.department;
  if (f.year && f.year >= 1 && f.year <= 6) where.year = f.year;
  if (f.ids?.length) where.id = { in: f.ids.slice(0, 10_000) };
  if (f.holdBack?.length) where.NOT = { id: { in: f.holdBack.slice(0, 10_000) } };
  return where;
}

/** One page of students for ticking (Promote selected / Hold back) */
export async function listPromotionStudents(f: PromotionFilter, page = 1, q = "") {
  await requireRole("ADMIN");
  const search = String(q ?? "").trim().slice(0, 60);
  const where: Prisma.StudentWhereInput = {
    ...whereOf({ course: f.course, department: f.department, year: f.year }),
    ...(search
      ? { OR: [{ studentRoll: { contains: search, mode: "insensitive" } }, { profile: { name: { contains: search, mode: "insensitive" } } }] }
      : {}),
  };
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: [{ year: "desc" }, { studentRoll: "asc" }],
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, studentRoll: true, course: true, department: true, year: true, semester: true, profile: { select: { name: true } } },
    }),
    prisma.student.count({ where }),
  ]);
  return {
    total,
    pageSize: PAGE_SIZE,
    students: rows.map((s) => ({
      id: s.id,
      roll: s.studentRoll,
      name: s.profile.name,
      course: s.course,
      department: s.department,
      study: studyLabel(s.year, s.year ? fittedSemester(s.year, s.semester) : s.semester),
    })),
  };
}

/** Departments for the filter */
export async function listStudentDepartments() {
  await requireRole("ADMIN");
  const rows = await prisma.student.groupBy({ by: ["department"], where: { graduatedAt: null } });
  return rows.map((r) => r.department).filter((d): d is string => !!d).sort();
}

// ─── Promote ────────────────────────────────────────────────────────────────

type Planned = {
  id: string;
  profileId: string;
  year: number | null;
  semester: number | null;
  active: boolean;
  course: string | null;
  step: ReturnType<typeof nextStep> | null;
  /** Why it is left as it is */
  skip?: "noCourse" | "noYear";
};

async function plan(f: PromotionFilter): Promise<{ planned: Planned[]; courseName: Map<string, string> }> {
  const [students, courses] = await Promise.all([
    prisma.student.findMany({
      where: whereOf(f),
      select: { id: true, profileId: true, course: true, year: true, semester: true, profile: { select: { active: true } } },
    }),
    prisma.course.findMany({ select: { code: true, name: true, years: true } }),
  ]);
  const yearsOf = new Map(courses.map((c) => [c.code, c.years]));
  const planned = students.map((s): Planned => {
    const base = { id: s.id, profileId: s.profileId, year: s.year, semester: s.semester, active: s.profile.active, course: s.course };
    const years = s.course ? yearsOf.get(s.course) : undefined;
    if (!years) return { ...base, step: null, skip: "noCourse" };
    if (!s.year || s.year < 1) return { ...base, step: null, skip: "noYear" };
    // A year above the course's length (typed by mistake): treated as its final year
    return { ...base, step: nextStep(Math.min(s.year, years), s.semester, years) };
  });
  return { planned, courseName: new Map(courses.map((c) => [c.code, c.name])) };
}

/** What a Promote would do: counts by course and move ("2nd Year · Sem 4 → 3rd Year · Sem 5: 120") */
export async function previewPromotion(f: PromotionFilter) {
  await requireRole("ADMIN");
  const { planned, courseName } = await plan(f);
  const groups = new Map<string, { course: string; from: string; to: string; graduate: boolean; n: number; order: number }>();
  let noCourse = 0;
  let noYear = 0;
  for (const p of planned) {
    if (p.skip === "noCourse") noCourse++;
    if (p.skip === "noYear") noYear++;
    if (!p.step || !p.year) continue;
    const from = studyLabel(p.year, fittedSemester(p.year, p.semester));
    const to = p.step.kind === "graduate" ? "Graduated" : studyLabel(p.step.year, p.step.semester);
    const key = `${p.course}|${from}`;
    const g = groups.get(key) ?? {
      course: courseName.get(p.course ?? "") ?? p.course ?? "",
      from,
      to,
      graduate: p.step.kind === "graduate",
      n: 0,
      order: p.year * 10 + fittedSemester(p.year, p.semester),
    };
    g.n++;
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort((a, b) => a.course.localeCompare(b.course) || b.order - a.order);
  return {
    rows: rows.map(({ order: _o, ...r }) => r),
    moving: rows.filter((r) => !r.graduate).reduce((s, r) => s + r.n, 0),
    graduating: rows.filter((r) => r.graduate).reduce((s, r) => s + r.n, 0),
    noCourse,
    noYear,
  };
}

export async function promoteStudents(f: PromotionFilter, expected: { moving: number; graduating: number }) {
  const admin = await requireRole("ADMIN");
  const { planned } = await plan(f);
  const doing = planned.filter((p) => p.step);
  const moving = doing.filter((p) => p.step!.kind !== "graduate");
  const graduating = doing.filter((p) => p.step!.kind === "graduate");
  // The list changed since the preview (another admin, a new student): show the new numbers first
  if (moving.length !== expected.moving || graduating.length !== expected.graduating) {
    return { error: "The numbers changed since the preview. Check the new preview and press Promote again.", changed: true };
  }
  if (!doing.length) return { error: "No students to promote" };

  // Same new year / semester → one update for all of them
  const byTarget = new Map<string, string[]>();
  for (const p of moving) {
    const s = p.step as { year: number; semester: number };
    const key = `${s.year}|${s.semester}`;
    byTarget.set(key, [...(byTarget.get(key) ?? []), p.id]);
  }
  const now = new Date();
  try {
    await prisma.$transaction(
      [
        ...[...byTarget].map(([key, ids]) => {
          const [year, semester] = key.split("|").map(Number);
          return prisma.student.updateMany({ where: { id: { in: ids } }, data: { year, semester } });
        }),
        ...(graduating.length
          ? [
              prisma.student.updateMany({ where: { id: { in: graduating.map((g) => g.id) } }, data: { graduatedAt: now } }),
              prisma.profile.updateMany({ where: { id: { in: graduating.map((g) => g.profileId) } }, data: { active: false } }),
            ]
          : []),
        prisma.promotionBatch.create({
          data: {
            createdById: admin.profileId,
            createdBy: admin.name,
            moved: moving.length,
            graduated: graduating.length,
            before: doing.map((p) => ({ id: p.id, p: p.profileId, y: p.year, s: p.semester, a: p.active, g: p.step!.kind === "graduate" })),
          },
        }),
      ]
    );
  } catch (err: any) {
    console.error("[promoteStudents]", err?.message);
    return { error: "Could not promote. Nothing was changed. Please try again." };
  }
  // Graduates are signed out within seconds
  invalidateProfileCache();
  revalidatePath("/admin/promotion");
  return { success: true, moved: moving.length, graduated: graduating.length };
}

// ─── Undo ───────────────────────────────────────────────────────────────────

type Before = { id: string; p: string; y: number | null; s: number | null; a: boolean; g: boolean };

/** The newest promotion, if it can still be undone */
export async function getLastPromotion() {
  await requireRole("ADMIN");
  const last = await prisma.promotionBatch.findFirst({
    where: { undoneAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, createdBy: true, moved: true, graduated: true },
  });
  if (!last) return null;
  const until = new Date(last.createdAt.getTime() + UNDO_DAYS * 86_400_000);
  return { ...last, createdAt: last.createdAt.toISOString(), canUndo: until > new Date(), undoUntil: until.toISOString() };
}

export async function undoLastPromotion(batchId: string) {
  await requireRole("ADMIN");
  const last = await prisma.promotionBatch.findFirst({ where: { undoneAt: null }, orderBy: { createdAt: "desc" } });
  if (!last || last.id !== batchId) return { error: "Only the newest promotion can be undone" };
  if (Date.now() - last.createdAt.getTime() > UNDO_DAYS * 86_400_000) return { error: `A promotion can be undone for ${UNDO_DAYS} days only` };
  const before = (Array.isArray(last.before) ? last.before : []) as unknown as Before[];
  // Same old year / semester → one update for all of them
  const byOld = new Map<string, string[]>();
  for (const b of before) {
    const key = `${b.y ?? ""}|${b.s ?? ""}`;
    byOld.set(key, [...(byOld.get(key) ?? []), b.id]);
  }
  const grads = before.filter((b) => b.g);
  try {
    await prisma.$transaction(
      [
        ...[...byOld].map(([key, ids]) => {
          const [y, s] = key.split("|");
          return prisma.student.updateMany({
            where: { id: { in: ids } },
            data: { year: y ? Number(y) : null, semester: s ? Number(s) : null },
          });
        }),
        ...(grads.length
          ? [
              prisma.student.updateMany({ where: { id: { in: grads.map((g) => g.id) } }, data: { graduatedAt: null } }),
              // Signed in again only if they could before
              prisma.profile.updateMany({ where: { id: { in: grads.filter((g) => g.a).map((g) => g.p) } }, data: { active: true } }),
            ]
          : []),
        prisma.promotionBatch.update({ where: { id: last.id }, data: { undoneAt: new Date() } }),
      ]
    );
  } catch (err: any) {
    console.error("[undoLastPromotion]", err?.message);
    return { error: "Could not undo. Nothing was changed. Please try again." };
  }
  invalidateProfileCache();
  revalidatePath("/admin/promotion");
  return { success: true, restored: before.length };
}

// ─── Graduates ──────────────────────────────────────────────────────────────

/** Graduates by the year they graduated, with their course */
export async function listGraduates() {
  await requireRole("ADMIN");
  const rows = await prisma.$queryRaw<{ year: number; course: string | null; n: number }[]>`
    SELECT EXTRACT(YEAR FROM ("graduated_at" + interval '330 minutes'))::int AS year, course, COUNT(*)::int AS n
    FROM students WHERE "graduated_at" IS NOT NULL
    GROUP BY 1, 2 ORDER BY 1 DESC, 2`;
  return rows;
}

const REMOVE_CHUNK = 100;

/**
 * Removes the graduates of one year (all courses, or one): their logins and
 * personal details. Graduates without any pass history are deleted fully.
 * Pass and gate records are protected by the database and can never be
 * deleted, so graduates with history keep only their name and roll number
 * (old gate logs still read correctly). Works in chunks: call again while
 * `left` > 0.
 */
export async function removeGraduates(gradYear: number, course: string | null, confirm: string) {
  await requireRole("ADMIN");
  if (confirm !== "DELETE") return { error: 'Type DELETE to confirm' };
  const y = Math.floor(Number(gradYear));
  if (!y || y < 2000 || y > 3000) return { error: "Choose the graduation year" };
  const start = new Date(Date.UTC(y, 0, 1) - 330 * 60_000);
  const end = new Date(Date.UTC(y + 1, 0, 1) - 330 * 60_000);
  const where: Prisma.StudentWhereInput = {
    graduatedAt: { gte: start, lt: end },
    ...(course ? { course } : {}),
    // Not yet removed (a removed one has no phone / parents and a closed login)
    profile: { NOT: { email: { endsWith: "@removed.invalid" } } },
  };
  const batch = await prisma.student.findMany({
    where,
    take: REMOVE_CHUNK,
    select: {
      id: true,
      profileId: true,
      profile: { select: { userId: true } },
      _count: { select: { permissions: true, movements: true } },
    },
  });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let deleted = 0;
  let cleared = 0;
  for (const s of batch) {
    const history = s._count.permissions + s._count.movements > 0;
    try {
      if (history) {
        // Keep name and roll for the protected gate records; everything personal goes
        await prisma.$transaction([
          prisma.student.update({
            where: { id: s.id },
            data: {
              fatherName: null, fatherPhone: null, motherName: null, motherPhone: null,
              guardianName: null, guardianRelation: null, guardianPhone: null,
              homeAddress: null, parentVehicle: null, roomNumber: null,
            },
          }),
          prisma.profile.update({
            where: { id: s.profileId },
            data: { phone: null, active: false, email: `${s.profileId}@removed.invalid`, avatarUpdatedAt: null },
          }),
        ]);
        cleared++;
      } else {
        await prisma.profile.delete({ where: { id: s.profileId } });
        deleted++;
      }
    } catch (err: any) {
      console.error("[removeGraduates] student", s.id, err?.message);
      continue;
    }
    // The login goes too (a kept record stays switched off)
    await admin.auth.admin.deleteUser(s.profile.userId).catch(() => {});
    await deleteAvatarAdmin(s.profileId).catch(() => {});
  }
  const left = await prisma.student.count({ where });
  invalidateProfileCache();
  revalidatePath("/admin/promotion");
  return { success: true, deleted, cleared, left };
}

/** Course list for the student forms (codes and names only) */
export async function getCourseOptions() {
  await requireRole("ADMIN", "FACULTY", "FACULTY_ADMIN", "WARDEN");
  return prisma.course.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true, years: true } });
}

/** A student's course / year / semester that do not fit together, or null */
export async function studyProblem(course: string | null | undefined, year: number | null | undefined, semester: number | null | undefined): Promise<string | null> {
  if (course) {
    const c = await prisma.course.findUnique({ where: { code: course }, select: { years: true, name: true } });
    if (!c) return "Choose the course from the list";
    if (year && year > c.years) return `${c.name} has ${c.years} years`;
  }
  if (year && semester && semester !== year * 2 - 1 && semester !== year * 2) {
    return `${studyLabel(year, null)}: the semester is Sem ${year * 2 - 1} or Sem ${year * 2}`;
  }
  return null;
}

/**
 * Server-side paging for activity screens that show several kinds of rows in
 * one list, newest first (passes and gate scans of one day).
 *
 * Only the page on screen is downloaded: each kind is asked for the id and
 * time of its newest rows up to the end of the page (tiny rows), those are
 * merged in time order, and only the rows of the chosen page are then loaded
 * in full. The day's counts come from count queries, never from the rows.
 */

export const ACTIVITY_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
/** Deep pages read more ids per kind; far past any real day of records */
const MAX_PAGE = 500;

export const pageOf = (v: unknown) => Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(v) || 1)));
export const pageSizeOf = (v: unknown, fallback = ACTIVITY_PAGE_SIZE) =>
  Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(v) || fallback)));
export const textOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
/** Case-insensitive "contains" filter for a search text */
export const containsText = (q: string) => ({ contains: q, mode: "insensitive" as const });

type Head = { id: string; createdAt: Date };

export type MergeSource<K extends string> = {
  kind: K;
  /** Rows of this kind matching the screen's filters (from a count query) */
  total: number;
  /** id + time of this kind's newest `take` rows (createdAt desc, id desc) */
  heads: (take: number) => Promise<Head[]>;
  /** Full rows for these ids (any order) */
  rows: (ids: string[]) => Promise<{ id: string }[]>;
};

export type MergedItem<K extends string> = { kind: K; data: any };

/**
 * One page of several sources merged newest first. `page` past the end is
 * moved to the last page (e.g. after rows disappeared).
 */
export async function pageMerged<K extends string>(
  sources: MergeSource<K>[],
  page: number,
  pageSize: number
): Promise<{ items: MergedItem<K>[]; total: number; page: number }> {
  const active = sources.filter((s) => s.total > 0);
  const total = active.reduce((n, s) => n + s.total, 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  if (!total) return { items: [], total: 0, page: 1 };

  const skip = (current - 1) * pageSize;
  const heads = await Promise.all(active.map((s) => s.heads(Math.min(s.total, skip + pageSize))));
  const merged = heads
    .flatMap((list, i) => list.map((h) => ({ ...h, kind: active[i].kind })))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(skip, skip + pageSize);

  const full = await Promise.all(
    active.map((s) => {
      const ids = merged.filter((h) => h.kind === s.kind).map((h) => h.id);
      return ids.length ? s.rows(ids) : Promise.resolve([]);
    })
  );
  const byKey = new Map<string, { id: string }>();
  full.forEach((list, i) => list.forEach((r) => byKey.set(`${active[i].kind}:${r.id}`, r)));

  const items: MergedItem<K>[] = [];
  for (const h of merged) {
    const data = byKey.get(`${h.kind}:${h.id}`);
    // Deleted between the two reads: left out of this page
    if (data) items.push({ kind: h.kind, data });
  }
  return { items, total, page: current };
}

/** Newest-first order shared by the head reads */
export const NEWEST_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

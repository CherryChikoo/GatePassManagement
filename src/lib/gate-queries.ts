"use client";

/**
 * Gate-cache queries shared by a screen and the Security warm-up
 * (components/providers/gate-warmup.tsx), so both use the same cache key.
 */
import { callGate } from "@/lib/gate-call";

/** Visitors → Inside now: one page (20) of the visitors on campus, with a search and the total */
export const outsidersQuery = (q: string, page: number) => ({
  key: `outsiders|${q}|${page}`,
  fetch: () => callGate("getOutsiders", [{ q, page }], 15_000),
  topics: ["visitors"],
});

/** Its first page, no search (the hub's "Inside now" count is this page's total) */
export const OUTSIDERS_QUERY = outsidersQuery("", 1);

/** Today's entry count per register (Registers home) */
export const REGISTER_COUNTS_QUERY = {
  key: "register-counts",
  fetch: () => callGate("getRegisterCountsToday", [], 15_000),
  topics: ["reg:"],
};

/** Gate Log: one IST day's entries, exits and visitor visits */
export const gateLogQuery = (date: string) => ({
  key: `gate-log|${date}`,
  fetch: () => callGate("getSecurityLogData", [date], 15_000),
  topics: ["gate", "visitors"],
});

/** Faculty Book as it opens: the day, no search, first page (same key as its screen) */
export const facultyBookQuery = (date: string) => ({
  key: `faculty-book|${date}||1`,
  fetch: () => callGate("getFacultyBook", [{ date, q: "", page: 1 }]),
  topics: ["gate"],
});

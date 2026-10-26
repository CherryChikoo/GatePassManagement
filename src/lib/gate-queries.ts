"use client";

/**
 * Gate-cache queries shared by a screen and the Security warm-up
 * (components/providers/gate-warmup.tsx), so both use the same cache key.
 */
import { callGate } from "@/lib/gate-call";

/** Visitors on campus + today's exits (Visitors screen) */
export const OUTSIDERS_QUERY = {
  key: "outsiders",
  fetch: () => callGate("getOutsiders", [], 15_000),
  topics: ["visitors"],
};

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

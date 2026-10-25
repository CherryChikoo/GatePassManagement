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

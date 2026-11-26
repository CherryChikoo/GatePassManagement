import type { EntryRegister } from "./definitions";

/**
 * In / Out books whose records start one way and must be marked the other way
 * later: labour, work vehicles (come in → mark Out), Returnable (goes out →
 * mark In). Opening one from the Registers list asks "Still inside" / "Not back
 * yet" or "All records" while some are open — from any day, so an item sent out
 * days ago is easy to find and mark In (verified or not). Not the Admission
 * Book (its own Inside now), nor books that may start either way (Keys) or have
 * a board (Car / Auto). Used by the server and the browser.
 */
export function hasInsideChoice(def: { key: string; movement?: EntryRegister["movement"] }): boolean {
  const m = def.movement;
  return !!m && !m.single && m.firstDirections.length === 1 && def.key !== "ADMISSION";
}

/** The book starts with Out (e.g. Returnable): its open records are "Not back yet", not "Still inside" */
export function startsWithOut(def: { movement?: EntryRegister["movement"] }): boolean {
  return def.movement?.firstDirections.length === 1 && def.movement.firstDirections[0] === "OUT";
}

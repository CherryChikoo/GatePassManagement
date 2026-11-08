import type { EntryRegister } from "./definitions";

/**
 * In / Out books whose records come in and must be marked Out (labour, work
 * vehicles…): opening one from the Registers list asks "Still inside" or "All
 * records" while some are not marked Out. Not the Admission Book (its own
 * Inside now), nor books that start with Out (Returnable, Keys) or have a board
 * (Car / Auto start with either side). Used by the server and the browser.
 */
export function hasInsideChoice(def: { key: string; movement?: EntryRegister["movement"] }): boolean {
  const m = def.movement;
  return !!m && !m.single && m.firstDirections.length === 1 && m.firstDirections[0] === "IN" && def.key !== "ADMISSION";
}

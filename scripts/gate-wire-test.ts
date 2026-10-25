/**
 * Gate call arguments survive the trip to /api/gate (no database):
 *   npx tsx scripts/gate-wire-test.ts
 * A left-out optional argument (no note, no photo) must arrive as "left out",
 * not as null — null failed the note check and blocked every exit without a note.
 */
import { decodeGateArgs, encodeGateArgs } from "../src/lib/gate-wire";

let failures = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};
const trip = (args: unknown[]) => decodeGateArgs(JSON.parse(JSON.stringify({ args: encodeGateArgs(args) })).args);

const exitNoNote = trip(["perm-1", "gate-1", "photos/a.jpg", undefined]);
expect("exit without a note: note stays left out", exitNoNote.length === 4 && exitNoNote[3] === undefined, JSON.stringify(exitNoNote));
const facultyExit = trip(["perm-2", "gate-1", undefined, undefined]);
expect("faculty exit (no photo, no note): both left out", facultyExit[2] === undefined && facultyExit[3] === undefined);
const withNote = trip(["perm-3", "gate-1", undefined, "late bus"]);
expect("a note still arrives", withNote[3] === "late bus" && withNote[2] === undefined);
const realNull = trip(["entry-1", "remarks", null, "tok"]);
expect("a real null stays null (clearing a value)", realNull[2] === null);
const obj = trip([{ date: "2026-10-25", q: "", page: 1 }]);
expect("objects pass through", JSON.stringify(obj[0]) === JSON.stringify({ date: "2026-10-25", q: "", page: 1 }));
const lookalike = trip([{ $gateUndefined: 1, extra: true }]);
expect("only the exact marker becomes undefined", typeof lookalike[0] === "object" && lookalike[0] !== null);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);

/**
 * Meeting-code rules at the gate (no database: a stand-in counts wrong tries).
 *   npx tsx scripts/visit-code-test.ts
 */
import { checkVisitExit, MAX_CODE_TRIES, newVisitCode } from "../src/lib/visits/passes";

let failures = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

// Stand-in for the database: only the "wrong try" counter is written
function fakeDb(pass: { attempts: number }) {
  return { visitPass: { update: async () => void pass.attempts++ } } as any;
}

async function main() {
  const codes = new Set(Array.from({ length: 200 }, () => newVisitCode()));
  expect("codes are 4 digits", [...codes].every((c) => /^\d{4}$/.test(c)));
  expect("codes vary", codes.size > 150, `${codes.size} different in 200`);

  expect("no meeting -> no code needed", (await checkVisitExit(null, {}, false)).ok);
  const left = { id: "p0", code: "1234", status: "EXITED", attempts: 0, hostName: "Dr Rao" };
  expect("already left -> no code needed", (await checkVisitExit(left, {}, false)).ok);

  const pass = { id: "p1", code: "4821", status: "INSIDE", attempts: 0, hostName: "Dr Rao" };
  const db = fakeDb(pass);
  const missing = await checkVisitExit(pass, {}, false, db);
  expect("missing code is asked for", !missing.ok && missing.error === "Enter the 4-digit meeting code.");
  expect("missing code does not count as a try", pass.attempts === 0);

  const right = await checkVisitExit(pass, { code: "4821" }, false, db);
  expect("right code lets out", right.ok && right.method === "CODE");

  const wrong = await checkVisitExit(pass, { code: "1111" }, false, db);
  expect("wrong code refused", !wrong.ok && wrong.error === "Wrong code." && wrong.triesLeft === MAX_CODE_TRIES - 1, JSON.stringify(wrong));

  for (let i = 0; i < 3; i++) await checkVisitExit({ ...pass }, { code: "0000" }, false, db);
  const last = await checkVisitExit({ ...pass }, { code: "0000" }, false, db);
  expect("5th wrong code locks", !last.ok && last.locked && last.triesLeft === 0, `attempts=${pass.attempts}`);

  const afterLock = await checkVisitExit({ ...pass }, { code: "4821" }, false, db);
  expect("even the right code is refused once locked", !afterLock.ok && afterLock.locked);

  const guardOverride = await checkVisitExit({ ...pass }, { overrideReason: "Faculty on leave" }, false, db);
  expect("normal guard cannot override", !guardOverride.ok);
  const shortReason = await checkVisitExit({ ...pass }, { overrideReason: "ok" }, true, db);
  expect("override needs a real reason", !shortReason.ok);
  const headOverride = await checkVisitExit({ ...pass }, { overrideReason: "Faculty on leave, confirmed by phone" }, true, db);
  expect("Head Security / Admin override with reason", headOverride.ok && headOverride.method === "OVERRIDE");

  const spaced = await checkVisitExit({ ...pass, attempts: 0 }, { code: " 4 8 2 1 " }, false, fakeDb({ attempts: 0 }));
  expect("spaces in the typed code are ignored", spaced.ok);

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}
main();

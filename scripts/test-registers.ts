/**
 * Checks for the 19 Security registers: definitions, server-side validation,
 * completion / correction behaviour, and (if applied) the database rules that
 * make records permanent. Database checks run inside transactions that are
 * always rolled back, so nothing is saved.
 *
 *   npx tsx scripts/test-registers.ts
 */
import assert from "node:assert/strict";
import {
  REGISTERS,
  REGISTER_BY_KEY,
  facultyRequestDays,
  isEntryRegister,
  type EntryRegister,
} from "../src/lib/registers/definitions";
import { effectiveData, validateCompletion, validateNewRecord, type StaffResolver } from "../src/lib/registers/validate";
import { istDateString } from "../src/lib/time/ist";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err?.message?.split("\n")[0]}`);
  }
}

const noStaff: StaffResolver = async () => null;
const oneStaff: StaffResolver = async (id) =>
  id === "11111111-1111-1111-1111-111111111111" ? { id, name: "Ravi", employeeId: "SEC01" } : null;
const entry = (key: string) => REGISTER_BY_KEY[key as keyof typeof REGISTER_BY_KEY] as EntryRegister;
const today = istDateString();

async function main() {
  console.log("Definitions");
  await test("there are exactly 19 registers, numbered 1–19", () => {
    assert.equal(REGISTERS.length, 19);
    assert.deepEqual(REGISTERS.map((r) => r.number), Array.from({ length: 19 }, (_, i) => i + 1));
  });
  await test("Forms 8 and 9 share the same fields but are separate registers", () => {
    const a = entry("SIROS_STOCK");
    const b = entry("COLLEGE_STOCK");
    assert.notEqual(a.key, b.key);
    assert.notEqual(a.title, b.title);
    assert.deepEqual(a.fields.map((f) => f.key), b.fields.map((f) => f.key));
    assert.equal(a.fields.length, 16, "16 inputs + guard taken from the session = 17");
  });
  await test("Forms 12 and 13 are separate Boys / Ladies hostel books", () => {
    assert.equal(REGISTER_BY_KEY.BOYS_HOSTEL_OUTING.kind, "derived");
    assert.equal(REGISTER_BY_KEY.LADIES_HOSTEL_OUTING.kind, "derived");
    assert.match(REGISTER_BY_KEY.LADIES_HOSTEL_OUTING.title, /Ladies/);
  });
  await test("Form 7 = Form 6 fields + Remarks", () => {
    assert.deepEqual(entry("LABOUR_CONTRACT").fields.map((f) => f.key), [...entry("DAILY_LABOUR").fields.map((f) => f.key), "remarks"]);
  });
  await test("no register asks for a signature, serial number or visitor count", () => {
    for (const r of REGISTERS.filter(isEntryRegister)) {
      const all = [...r.fields, ...(r.groups ?? []).flatMap((g) => g.fields)];
      for (const f of all) assert.doesNotMatch(f.label, /sign(ature)?\b|serial|visitor count/i, `${r.title}: ${f.label}`);
    }
  });
  await test("Form 10 workers have no limit; Form 19 items are capped at 5", () => {
    assert.equal(entry("SIROS_LABOUR_CONTRACT").groups![0].max, null);
    assert.equal(entry("RETURNABLE").groups![0].max, 5);
  });
  await test("no register field is mandatory", () => {
    for (const r of REGISTERS.filter(isEntryRegister)) {
      for (const f of [...r.fields, ...(r.groups ?? []).flatMap((g) => g.fields)]) {
        assert.equal((f as any).required, undefined, `${r.title}: ${f.label}`);
      }
    }
  });

  console.log("Validation");
  await test("every input is optional, but a record needs at least one detail", async () => {
    const empty = await validateNewRecord(entry("KEYS"), { fields: {}, direction: "OUT" }, noStaff);
    assert.ok("error" in empty && /at least one detail/.test(empty.error));
    const one = await validateNewRecord(entry("KEYS"), { fields: { keyName: "Lab 1" }, direction: "OUT" }, noStaff);
    assert.ok(!("error" in one), JSON.stringify(one));
    const labour = await validateNewRecord(entry("DAILY_LABOUR"), { fields: { workArea: "Block C" } }, noStaff);
    assert.ok(!("error" in labour), JSON.stringify(labour));
  });
  await test("In / Out registers must choose In or Out", async () => {
    const r = await validateNewRecord(entry("CAR_BOOK"), { fields: { driverName: "Suresh" } }, noStaff);
    assert.ok("error" in r && /In or Out/.test(r.error));
    const bad = await validateNewRecord(entry("SIROS_LABOUR_CONTRACT"), { fields: { contractorName: "K" }, direction: "OUT" }, noStaff);
    assert.ok("error" in bad, "the contractor book starts with In only");
  });
  await test("date is always today and time is the server clock (typed values ignored)", async () => {
    const now = new Date("2026-10-14T10:16:00Z"); // 15:46 IST
    const r = await validateNewRecord(
      entry("CAR_BOOK"),
      { fields: { driverName: "Suresh", date: "2020-01-01", timeOut: "01:00", timeIn: "02:00", outReading: "100", inReading: "999" }, direction: "OUT" },
      noStaff,
      now
    );
    assert.ok(!("error" in r), JSON.stringify(r));
    if ("error" in r) return;
    assert.equal(r.data.date, "2026-10-14");
    assert.equal(r.entryDateStr, "2026-10-14");
    assert.equal(r.data.timeOut, "15:46");
    assert.equal(r.data.timeIn, null);
    assert.equal(r.data.outReading, 100);
    assert.equal(r.data.inReading, null, "the In reading is not taken on an Out record");
    assert.equal(r.data.direction, "OUT");
  });
  await test("College Daily Book stores the chosen In / Out", async () => {
    const r = await validateNewRecord(entry("COLLEGE_DAILY"), { fields: { whoReferred: "Principal" }, direction: "IN" }, noStaff);
    assert.ok(!("error" in r) && r.data.inOut === "In" && typeof r.data.time === "string", JSON.stringify(r));
  });
  await test("bad phones, numbers and unknown options are rejected", async () => {
    const phone = await validateNewRecord(entry("KEYS"), { fields: { phone: "12ab" }, direction: "OUT" }, noStaff);
    assert.ok("error" in phone && /phone/.test(phone.error));
    assert.ok("error" in (await validateNewRecord(entry("SIROS_STOCK"), { fields: { direction: "Sideways" } }, noStaff)));
    assert.ok("error" in (await validateNewRecord(entry("SIROS_STOCK"), { fields: { quantity: "-5" } }, noStaff)));
  });
  await test("staff fields must be a real security staff member", async () => {
    const d = entry("SECURITY_ATTENDANCE");
    const bad = await validateNewRecord(d, { fields: { staff: "typed name" }, direction: "IN" }, oneStaff);
    assert.ok("error" in bad);
    const ok = await validateNewRecord(d, { fields: { staff: "11111111-1111-1111-1111-111111111111" }, direction: "IN" }, oneStaff);
    assert.ok(!("error" in ok) && (ok.data.staff as any).name === "Ravi");
  });
  await test("Form 10 accepts more than 20 workers, stamps in-times and checks the total", async () => {
    const d = entry("SIROS_LABOUR_CONTRACT");
    const workers = Array.from({ length: 25 }, (_, i) => ({ name: `Worker ${i + 1}`, gender: i % 2 ? "Female" : "Male", assignedBy: "Supervisor" }));
    const ok = await validateNewRecord(d, { fields: { contractorName: "K Rao", totalWorkers: "30" }, groups: { workers }, direction: "IN" }, noStaff);
    assert.ok(!("error" in ok), JSON.stringify(ok));
    if (!("error" in ok)) {
      const rows = ok.data.workers as any[];
      assert.equal(rows.length, 25);
      assert.ok(rows.every((r) => typeof r.inTime === "string" && r.outTime === null));
    }
    const tooMany = await validateNewRecord(d, { fields: { contractorName: "K Rao", totalWorkers: "10" }, groups: { workers }, direction: "IN" }, noStaff);
    assert.ok("error" in tooMany && /listed 25 workers/.test(tooMany.error));
  });
  await test("Form 19 takes up to 5 items", async () => {
    const d = entry("RETURNABLE");
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ description: `Item ${i + 1}`, quantity: "1" }));
    assert.ok(!("error" in (await validateNewRecord(d, { fields: { fromName: "Dr. Rao" }, groups: { items: items(5) }, direction: "OUT" }, noStaff))));
    assert.ok("error" in (await validateNewRecord(d, { fields: { fromName: "Dr. Rao" }, groups: { items: items(6) }, direction: "OUT" }, noStaff)));
  });

  console.log("Recording the other side later");
  await test("records the other side once, at the live time, with its reading", async () => {
    const d = entry("CAR_BOOK");
    const saved = { driverName: "S", date: today, direction: "OUT", timeOut: "09:00", outReading: 100, timeIn: null, inReading: null };
    const ok = await validateCompletion(d, saved, { markMovement: true, reading: "140" }, new Date("2026-10-14T06:30:00Z"));
    assert.ok(!("error" in ok), JSON.stringify(ok));
    if (!("error" in ok)) {
      assert.equal(ok.data.timeIn, "12:00");
      assert.equal(ok.data.inReading, 140);
      assert.equal(ok.data.driverName, undefined, "nothing else can change");
    }
    assert.ok("error" in (await validateCompletion(d, { ...saved, timeIn: "11:00" }, { markMovement: true }, new Date())));
    assert.ok("error" in (await validateCompletion(d, saved, { markMovement: true, reading: "50" }, new Date())));
  });
  await test("workers can be marked out later, a few at a time", async () => {
    const d = entry("SIROS_LABOUR_CONTRACT");
    const saved = { contractorName: "K", direction: "IN", contractorIn: "08:00", contractorOut: null, workers: [{ name: "A", outTime: null }, { name: "B", outTime: null }] };
    const ok = await validateCompletion(d, saved as any, { groupMarks: { workers: [1] } }, new Date());
    assert.ok(!("error" in ok), JSON.stringify(ok));
    const shown = effectiveData(d, saved as any, [{ kind: "COMPLETION", data: (ok as any).data, createdAt: new Date() }]);
    assert.ok(typeof (shown.workers as any[])[1].outTime === "string");
    assert.equal((shown.workers as any[])[0].outTime, null);
    assert.equal((saved.workers[1] as any).outTime, null, "the saved record is untouched");
  });
  await test("single In / Out entries have nothing to record later", async () => {
    const r = await validateCompletion(entry("COLLEGE_DAILY"), { inOut: "In", time: "10:00", direction: "IN" }, { markMovement: true }, new Date());
    assert.ok("error" in r);
  });

  console.log("Faculty requests (Form 1)");
  await test("number of days by request type", () => {
    assert.equal(facultyRequestDays("ONE_HOUR", "2026-10-14", "2026-10-14"), 0);
    assert.equal(facultyRequestDays("HALF_DAY_CL", "2026-10-14", "2026-10-14"), 0.5);
    assert.equal(facultyRequestDays("FULL_DAY_CL", "2026-10-14", "2026-10-14"), 1);
    assert.equal(facultyRequestDays("MULTI_DAY_CL", "2026-10-14", "2026-10-16"), 3);
    assert.equal(facultyRequestDays("OD", "2026-10-16", "2026-10-14"), null);
  });

  await databaseChecks();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

/** Only runs when DATABASE_URL is available; every write is rolled back. */
async function databaseChecks() {
  try {
    process.loadEnvFile(".env");
  } catch {
    console.log("Database (skipped: no .env)");
    return;
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  console.log("Database");
  const ROLLBACK = "ROLLBACK_SENTINEL";
  /** Runs `fn` in a transaction that is always rolled back; returns the DB error, if any. */
  const attempt = async (fn: (tx: any) => Promise<unknown>) => {
    try {
      await prisma.$transaction(async (tx) => {
        await fn(tx);
        throw new Error(ROLLBACK);
      });
    } catch (err: any) {
      return err?.message?.includes(ROLLBACK) ? null : String(err?.message ?? err);
    }
    return null;
  };

  try {
    const triggers: { tgname: string }[] = await prisma.$queryRawUnsafe(
      `select tgname from pg_trigger where tgname in ('gp_register_entries_immutable','gp_movements_immutable','gp_permission_submission_locked','gp_outsider_locked','gp_permissions_no_delete')`
    );
    await test("register_entries table exists", async () => {
      await prisma.registerEntry.count();
    });
    if (triggers.length < 5) {
      console.log("  - immutability triggers not applied yet (run prisma/migrations/registers_immutability.sql); skipping those checks");
      return;
    }
    const profile = await prisma.profile.findFirst({ select: { id: true } });
    assert.ok(profile, "needs at least one profile");

    await test("a saved register record cannot be updated", async () => {
      const err = await attempt(async (tx) => {
        const e = await tx.registerEntry.create({
          data: { register: "KEYS", entryDate: new Date(), data: {}, recordedById: profile!.id, recordedByName: "t", recordedByRole: "SECURITY", clientToken: `test-${Date.now()}` },
        });
        await tx.registerEntry.update({ where: { id: e.id }, data: { searchText: "changed" } });
      });
      assert.ok(err && /permanent/.test(err), err ?? "update was allowed");
    });
    await test("a saved register record cannot be deleted", async () => {
      const err = await attempt(async (tx) => {
        const e = await tx.registerEntry.create({
          data: { register: "KEYS", entryDate: new Date(), data: {}, recordedById: profile!.id, recordedByName: "t", recordedByRole: "SECURITY", clientToken: `test-d-${Date.now()}` },
        });
        await tx.registerEntry.delete({ where: { id: e.id } });
      });
      assert.ok(err && /permanent/.test(err), err ?? "delete was allowed");
    });
    const movement = await prisma.movement.findFirst({ select: { id: true } });
    if (movement) {
      await test("gate movements cannot be edited or deleted", async () => {
        assert.ok(await attempt((tx) => tx.movement.update({ where: { id: movement.id }, data: { notes: "x" } })));
        assert.ok(await attempt((tx) => tx.movement.delete({ where: { id: movement.id } })));
      });
    }
    const perm = await prisma.permission.findFirst({ select: { id: true, status: true } });
    if (perm) {
      await test("submitted pass details are locked, status can still move", async () => {
        assert.ok(await attempt((tx) => tx.permission.update({ where: { id: perm.id }, data: { purpose: "changed" } })));
        assert.equal(await attempt((tx) => tx.permission.update({ where: { id: perm.id }, data: { status: perm.status } })), null);
        assert.ok(await attempt((tx) => tx.permission.delete({ where: { id: perm.id } })));
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

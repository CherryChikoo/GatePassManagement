#!/usr/bin/env node
/**
 * Small load test (no packages needed): many parallel users hitting one page.
 *
 *   node scripts/load-test.mjs <url> [users=100] [requestsPerUser=10]
 *
 * Examples
 *   node scripts/load-test.mjs https://your-site.vercel.app/api/health 200 5
 *   node scripts/load-test.mjs https://your-site.vercel.app/login 100 10
 *
 * Each "user" sends its requests one after another (like a person clicking),
 * all users at the same time. Prints the response times and any failures.
 * Free tier: keep users × requests in the low thousands per run.
 */

const [url, usersArg = "100", perUserArg = "10"] = process.argv.slice(2);
if (!url) {
  console.error("Usage: node scripts/load-test.mjs <url> [users] [requestsPerUser]");
  process.exit(1);
}
const users = Math.max(1, Math.min(2000, Number(usersArg) || 100));
const perUser = Math.max(1, Math.min(100, Number(perUserArg) || 10));

const times = [];
const failures = new Map();

async function user() {
  for (let i = 0; i < perUser; i++) {
    const start = performance.now();
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
      await res.arrayBuffer();
      times.push(performance.now() - start);
      if (res.status >= 500) failures.set(`HTTP ${res.status}`, (failures.get(`HTTP ${res.status}`) ?? 0) + 1);
    } catch (err) {
      const key = err?.name === "TimeoutError" ? "timeout (30 s)" : err?.cause?.code ?? err?.message ?? "error";
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }
  }
}

console.log(`${users} users × ${perUser} requests → ${url}`);
const started = performance.now();
await Promise.all(Array.from({ length: users }, user));
const seconds = (performance.now() - started) / 1000;

times.sort((a, b) => a - b);
const pct = (p) => (times.length ? Math.round(times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]) : 0);
const failed = [...failures.values()].reduce((a, b) => a + b, 0);
console.log(`done in ${seconds.toFixed(1)} s · ${Math.round((users * perUser) / seconds)} requests/s`);
console.log(`response time  median ${pct(50)} ms · 95% under ${pct(95)} ms · slowest ${pct(100)} ms`);
console.log(failed ? `FAILED ${failed}: ${[...failures].map(([k, v]) => `${k} × ${v}`).join(", ")}` : "no failures");
process.exit(failed ? 1 : 0);

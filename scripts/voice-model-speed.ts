/**
 * Which free Gemini model fills a form fastest right now? (made-up Car Book speech)
 * Measures time to the first streamed part and to the complete answer, twice per model.
 *
 *   npx tsx --env-file=.env scripts/voice-model-speed.ts [model ...]
 */
import { REGISTER_BY_KEY, type EntryRegister } from "../src/lib/registers/definitions";
import { voiceSpecForRegister } from "../src/lib/voice/spec";
import { buildFillRequest } from "../src/lib/voice/prompt";

const transcript = "కార్ బయటికి వెళ్తోంది. డ్రైవర్ పేరు శ్రీనివాస్. వెహికల్ నంబర్ ఏపీ 39 CD 4567. ప్రిన్సిపల్ గారి కోసం. బ్యాంకు పని. రీడింగ్ 12,345.";
const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash"];

async function timeOnce(model: string) {
  const req = buildFillRequest(voiceSpecForRegister(REGISTER_BY_KEY.CAR_BOOK as EntryRegister), transcript);
  const t0 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: req.schema, temperature: 0, thinkingConfig: { thinkingLevel: "minimal" } },
    }),
    signal: AbortSignal.timeout(40_000),
  }).catch((e) => ({ ok: false, status: e.name } as any));
  if (!res.ok) return `${res.status}`;
  const reader = res.body!.getReader();
  let first = 0;
  let text = "";
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!first) first = Date.now() - t0;
    text += dec.decode(value);
  }
  // SSE events: data: {...candidates[0].content.parts[].text}
  const answer = text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => {
      try {
        return (JSON.parse(l.slice(6)).candidates?.[0]?.content?.parts ?? []).map((p: any) => (p.thought ? "" : p.text ?? "")).join("");
      } catch {
        return "";
      }
    })
    .join("");
  if (process.env.SHOW) console.log("   ", model, answer.replace(/\s+/g, " "));
  const ok = /AP 39 CD 4567/.test(answer) && /Srinivas/i.test(answer);
  return `first ${first} ms, done ${Date.now() - t0} ms${ok ? "" : " (incomplete answer)"}`;
}

async function main() {
  for (const m of models) {
    const a = await timeOnce(m);
    const b = await timeOnce(m);
    console.log(`${m.padEnd(26)} ${a} | ${b}`);
  }
}
main().catch((e) => console.error("failed:", e.message));

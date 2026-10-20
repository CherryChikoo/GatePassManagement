/**
 * Voice filling smoke test (real services, made-up data):
 * spoken Telugu (Gemini text-to-speech) -> Sarvam -> Gemini -> cleaned form values.
 *
 *   npx tsx --env-file=.env scripts/voice-smoke-test.ts [outDir]
 *
 * Uses a few free Gemini requests and a few seconds of Sarvam audio per run.
 * Prints timings and the filled values only (never the keys).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REGISTER_BY_KEY, isEntryRegister, type EntryRegister } from "../src/lib/registers/definitions";
import { VISITOR_SPEC, keytermsFor, voiceSpecForRegister, type VoiceSpec } from "../src/lib/voice/spec";
import { buildFillRequest, cleanFill } from "../src/lib/voice/prompt";
import { fillWithGemini, transcribeClip } from "../src/lib/voice/providers";

const outDir = process.argv[2] || path.join(os.tmpdir(), "gatepass-voice-test");
fs.mkdirSync(outDir, { recursive: true });

const CASES: { name: string; spec: VoiceSpec; speech: string }[] = [
  {
    name: "car-book",
    spec: voiceSpecForRegister(REGISTER_BY_KEY.CAR_BOOK as EntryRegister),
    speech: "కార్ బయటకు వెళ్తోంది. డ్రైవర్ పేరు శ్రీనివాస్. వెహికల్ నంబర్ ఏపీ ముప్పై తొమ్మిది సీడీ నాలుగు ఐదు ఆరు ఏడు. ప్రిన్సిపాల్ గారి కోసం, బ్యాంక్ పని. రీడింగ్ పన్నెండు వేల మూడు వందల నలభై ఐదు.",
  },
  {
    name: "cooli-book",
    spec: voiceSpecForRegister(REGISTER_BY_KEY.COOLI_BOOK as EntryRegister),
    speech: "సిరోస్ వెంచర్, ఏ బ్లాక్ ప్లాస్టరింగ్ పని. మొదటి కూలీ రమేష్, మగ, కాంట్రాక్టర్ సురేష్, పనిముట్లు తాపీ బకెట్. రెండో కూలీ లక్ష్మి, ఆడ, అదే కాంట్రాక్టర్. పేమెంట్ ఇంకా ఇవ్వలేదు.",
  },
  {
    name: "visitor",
    spec: VISITOR_SPEC,
    speech: "విజిటర్ పేరు అనిల్ కుమార్, పేరెంట్. ఫోన్ తొమ్మిది ఎనిమిది ఏడు ఆరు ఐదు నాలుగు మూడు రెండు ఒకటి సున్నా. ఇరవై మూడు ఎంఈ వన్ ఏ జీరో ఫైవ్ జీ సెవెన్ ని కలవడానికి వచ్చారు. బైక్ నంబర్ టీఎస్ జీరో సెవెన్ ఈఎఫ్ ఎనిమిది ఎనిమిది ఎనిమిది ఎనిమిది.",
  },
];

function wav(pcm: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function speak(text: string, file: string) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    }),
  });
  const body: any = await res.json();
  const part = body.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!part) throw new Error(`text-to-speech failed: ${body.error?.code ?? ""}`);
  const raw = Buffer.from(part.inlineData.data, "base64");
  const data = raw.subarray(0, 4).toString() === "RIFF" ? raw : wav(raw, Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000));
  fs.writeFileSync(file, data);
  return data;
}

async function main() {
for (const c of CASES.filter((x) => !process.env.VOICE_ONLY || x.name === process.env.VOICE_ONLY)) {
  const audio = await speak(c.speech, path.join(outDir, `${c.name}.wav`));
  const t0 = Date.now();
  const transcript = await transcribeClip(new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "te-IN", keytermsFor(c.spec));
  const t1 = Date.now();
  const answer = await fillWithGemini(buildFillRequest(c.spec, transcript));
  const fill = cleanFill(c.spec, answer);
  const t2 = Date.now();
  console.log(`\n== ${c.name}  speech→text ${t1 - t0} ms, text→fields ${t2 - t1} ms`);
  console.log("heard:", transcript);
  if (process.env.VOICE_DEBUG) console.log("raw answer:", JSON.stringify(answer));
  console.log("filled:", JSON.stringify(fill));
}
}

main().catch((err) => {
  console.error("failed:", err?.message ?? err);
  process.exit(1);
});

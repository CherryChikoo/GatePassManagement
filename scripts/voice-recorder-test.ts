/**
 * Recorder logic test (no microphone, no network): real speech WAV files are
 * fed through the recorder's silence detection exactly as the microphone
 * would feed them, to check clips are cut at pauses, silence is not sent,
 * and auto-stop works.
 *
 *   npx tsx scripts/voice-recorder-test.ts <a.wav> <b.wav>
 *   npx tsx --env-file=.env scripts/voice-recorder-test.ts <a.wav> <b.wav> --send   (also transcribes the clips with Sarvam)
 */
import fs from "node:fs";
import { VoiceRecorder } from "../src/lib/voice/recorder";

/** Walk the RIFF chunks; a file whose data is itself a WAV (doubled header) is unwrapped. */
function parseWav(buf: Buffer): { rate: number; pcm: Buffer } {
  let rate = 16000;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") rate = buf.readUInt32LE(off + 12);
    if (id === "data") {
      const pcm = buf.subarray(off + 8, Math.min(buf.length, off + 8 + size));
      return pcm.toString("ascii", 0, 4) === "RIFF" ? parseWav(pcm) : { rate, pcm };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("no audio data");
}

function readWav(file: string): { rate: number; samples: Float32Array } {
  const { rate, pcm } = parseWav(fs.readFileSync(file));
  const samples = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return { rate, samples };
}

const [a, b] = process.argv.slice(2);
const one = readWav(a);
const two = readWav(b);
if (one.rate !== two.rate) throw new Error("sample rates differ");
const rate = one.rate;
const silence = (sec: number) => new Float32Array(Math.round(sec * rate)).map(() => (Math.random() - 0.5) * 0.002); // quiet room
const stream = [silence(1), one.samples, silence(2), two.samples, silence(6)];

const clips: { index: number; seconds: number; blob: Blob }[] = [];
let stopped: string | null = null;
const rec = new VoiceRecorder({
  onClip: (clip, index) => clips.push({ index, seconds: (clip.size - 44) / 2 / 16000, blob: clip }),
  onStop: (reason, heard) => (stopped = `${reason} (heard speech: ${heard})`),
});
// Drive it like the microphone does: 2048-sample buffers at the device rate
const r = rec as unknown as { ratio: number; feed: (x: Float32Array) => void };
r.ratio = rate / 16000;
let fed = 0;
outer: for (const part of stream) {
  for (let i = 0; i < part.length; i += 2048) {
    if (stopped) break outer;
    r.feed(part.subarray(i, i + 2048));
    fed += Math.min(2048, part.length - i);
  }
}
const speechSec = (one.samples.length + two.samples.length) / rate;
console.log(`input: ${(stream.reduce((n, p) => n + p.length, 0) / rate).toFixed(1)} s (speech files ${speechSec.toFixed(1)} s)`);
console.log("clips:", clips.map((c) => `#${c.index} ${c.seconds.toFixed(1)} s`).join(", "));
console.log(`sent to speech-to-text: ${clips.reduce((n, c) => n + c.seconds, 0).toFixed(1)} s`);
console.log(`stopped: ${stopped ?? "no"} after ${(fed / rate).toFixed(1)} s`);

if (process.argv.includes("--send")) {
  void (async () => {
    const { transcribeClip } = await import("../src/lib/voice/providers");
    const t0 = Date.now();
    const texts = await Promise.all(clips.map((c) => transcribeClip(c.blob, "te-IN")));
    console.log(`clips transcribed in parallel in ${Date.now() - t0} ms`);
    texts.forEach((t, i) => console.log(`  #${i}: ${t}`));
  })();
}

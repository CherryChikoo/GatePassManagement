"use client";

/**
 * Microphone recorder for voice filling (browser only).
 *
 * One tap starts it; it then works on its own:
 * - Silence is never sent: only stretches of speech (plus a little lead-in so
 *   the first syllable is not cut) become clips. Speech-to-text is billed per
 *   second of audio, so pauses cost nothing.
 * - A clip ends at a natural pause (or at 25 s, the speech service's limit for
 *   a quick request) and is handed over at once, so it is converted while the
 *   guard is still speaking.
 * - Auto-stop after 3.5 s of quiet once something was said, after 8 s if nothing
 *   was said at all, and at 2 minutes in total.
 * Clips are 16 kHz mono 16-bit WAV — what speech recognition works on, and small.
 */

export type StopReason = "user" | "silence" | "nothing" | "max";

export type RecorderCallbacks = {
  /** A finished stretch of speech (WAV) */
  onClip: (clip: Blob, index: number) => void;
  /** 0..1 loudness, about 50 times a second (for the level bar) */
  onLevel?: (level: number) => void;
  /** Recording ended (after the last clip was handed over) */
  onStop: (reason: StopReason, heardSpeech: boolean) => void;
};

const RATE = 16_000;
const FRAME = 320; // 20 ms
const PRE_ROLL_FRAMES = 15; // 300 ms kept before speech starts
const START_FRAMES = 3; // 60 ms of speech starts a clip
// Short clips reach speech-to-text sooner, so the form starts filling while the guard talks
const SOFT_END_FRAMES = 30; // 600 ms pause ends a clip that is already 2 s long
const HARD_END_FRAMES = 50; // 1 s pause always ends a clip
const SOFT_MIN_FRAMES = 100; // 2 s
const MAX_CLIP_FRAMES = 1_250; // 25 s
const KEEP_TAIL_FRAMES = 12; // 240 ms of quiet kept after the last word
const MIN_SPEECH_FRAMES = 15; // a clip needs 300 ms of speech (skips coughs, clicks)
const AUTO_STOP_FRAMES = 175; // 3.5 s of quiet after speech (a guard pausing to think is not cut off; filling has already started from the last clip)
const NOTHING_FRAMES = 400; // 8 s with no speech at all
const MAX_FRAMES = 6_000; // 2 minutes

/** 16-bit PCM WAV from float samples at RATE. */
function toWav(frames: Float32Array[]): Blob {
  const samples = frames.reduce((n, f) => n + f.length, 0);
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples * 2, true);
  let o = 44;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, f[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Can this browser record at all? */
export function canRecordVoice(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";
}

export class VoiceRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: ScriptProcessorNode | null = null;
  private ratio = 1;
  private carry = new Float32Array(0);

  private preRoll: Float32Array[] = [];
  private clip: Float32Array[] | null = null;
  private clipSpeech = 0;
  private speechRun = 0;
  private quietRun = 0;
  private sinceSpeech = 0;
  private total = 0;
  private heard = false;
  private noise = 0.004;
  private clipNo = 0;
  private stopped = false;

  constructor(private cb: RecorderCallbacks) {}

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    // Ask for 16 kHz directly (most browsers resample the mic for us); otherwise downsample here
    try {
      this.ctx = new AudioContext({ sampleRate: RATE });
    } catch {
      this.ctx = new AudioContext();
    }
    this.ratio = this.ctx.sampleRate / RATE;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor: simple and supported everywhere this runs (Chrome on Android)
    this.node = this.ctx.createScriptProcessor(2048, 1, 1);
    this.node.onaudioprocess = (e) => this.feed(e.inputBuffer.getChannelData(0));
    this.source.connect(this.node);
    this.node.connect(this.ctx.destination);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Stop now (the guard tapped Stop): the speech so far becomes the last clip. */
  stop(reason: StopReason = "user") {
    if (this.stopped) return;
    this.stopped = true;
    this.endClip(true);
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.cb.onLevel?.(0);
    this.cb.onStop(reason, this.heard);
  }

  private feed(input: Float32Array) {
    if (this.stopped) return;
    // Downsample (simple averaging) to 16 kHz when the device ignored the requested rate
    let samples: Float32Array;
    if (this.ratio === 1) samples = new Float32Array(input);
    else {
      const out = new Float32Array(Math.floor(input.length / this.ratio));
      for (let i = 0; i < out.length; i++) {
        const a = Math.floor(i * this.ratio);
        const b = Math.min(input.length, Math.floor((i + 1) * this.ratio));
        let sum = 0;
        for (let j = a; j < b; j++) sum += input[j];
        out[i] = sum / Math.max(1, b - a);
      }
      samples = out;
    }
    // Cut into 20 ms frames (keeping the remainder for next time)
    const all = new Float32Array(this.carry.length + samples.length);
    all.set(this.carry);
    all.set(samples, this.carry.length);
    let i = 0;
    for (; i + FRAME <= all.length; i += FRAME) {
      this.frame(all.slice(i, i + FRAME));
      if (this.stopped) return;
    }
    this.carry = all.slice(i);
  }

  private frame(f: Float32Array) {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    // Speech = clearly louder than the room's background noise (which is tracked while quiet)
    const threshold = Math.max(0.012, this.noise * 3);
    const speech = rms > threshold;
    if (!speech) this.noise = this.noise * 0.97 + Math.min(rms, threshold) * 0.03;
    this.cb.onLevel?.(Math.min(1, rms / 0.15));

    this.total++;
    if (speech) {
      this.speechRun++;
      this.quietRun = 0;
      this.sinceSpeech = 0;
    } else {
      this.speechRun = 0;
      this.quietRun++;
      this.sinceSpeech++;
    }

    if (this.clip) {
      this.clip.push(f);
      if (speech) this.clipSpeech++;
      const len = this.clip.length;
      if (len >= MAX_CLIP_FRAMES || this.quietRun >= HARD_END_FRAMES || (this.quietRun >= SOFT_END_FRAMES && len >= SOFT_MIN_FRAMES)) {
        this.endClip(false);
      }
    } else {
      this.preRoll.push(f);
      if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
      if (this.speechRun >= START_FRAMES) {
        this.clip = [...this.preRoll];
        this.clipSpeech = this.speechRun;
        this.preRoll = [];
        this.heard = true;
      }
    }

    if (this.total >= MAX_FRAMES) this.stop("max");
    else if (this.heard && this.sinceSpeech >= AUTO_STOP_FRAMES) this.stop("silence");
    else if (!this.heard && this.total >= NOTHING_FRAMES) this.stop("nothing");
  }

  private endClip(final: boolean) {
    const clip = this.clip;
    this.clip = null;
    if (!clip) return;
    // Drop the quiet tail (keep a moment after the last word)
    const trimmed = final ? clip : clip.slice(0, Math.max(1, clip.length - Math.max(0, this.quietRun - KEEP_TAIL_FRAMES)));
    if (this.clipSpeech >= MIN_SPEECH_FRAMES) this.cb.onClip(toWav(trimmed), this.clipNo++);
    this.clipSpeech = 0;
  }
}

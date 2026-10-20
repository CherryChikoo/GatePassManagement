"use client";

/**
 * Voice filling for a form: one tap, speak everything, the form fills itself.
 *
 * useVoiceFill runs a session:
 *   mic (silence trimmed, auto-stop) -> a clip at each pause -> /api/voice/transcribe
 *   (Sarvam) while the guard is still speaking -> /api/voice/fill (Gemini) on the
 *   words so far, so fields appear during speaking -> one last fill after the
 *   last words. "Speak again" adds to what was said before.
 * VoicePanel is the button / listening / result card shown at the top of a form.
 *
 * The form decides how results are merged (never over what the guard typed).
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, RotateCcw, Square, TriangleAlert } from "lucide-react";
import { useLang, useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";
import { VoiceRecorder, canRecordVoice, type StopReason } from "@/lib/voice/recorder";
import type { VoiceFill } from "@/lib/voice/spec";

export type VoiceStatus = "idle" | "listening" | "working" | "done" | "error";

type ApiError = Error & { status?: number };

async function postJson(url: string, body: unknown, timeoutMs: number) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || "Something went wrong"), { status: res.status }) as ApiError;
  return data;
}

async function transcribe(clip: Blob, form: string, lang: string): Promise<string> {
  const fd = new FormData();
  fd.append("audio", clip, "clip.wav");
  fd.append("form", form);
  fd.append("lang", lang);
  const res = await fetch("/api/voice/transcribe", { method: "POST", credentials: "include", body: fd, signal: AbortSignal.timeout(30_000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || "Could not hear that clearly"), { status: res.status }) as ApiError;
  return typeof data?.transcript === "string" ? data.transcript : "";
}

function friendly(err: unknown, fallback: string): string {
  const e = err as ApiError;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "Taking too long. Check the connection and try again.";
  if (e?.name === "TypeError") return "No internet connection. Please type the details.";
  return e?.message || fallback;
}

type SessionUi = {
  setStatus: (s: VoiceStatus) => void;
  setLevel: (n: number) => void;
  setSeconds: (n: number) => void;
  setTranscript: (t: string) => void;
  setMessage: (m: string | null) => void;
  setFilled: (n: number) => void;
  setCanRetry: (b: boolean) => void;
  /** Latest form key / screen language / result handler (read at use, never stale) */
  form: () => string;
  lang: () => string;
  onFill: (fill: VoiceFill) => void;
};

/**
 * One form's voice filling, outside React so async steps always see the
 * current state: recording, clip-by-clip speech-to-text, and filling from the
 * words so far (one fill at a time; another one only if new words arrived).
 */
class VoiceSession {
  private recorder: VoiceRecorder | null = null;
  /** Words from earlier recordings on this form ("Speak again" adds to them) */
  private earlier = "";
  private parts = new Map<number, string>();
  private pending = 0;
  private stopped = true;
  private fillBusy = false;
  private lastFilled = "";
  private fillFailed = "";
  private clipFailed = false;
  /** Bumped on every new recording / reset: late answers of older ones are ignored */
  private run = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private ui: SessionUi) {}

  private text() {
    const now = [...this.parts.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t).filter(Boolean);
    return [this.earlier, ...now].filter(Boolean).join(" ").trim();
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async start() {
    if (!this.stopped) return;
    this.ui.setMessage(null);
    if (!canRecordVoice()) {
      this.ui.setStatus("error");
      this.ui.setMessage("This phone's browser cannot record. Please type the details.");
      return;
    }
    const run = ++this.run;
    this.parts = new Map();
    this.pending = 0;
    this.stopped = false;
    this.fillFailed = "";
    this.clipFailed = false;
    this.ui.setCanRetry(false);
    this.ui.setSeconds(0);
    this.ui.setStatus("listening");

    const recorder = new VoiceRecorder({
      onLevel: this.ui.setLevel,
      onClip: (clip, i) => {
        if (run !== this.run) return;
        this.pending++;
        transcribe(clip, this.ui.form(), this.ui.lang())
          .then((text) => {
            if (run !== this.run) return;
            this.parts.set(i, text);
            this.ui.setTranscript(this.text());
            void this.fill(); // fill from the words so far, while the guard keeps speaking
          })
          .catch((err) => {
            if (run !== this.run) return;
            this.clipFailed = true;
            this.ui.setMessage(friendly(err, "Could not hear that clearly."));
          })
          .finally(() => {
            if (run !== this.run) return;
            this.pending--;
            this.finishIfDone();
          });
      },
      onStop: (_reason: StopReason, heard) => {
        if (run !== this.run) return;
        this.stopTimer();
        this.stopped = true;
        this.recorder = null;
        if (!heard && !this.earlier) {
          this.ui.setStatus("error");
          this.ui.setMessage("Didn't hear anything. Tap the mic and speak.");
          return;
        }
        this.ui.setStatus("working");
        this.finishIfDone();
      },
    });
    this.recorder = recorder;
    try {
      await recorder.start();
      const began = Date.now();
      this.timer = setInterval(() => this.ui.setSeconds(Math.floor((Date.now() - began) / 1000)), 500);
    } catch (err) {
      this.stopped = true;
      this.recorder = null;
      this.ui.setStatus("error");
      const name = (err as Error)?.name;
      this.ui.setMessage(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Allow microphone access for this site, then tap the mic again."
          : name === "NotFoundError"
          ? "No microphone found on this device."
          : "Could not start the microphone. Please type the details."
      );
    }
  }

  stop() {
    this.recorder?.stop("user");
  }

  /** Fill from the words so far. Only one at a time; finishing runs another if new words came. */
  private async fill() {
    if (this.fillBusy) return;
    const text = this.text();
    if (!text || text === this.lastFilled || text === this.fillFailed) return;
    const run = this.run;
    this.fillBusy = true;
    try {
      let data: VoiceFill;
      try {
        data = await postJson("/api/voice/fill", { form: this.ui.form(), transcript: text }, 60_000);
      } catch (err) {
        // Busy free service: one more try after a moment
        if ((err as ApiError).status !== 503) throw err;
        await new Promise((r) => setTimeout(r, 1500));
        data = await postJson("/api/voice/fill", { form: this.ui.form(), transcript: text }, 60_000);
      }
      if (run !== this.run) return;
      this.lastFilled = text;
      this.ui.setFilled(
        Object.keys(data.fields ?? {}).length + Object.values(data.groups ?? {}).reduce((n, rows) => n + rows.length, 0) + (data.direction ? 1 : 0)
      );
      this.ui.onFill(data);
    } catch (err) {
      if (run !== this.run) return;
      this.fillFailed = text;
      this.ui.setCanRetry(true);
      this.ui.setMessage(friendly(err, "Could not fill the form from that. Please type it."));
    } finally {
      if (run === this.run) {
        this.fillBusy = false;
        if (this.text() !== this.lastFilled && this.text() !== this.fillFailed) void this.fill();
        else this.finishIfDone();
      }
    }
  }

  /** After the last clip and the last fill: show the result. */
  private finishIfDone() {
    if (!this.stopped || this.pending > 0 || this.fillBusy) return;
    const text = this.text();
    if (!text) {
      this.ui.setStatus("error");
      this.ui.setMessage(this.clipFailed ? "Could not hear that clearly. Please try again." : "Didn't hear anything. Tap the mic and speak.");
      return;
    }
    if (text !== this.lastFilled && text !== this.fillFailed) {
      void this.fill();
      return;
    }
    this.earlier = text;
    this.parts = new Map();
    if (this.fillFailed === text) this.ui.setStatus("error");
    else {
      this.ui.setStatus("done");
      if (this.clipFailed) this.ui.setMessage("Part of what you said was not clear. Please check the details.");
    }
  }

  /** Fill again from the same words (after a failed fill). */
  retryFill() {
    this.fillFailed = "";
    this.lastFilled = "";
    this.ui.setCanRetry(false);
    this.ui.setMessage(null);
    this.ui.setStatus("working");
    void this.fill();
  }

  /** Forget everything said (Undo, or leaving the form). */
  reset() {
    this.run++;
    this.recorder?.stop("user");
    this.recorder = null;
    this.stopTimer();
    this.earlier = "";
    this.parts = new Map();
    this.pending = 0;
    this.stopped = true;
    this.fillBusy = false;
    this.lastFilled = "";
    this.fillFailed = "";
    this.clipFailed = false;
    this.ui.setTranscript("");
    this.ui.setMessage(null);
    this.ui.setFilled(0);
    this.ui.setCanRetry(false);
    this.ui.setStatus("idle");
  }
}

export function useVoiceFill({ form, onFill }: { form: string; onFill: (fill: VoiceFill) => void }) {
  const { lang } = useLang();
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [filled, setFilled] = useState(0);
  const [canRetry, setCanRetry] = useState(false);

  const latest = useRef({ form, lang, onFill });
  useEffect(() => {
    latest.current = { form, lang, onFill };
  });

  // Created on first use (outside render), so it always reads the latest form / language / handler
  const sessionRef = useRef<VoiceSession | null>(null);
  const session = () =>
    (sessionRef.current ??= new VoiceSession({
      setStatus,
      setLevel,
      setSeconds,
      setTranscript,
      setMessage,
      setFilled,
      setCanRetry,
      form: () => latest.current.form,
      lang: () => latest.current.lang,
      onFill: (fill) => latest.current.onFill(fill),
    }));

  // Leaving the form releases the microphone
  useEffect(() => () => sessionRef.current?.reset(), []);

  return {
    status,
    level,
    seconds,
    transcript,
    message,
    filled,
    canRetry,
    start: () => session().start(),
    stop: () => session().stop(),
    retryFill: () => session().retryFill(),
    reset: () => session().reset(),
  };
}

export type VoiceFillState = ReturnType<typeof useVoiceFill>;

const clock = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

/** The voice card at the top of a form. */
export function VoicePanel({ voice, onUndo }: { voice: VoiceFillState; onUndo?: () => void }) {
  const t = useT();
  const { status } = voice;
  const heard = voice.transcript && (
    <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
      <span className="text-zinc-500">{t("Heard")}: </span>
      {voice.transcript}
    </p>
  );

  if (status === "idle") {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => void voice.start()}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-4 text-base font-semibold text-orange-500 transition-[background-color,transform] hover:bg-orange-500/15 active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-[0_8px_18px_-10px_rgba(207,62,37,0.7)]">
            <Mic className="h-5 w-5" />
          </span>
          {t("Speak the details")}
        </button>
        <p className="text-center text-xs text-zinc-500">{t("Say everything in one go, in any order. The form fills itself — check it before saving.")}</p>
      </div>
    );
  }

  if (status === "listening") {
    return (
      <div className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" aria-hidden="true" />
            <Mic className="relative h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-zinc-100">
              {t("Listening…")} <span className="tabular-nums text-zinc-500">{clock(voice.seconds)}</span>
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
              <div className="h-full rounded-full bg-red-500 transition-[width] duration-75" style={{ width: `${Math.round(voice.level * 100)}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={voice.stop}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 active:scale-95"
          >
            <Square className="h-4 w-4 fill-current" /> {t("Stop")}
          </button>
        </div>
        <p className="text-xs text-zinc-500">{t("It stops by itself when you stop talking.")}</p>
        {heard}
      </div>
    );
  }

  if (status === "working") {
    return (
      <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-base font-semibold text-zinc-100">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" /> {t("Filling the form…")}
        </p>
        {heard}
      </div>
    );
  }

  const ok = status === "done";
  return (
    <div className={cn("space-y-3 rounded-2xl border p-4", ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")} role="status" aria-live="polite">
      <p className={cn("flex items-start gap-2 text-sm font-medium", ok ? "text-emerald-600" : "text-red-500")}>
        {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />}
        <span>
          {ok
            ? voice.filled > 0
              ? t("Filled {n} details from your voice. Check the highlighted fields, then save.", { n: voice.filled })
              : t("No form details were found in what you said. Please type them, or speak again.")
            : t(voice.message ?? "Something went wrong")}
        </span>
      </p>
      {ok && voice.message && <p className="text-xs text-amber-600">{t(voice.message)}</p>}
      {heard}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void voice.start()}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700 active:scale-95"
        >
          <Mic className="h-4 w-4" /> {voice.transcript ? t("Speak again (add more)") : t("Try again")}
        </button>
        {!ok && voice.canRetry && (
          <button
            type="button"
            onClick={voice.retryFill}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-5 text-sm font-medium text-zinc-200 hover:bg-zinc-950"
          >
            <RotateCcw className="h-4 w-4" /> {t("Fill again")}
          </button>
        )}
        {onUndo && voice.transcript && (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-5 text-sm font-medium text-zinc-200 hover:bg-zinc-950"
          >
            <RotateCcw className="h-4 w-4" /> {t("Undo voice fill")}
          </button>
        )}
      </div>
    </div>
  );
}

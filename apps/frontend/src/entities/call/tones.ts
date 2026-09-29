/**
 * Ringtone (incoming call) and ringback (outgoing call) tones, synthesized
 * with the WebAudio API — no audio asset files (calls plan §Фаза 3). Both
 * feature-detect `AudioContext` and `navigator.vibrate`, so a browser
 * without either just stays silent instead of throwing mid-call. Call the
 * returned `stop()` as soon as the call leaves the ringing state (answered,
 * declined, cancelled, timed out) — nothing else stops these on its own.
 */

interface ToneStep {
  freq: number;
  startMs: number;
  durationMs: number;
}

type AudioContextCtor = new () => AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

// Two-beep classic ring, repeating every 2s.
const RINGTONE_PATTERN: ToneStep[] = [
  { freq: 480, startMs: 0, durationMs: 380 },
  { freq: 620, startMs: 430, durationMs: 380 },
];
const RINGTONE_PERIOD_MS = 2000;

// Single long tone, repeating every 4s — the classic PSTN ringback cadence.
const RINGBACK_PATTERN: ToneStep[] = [{ freq: 425, startMs: 0, durationMs: 1000 }];
const RINGBACK_PERIOD_MS = 4000;

// Fast triple-beep "busy" tone (higher/shorter than ringback, distinct from
// ringtone's two-note pattern), repeating every 1.5s — matches the classic
// PSTN busy cadence closely enough to read as "they're occupied", not "ring
// again".
const BUSY_PATTERN: ToneStep[] = [
  { freq: 480, startMs: 0, durationMs: 250 },
  { freq: 480, startMs: 350, durationMs: 250 },
];
const BUSY_PERIOD_MS = 1500;

export const RING_VIBRATION_PATTERN = [400, 200, 400, 200, 400];

function playTonePattern(pattern: ToneStep[], periodMs: number): () => void {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return () => undefined;

  const ctx = new Ctor();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleCycle = (): void => {
    if (stopped) return;
    const cycleStart = ctx.currentTime;
    for (const step of pattern) {
      const startAt = cycleStart + step.startMs / 1000;
      const stopAt = startAt + step.durationMs / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = step.freq;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.18, startAt + 0.02);
      gain.gain.setValueAtTime(0.18, Math.max(startAt + 0.02, stopAt - 0.02));
      gain.gain.linearRampToValueAtTime(0, stopAt);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(stopAt + 0.02);
    }
    timer = setTimeout(scheduleCycle, periodMs);
  };

  scheduleCycle();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    void ctx.close().catch(() => {
      // AudioContext.close() rejects if it's already closed — nothing to do.
    });
  };
}

/** Loops until `stop()` is called — `IncomingCall` starts this while
 * `phase === "incoming"`. */
export function playRingtone(): () => void {
  return playTonePattern(RINGTONE_PATTERN, RINGTONE_PERIOD_MS);
}

/** Loops until `stop()` is called — the outgoing-call UI starts this while
 * `phase === "outgoing"`. */
export function playRingback(): () => void {
  return playTonePattern(RINGBACK_PATTERN, RINGBACK_PERIOD_MS);
}

/** Loops until `stop()` is called — `CallEnded` starts this for
 * `endReason: "busy"` for as long as its summary screen is showing. */
export function playBusy(): () => void {
  return playTonePattern(BUSY_PATTERN, BUSY_PERIOD_MS);
}

/** One vibration burst — call again on each ring cycle if a repeating
 * vibration is wanted; feature-detected, a no-op where unsupported (desktop
 * browsers, Safari). */
export function vibrateRing(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(RING_VIBRATION_PATTERN);
}

/** Cancels any in-progress vibration started by `vibrateRing`. */
export function stopVibration(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(0);
}

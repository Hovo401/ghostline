import { useCallback, useEffect, useRef, useState } from "react";

import { type RecorderKind, VIDEO_NOTE_MAX_MS, useRecorderStore } from "./recorder-store";

export interface RecordedMedia {
  kind: RecorderKind;
  blob: Blob;
  mime: string;
  durationMs: number;
  waveform: number[];
}

const LEVEL_SAMPLE_INTERVAL_MS = 120;

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

/**
 * Drives `MediaRecorder` + an `AnalyserNode` (live waveform bars) off
 * `recorder-store`'s state machine — kept separate from the store itself
 * so the pure state transitions stay unit-testable (recorder-store.spec.ts)
 * without a real microphone/camera, which jsdom can't provide. `finish`
 * resolves with the recorded blob + duration + waveform, ready to hand to
 * `useUploadAttachment`; `cancel` discards everything instead.
 */
export function useRecorder() {
  const kind = useRecorderStore((state) => state.kind);
  const elapsedMs = useRecorderStore((state) => state.elapsedMs);
  const levels = useRecorderStore((state) => state.levels);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const finishRef = useRef<() => Promise<RecordedMedia | null>>(() => Promise.resolve(null));

  const teardown = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    stopTracks(streamRef.current);
    streamRef.current = null;
    setPreviewStream(null);
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const sampleLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.length ? data.reduce((sum, v) => sum + v, 0) / data.length : 0;
      useRecorderStore.getState().tick(Math.round(avg));
    }
    const state = useRecorderStore.getState();
    if (state.kind === "video" && state.elapsedMs >= VIDEO_NOTE_MAX_MS) {
      void finishRef.current();
    }
  }, []);

  const start = useCallback(
    async (recordKind: RecorderKind): Promise<void> => {
      const constraints: MediaStreamConstraints =
        recordKind === "video" ? { audio: true, video: { facingMode: "user" } } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (recordKind === "video") setPreviewStream(stream);

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();

      useRecorderStore.getState().start(recordKind);
      intervalRef.current = window.setInterval(sampleLevel, LEVEL_SAMPLE_INTERVAL_MS);
    },
    [sampleLevel],
  );

  const cancel = useCallback(() => {
    mediaRecorderRef.current?.stop();
    teardown();
    useRecorderStore.getState().stop();
  }, [teardown]);

  const finish = useCallback(async (): Promise<RecordedMedia | null> => {
    const recorder = mediaRecorderRef.current;
    const recordingKind = useRecorderStore.getState().kind;
    const durationMs = useRecorderStore.getState().elapsedMs;
    const waveform = useRecorderStore.getState().levels;
    if (!recorder || !recordingKind) {
      teardown();
      useRecorderStore.getState().stop();
      return null;
    }

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorder.stop();
    });

    const mime = recorder.mimeType;
    teardown();
    useRecorderStore.getState().stop();

    if (durationMs < 500) return null;
    return { kind: recordingKind, blob, mime, durationMs, waveform };
  }, [teardown]);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  // Recording is scoped to one Composer mount — release the mic/camera if
  // the thread is switched away from mid-recording instead of leaking it.
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, []);

  return { kind, elapsedMs, levels, previewStream, start, cancel, finish };
}

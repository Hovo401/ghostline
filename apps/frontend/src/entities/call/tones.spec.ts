import { afterEach, describe, expect, it, vi } from "vitest";

import { playBusy, playRingback, playRingtone, stopVibration, vibrateRing } from "./tones";

describe("tones", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("playRingtone/playRingback are no-ops without AudioContext (feature detection)", () => {
    // jsdom doesn't implement AudioContext — this is the real environment
    // these run in during every other test in the suite too.
    expect(() => {
      const stop = playRingtone();
      stop();
    }).not.toThrow();
    expect(() => {
      const stop = playRingback();
      stop();
    }).not.toThrow();
    expect(() => {
      const stop = playBusy();
      stop();
    }).not.toThrow();
  });

  it("plays a looping tone pattern through a stubbed AudioContext and stops cleanly", () => {
    vi.useFakeTimers();
    const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
    const close = vi.fn().mockResolvedValue(undefined);
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      createOscillator() {
        const osc = {
          type: "sine",
          frequency: { value: 0 },
          connect: vi.fn().mockReturnThis(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillators.push(osc);
        return osc;
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }
      close = close;
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const stop = playRingtone();
    expect(oscillators.length).toBeGreaterThan(0);
    oscillators.forEach((osc) => {
      expect(osc.start).toHaveBeenCalled();
    });

    stop();
    expect(close).toHaveBeenCalled();

    const countAfterStop = oscillators.length;
    vi.advanceTimersByTime(5000);
    // No further cycles are scheduled once stopped.
    expect(oscillators.length).toBe(countAfterStop);
    vi.useRealTimers();
  });

  it("vibrateRing/stopVibration feature-detect navigator.vibrate", () => {
    expect(() => {
      vibrateRing();
      stopVibration();
    }).not.toThrow();

    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    vibrateRing();
    expect(vibrate).toHaveBeenCalledWith([400, 200, 400, 200, 400]);
    stopVibration();
    expect(vibrate).toHaveBeenCalledWith(0);
  });
});

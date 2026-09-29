import { useEffect, useState } from "react";

/** Simplified, UI-facing subset of LiveKit's `ConnectionState`/
 * `ConnectionQuality` enums — keeps this component (and its test) decoupled
 * from `livekit-client`'s types; `CallScreen` maps the real enums into these
 * before passing them down. */
export type CallConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";
export type CallConnectionQuality = "excellent" | "good" | "poor" | "unknown";

const POOR_QUALITY_PROMPT_DELAY_MS = 8000;

interface ConnectionQualityBannerProps {
  connectionState: CallConnectionState;
  quality: CallConnectionQuality;
  videoEnabled: boolean;
  onDisableVideo: () => void;
}

/**
 * "Переподключение…" / "Слабая связь" banner (calls plan §Фаза 4) — a
 * sustained (8s) `poor` quality reading while video is on adds a one-tap
 * "Выключить видео?" prompt, since disabling video is the single biggest
 * lever a caller has over their own bandwidth use.
 */
export function ConnectionQualityBanner({
  connectionState,
  quality,
  videoEnabled,
  onDisableVideo,
}: ConnectionQualityBannerProps) {
  const [showVideoPrompt, setShowVideoPrompt] = useState(false);

  useEffect(() => {
    if (quality !== "poor" || !videoEnabled) {
      setShowVideoPrompt(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowVideoPrompt(true);
    }, POOR_QUALITY_PROMPT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [quality, videoEnabled]);

  if (connectionState === "reconnecting") {
    return (
      <div className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 font-mono text-xs text-white">
        Переподключение…
      </div>
    );
  }

  if (quality === "poor") {
    return (
      <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-4 py-2 font-mono text-xs text-white">
        <span>Слабая связь</span>
        {showVideoPrompt && videoEnabled && (
          <button type="button" onClick={onDisableVideo} className="underline">
            Выключить видео?
          </button>
        )}
      </div>
    );
  }

  return null;
}

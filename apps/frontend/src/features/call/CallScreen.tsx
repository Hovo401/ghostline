import { ConnectionQuality, ConnectionState } from "livekit-client";
import { useEffect } from "react";

import { playRingback, useCallActions, useCallStore } from "../../entities/call";
import { formatDuration } from "../../entities/message";
import { useBackToClose } from "../../shared/lib/use-back-to-close";
import { Avatar } from "../../shared/ui/avatar";
import { HangupIcon } from "../../shared/ui/call-icons";
import { IconButton } from "../../shared/ui/icon-button";

import {
  ConnectionQualityBanner,
  type CallConnectionQuality,
  type CallConnectionState,
} from "./ConnectionQualityBanner";
import { useCallPeer } from "./use-call-peer";
import type { CallSessionHandle } from "./use-call-session";
import { useElapsedMs } from "./use-call-timer";
import { useNativePip } from "./use-native-pip";
import { useTrackAttach } from "./use-track-attach";
import { useWakeLock } from "./use-wake-lock";

function mapConnectionState(state: ConnectionState): CallConnectionState {
  if (state === ConnectionState.Connected) return "connected";
  if (state === ConnectionState.Reconnecting) return "reconnecting";
  if (state === ConnectionState.Disconnected) return "disconnected";
  return "connecting";
}

function mapQuality(quality: ConnectionQuality): CallConnectionQuality {
  if (quality === ConnectionQuality.Excellent) return "excellent";
  if (quality === ConnectionQuality.Good) return "good";
  if (quality === ConnectionQuality.Poor) return "poor";
  return "unknown";
}

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2.5" y="6.5" width="13" height="11" rx="2.2" />
      <path d="M15.5 10.5l6-3.2v9.4l-6-3.2" />
      {off && <path d="M2 2l20 20" />}
    </svg>
  );
}

function FlipCameraIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8a8 8 0 0113-4l2-2M20 16a8 8 0 01-13 4l-2 2" />
      <path d="M17 2v4h-4M7 22v-4h4" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 14h6v6M18 10h-6V4" />
    </svg>
  );
}

/** Caller's "ringing, waiting for answer" screen — shown for `phase ===
 * "outgoing"`, before LiveKit join credentials exist at all (or even before
 * a `Call` object exists, during `call-store`'s `draft`), so it renders
 * without a session handle. Plays the ringback tone for as long as it's up. */
function OutgoingCallScreen({
  video,
  peerName,
  peerAvatar,
  onCancel,
}: {
  video: boolean;
  peerName: string;
  peerAvatar?: string;
  onCancel: () => void;
}) {
  useEffect(() => {
    const stop = playRingback();
    return stop;
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Звонок"
      className="p-safe fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-desk text-white"
    >
      <Avatar name={peerName} src={peerAvatar} size={140} />
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-lg font-medium">{peerName}</span>
        <span className="font-mono text-xs text-white/70">
          {video ? "Видеозвонок" : "Аудиозвонок"} · вызов…
        </span>
      </div>
      <IconButton
        icon={<HangupIcon />}
        label="Отменить звонок"
        onClick={onCancel}
        className="h-14 w-14 bg-danger text-white"
      />
    </div>
  );
}

export interface CallScreenProps {
  session: CallSessionHandle;
}

/**
 * Full-screen call UI (calls plan §Фаза 3/4) — rendered by `CallRoot`
 * (`routes/app.tsx`'s only call mount), which owns the LiveKit session
 * (`useCallSession`) independently of this component's mount state. Renders
 * nothing outside an outgoing/connecting/active/reconnecting call this
 * device isn't currently minimizing — minimizing just stops rendering this,
 * it does *not* tear down `session` (that lives in `CallRoot`, unaffected by
 * this component unmounting). Remote audio is played by `CallRoot`, not
 * here, so it keeps playing while this is minimized.
 */
export function CallScreen({ session }: CallScreenProps) {
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const draft = useCallStore((state) => state.draft);
  const minimized = useCallStore((state) => state.minimized);
  const minimize = useCallStore((state) => state.minimize);
  const pip = useNativePip();
  const { hangup, cancel } = useCallActions();
  const chatId = call?.chatId ?? draft?.chatId ?? null;
  const peer = useCallPeer(chatId, call);
  const peerName = peer?.displayName ?? "Абонент";

  const elapsedMs = useElapsedMs(phase === "active" ? (call?.answeredAt ?? null) : null);
  useWakeLock(phase === "active");
  // Back on the fullscreen call minimizes it to the mini-bar, like Telegram
  // — it never hangs up. Mirrors the render conditions below.
  const connected = phase === "connecting" || phase === "active" || phase === "reconnecting";
  useBackToClose(!minimized && (phase === "outgoing" || (connected && call !== null)), minimize);

  useEffect(() => {
    if (phase === "idle" || phase === "ended") return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      // `preventDefault()` alone is the current, interoperable way to
      // trigger the browser's native "leave site?" prompt — the legacy
      // `event.returnValue = "..."` string-assignment pattern is deprecated
      // (`@typescript-eslint/no-deprecated`) and unnecessary on top of this.
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [phase]);

  const {
    connectionState,
    quality,
    remoteSpeaking,
    localVideoTrack,
    remoteVideoTrack,
    micEnabled,
    cameraEnabled,
    mediaError,
    canFlipCamera,
    toggleMic,
    toggleCamera,
    flipCamera,
  } = session;

  const localVideoRef = useTrackAttach(localVideoTrack);
  const remoteVideoRef = useTrackAttach(remoteVideoTrack);

  // Picture-in-picture (T-088): the window is tiny and non-interactive, so
  // only the remote video (or the avatar) fills it. Takes precedence over
  // `minimized` — the PiP window would otherwise show the chat list.
  if (pip && connected && call) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Звонок"
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-desk text-white"
      >
        {remoteVideoTrack !== null ? (
          <video
            ref={remoteVideoRef}
            playsInline
            autoPlay
            className="h-full w-full object-contain"
          />
        ) : (
          <Avatar name={peerName} src={peer?.avatarUrl} size={72} />
        )}
      </div>
    );
  }

  if (minimized) return null;

  if (phase === "outgoing") {
    return (
      <OutgoingCallScreen
        video={call?.video ?? draft?.video ?? false}
        peerName={peerName}
        peerAvatar={peer?.avatarUrl}
        onCancel={cancel}
      />
    );
  }

  if (!connected || !call) return null;

  const showRemoteVideo = remoteVideoTrack !== null;
  const showLocalVideo = localVideoTrack !== null && cameraEnabled;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Звонок"
      className="p-safe fixed inset-0 z-50 flex flex-col bg-desk text-white"
    >
      <ConnectionQualityBanner
        connectionState={mapConnectionState(connectionState)}
        quality={mapQuality(quality)}
        videoEnabled={showLocalVideo}
        onDisableVideo={toggleCamera}
      />

      <div className="flex h-16 flex-none items-center justify-between px-4">
        <div className="flex flex-col">
          <span className="text-[15px] font-medium">{peerName}</span>
          <span className="font-mono text-xs text-white/70">
            {phase === "active" ? formatDuration(elapsedMs) : "Соединение…"}
          </span>
        </div>
        <IconButton icon={<MinimizeIcon />} label="Свернуть" variant="inverse" onClick={minimize} />
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {showRemoteVideo ? (
          <video
            ref={remoteVideoRef}
            playsInline
            autoPlay
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <span
              className={[
                "rounded-full transition-shadow duration-300",
                remoteSpeaking ? "shadow-[0_0_0_6px_var(--color-accent)]" : "",
              ].join(" ")}
            >
              <Avatar name={peerName} src={peer?.avatarUrl} size={140} />
            </span>
            <span className="text-sm text-white/70">
              {call.video ? "Камера собеседника выключена" : "Аудиозвонок"}
            </span>
          </div>
        )}

        {showLocalVideo && (
          <video
            ref={localVideoRef}
            playsInline
            autoPlay
            muted
            className="absolute right-4 bottom-4 h-36 w-24 rounded-2xl border border-white/20 object-cover shadow-glow sm:h-44 sm:w-32"
          />
        )}

        {(mediaError.camera ?? mediaError.microphone) && (
          <div className="absolute bottom-4 left-4 max-w-70 rounded-xl bg-black/60 px-3.5 py-2.5 text-xs text-white/85">
            {mediaError.microphone && <p>Микрофон недоступен: {mediaError.microphone}</p>}
            {mediaError.camera && <p>Камера недоступна: {mediaError.camera}</p>}
          </div>
        )}
      </div>

      <div className="flex flex-none items-center justify-center gap-3 pb-8">
        <IconButton
          icon={<MicIcon off={!micEnabled} />}
          label={micEnabled ? "Выключить микрофон" : "Включить микрофон"}
          variant="inverse"
          onClick={toggleMic}
          className="h-13 w-13 bg-white/10"
        />
        {call.video && (
          <IconButton
            icon={<CameraIcon off={!cameraEnabled} />}
            label={cameraEnabled ? "Выключить камеру" : "Включить камеру"}
            variant="inverse"
            onClick={toggleCamera}
            className="h-13 w-13 bg-white/10"
          />
        )}
        {call.video && canFlipCamera && (
          <IconButton
            icon={<FlipCameraIcon />}
            label="Сменить камеру"
            variant="inverse"
            onClick={flipCamera}
            className="h-13 w-13 bg-white/10"
          />
        )}
        <IconButton
          icon={<HangupIcon />}
          label="Завершить звонок"
          onClick={hangup}
          className="h-13 w-13 bg-danger text-white"
        />
      </div>
    </div>
  );
}

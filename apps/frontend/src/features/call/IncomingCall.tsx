import { useEffect } from "react";

import {
  playRingtone,
  stopVibration,
  useCallActions,
  useCallStore,
  vibrateRing,
} from "../../entities/call";
import { usePushSubscription } from "../../entities/notification";
import { isNativeApp } from "../../shared/native";
import { Avatar } from "../../shared/ui/avatar";
import { HangupIcon, PhoneIcon, VideoCameraIcon } from "../../shared/ui/call-icons";
import { IconButton } from "../../shared/ui/icon-button";

import { useCallPeer } from "./use-call-peer";

const VIBRATE_REPEAT_MS = 2000;

/**
 * Incoming-call overlay (calls plan §Фаза 3) — driven entirely by
 * `entities/call`'s `useCallStore`, renders nothing outside `phase ===
 * "incoming"`. Plays the ringtone/vibration for as long as it's showing;
 * both stop the moment the phase changes (answered here, or answered/
 * declined/cancelled from elsewhere — `call:updated` moves the phase out of
 * "incoming" either way, see `use-call-realtime.ts`).
 *
 * In the Android app with the page hidden (backgrounded/screen off) and native
 * push active, the native calling screen (T-080) rings instead — starting the
 * JS ringtone too would double it up. Otherwise (visible, a plain browser tab,
 * or native push not registered/enabled) JS rings, since nobody else would.
 */
export function IncomingCall() {
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const setLocalVideoIntent = useCallStore((state) => state.setLocalVideoIntent);
  const { accept, decline } = useCallActions();
  // In the app, "subscribed" = Android notification permission granted + FCM device registered.
  const nativePushActive = usePushSubscription().status === "subscribed";
  const incomingCall = phase === "incoming" ? call : null;
  const peer = useCallPeer(incomingCall?.chatId ?? null, incomingCall);

  useEffect(() => {
    if (phase !== "incoming") return;
    // Native already rings for this call when the app isn't on screen (T-085) — only
    // JS's own ringtone/vibration would double it up. But only if native push is really
    // live (permission granted + device registered): otherwise nobody else would ring.
    if (nativePushActive && isNativeApp() && document.visibilityState === "hidden") return;
    const stopTone = playRingtone();
    vibrateRing();
    const vibrateTimer = setInterval(vibrateRing, VIBRATE_REPEAT_MS);
    return () => {
      stopTone();
      clearInterval(vibrateTimer);
      stopVibration();
    };
    // Re-arm for each distinct incoming call, not just each phase flip (and if the push
    // status settles while ringing: "pending" → "subscribed" hands the ringing to native).
  }, [phase, call?.id, nativePushActive]);

  if (phase !== "incoming" || !call) return null;

  const answer = (withVideo: boolean): void => {
    setLocalVideoIntent(withVideo);
    accept(call.id);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Входящий звонок"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-6 sm:items-center"
    >
      <div className="flex w-full max-w-90 flex-col items-center gap-6 rounded-3xl border border-line bg-bg2 p-7 text-center shadow-glow">
        <Avatar name={peer?.displayName ?? "Абонент"} src={peer?.avatarUrl} size={92} />
        <div className="flex flex-col gap-1.5">
          <span className="text-lg font-medium">{peer?.displayName ?? "Абонент"}</span>
          <span className="font-mono text-xs text-mute">
            {call.video ? "Видеозвонок" : "Аудиозвонок"}
          </span>
        </div>
        <div className="flex items-center justify-center gap-5">
          <IconButton
            icon={<HangupIcon size={22} />}
            label="Отклонить"
            onClick={() => {
              decline(call.id);
            }}
            className="h-14 w-14 bg-danger/15 text-danger"
          />
          <IconButton
            icon={<PhoneIcon size={22} />}
            label="Ответить аудио"
            variant="accent"
            onClick={() => {
              answer(false);
            }}
            className="h-14 w-14"
          />
          {call.video && (
            <IconButton
              icon={<VideoCameraIcon size={22} />}
              label="Ответить видео"
              variant="accent"
              onClick={() => {
                answer(true);
              }}
              className="h-14 w-14"
            />
          )}
        </div>
      </div>
    </div>
  );
}

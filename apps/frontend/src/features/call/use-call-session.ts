import {
  ConnectionQuality,
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useEffect, useRef, useState } from "react";

import {
  buildRoomOptions,
  resolveLivekitUrl,
  useCallActions,
  useCallStore,
} from "../../entities/call";

/** A `phase: "connecting"` that never reaches `Connected`+remote-joined
 * within this long gets ended locally — a hung SFU connection or a callee
 * who accepted but never actually got media flowing shouldn't leave the
 * caller staring at "Соединение…" forever. */
const CONNECT_TIMEOUT_MS = 15_000;

/** A `phase: "reconnecting"` (our link dropped, or the peer left the room) that lasts this long
 * ends the call with a clear reason instead of leaving a dead "active" call on screen. */
const RECONNECT_TIMEOUT_MS = 30_000;

export interface CallMediaError {
  camera: string | null;
  microphone: string | null;
}

/** Structural, not the SDK's exact publication class — every handler below
 * only reads `kind`/`track`, which both `Local`/`RemoteTrackPublication`
 * genuinely have, so this stays correct regardless of which concrete class
 * `livekit-client` hands back. */
interface TrackPublicationLike {
  kind: Track.Kind;
  track?: Track;
}

export interface CallSessionHandle {
  connectionState: ConnectionState;
  quality: ConnectionQuality;
  remoteSpeaking: boolean;
  localVideoTrack: Track | null;
  remoteVideoTrack: Track | null;
  remoteAudioTrack: Track | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  mediaError: CallMediaError;
  canFlipCamera: boolean;
  toggleMic: () => void;
  /** Idempotent: sets the microphone to `enabled`, whatever it is now. Requests run one after
   * another, so the last call wins even while an earlier one is still in flight. Never rejects —
   * a failure shows up as `mediaError.microphone` and `micEnabled` keeps the real state. */
  setMic: (enabled: boolean) => Promise<void>;
  toggleCamera: () => void;
  flipCamera: () => void;
}

/**
 * Owns the LiveKit `Room` for the current call (calls plan §Фаза 3/4) —
 * called exactly once, from `CallRoot` (the signed-in host
 * at the router root, `routes/-signed-in-host.tsx`), so minimizing/restoring the call UI (which just toggles
 * what `CallRoot` renders) and navigating between routes never tear this down. Connects
 * whenever `call-store` has `livekitUrl`/`token` (the caller gets these
 * right from `start()`, even while still ringing — "pre-joining while
 * ringing" — the callee gets them from `accept()`) and disconnects once
 * they're cleared (`reset()`, which only runs once `phase` is back to
 * `"idle"` after `CallEnded`'s summary screen — never on minimize).
 *
 * Tracks whether the remote participant's media has actually arrived (the
 * first `TrackSubscribed` for their audio/video) and feeds that back into
 * `call-store` as `remoteJoined` — `phase` only becomes `"active"` once
 * that's true, never from `ParticipantConnected`/reaching LiveKit's
 * `Connected` state alone: both only mean "I reached the SFU's signaling
 * layer", not "media is actually flowing" (the fix for "the call just turns
 * on with dead air" — see call-store.ts). livekit-client has no
 * `ParticipantActive`-style event for this, so the first subscribed track
 * is the earliest real proof.
 *
 * Uses the bare `Room`/`Track` classes rather than `@livekit/components-react`'s
 * hooks for track state: those hooks' exact `TrackReference` shape isn't
 * pinned down anywhere in this repo (no prior usage to match), while
 * `Room`'s events and `Track.attach()/.detach()` have been stable, documented
 * SDK surface since v1 — see the calls plan's allowance for "bare Room/
 * RemoteParticipant classes... if unavoidable".
 */
export function useCallSession(): CallSessionHandle {
  const call = useCallStore((state) => state.call);
  const livekitUrl = useCallStore((state) => state.livekitUrl);
  const token = useCallStore((state) => state.token);
  const phase = useCallStore((state) => state.phase);
  const setRemoteJoined = useCallStore((state) => state.setRemoteJoined);
  const setReconnecting = useCallStore((state) => state.setReconnecting);
  const setReconnected = useCallStore((state) => state.setReconnected);
  const endLocally = useCallStore((state) => state.endLocally);
  const { hangupMutate } = useCallActions();

  // `call`/`phase` change constantly over a call's lifetime (status pushes,
  // phase transitions) but must never retrigger the connect effect below —
  // only a genuinely new `livekitUrl`/`token` pair should reconnect. Refs
  // give the event handlers a live read without becoming effect deps.
  const callRef = useRef(call);
  callRef.current = call;
  const hangupMutateRef = useRef(hangupMutate);
  hangupMutateRef.current = hangupMutate;

  const roomRef = useRef<Room | null>(null);
  const micQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Connecting,
  );
  const [quality, setQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [remoteIdentity, setRemoteIdentity] = useState<string | null>(null);
  const [activeSpeakers, setActiveSpeakers] = useState<ReadonlySet<string>>(new Set());
  const [localVideoTrack, setLocalVideoTrack] = useState<Track | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<Track | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<Track | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [mediaError, setMediaError] = useState<CallMediaError>({ camera: null, microphone: null });
  const [canFlipCamera, setCanFlipCamera] = useState(false);
  const [videoDeviceIndex, setVideoDeviceIndex] = useState(0);

  useEffect(() => {
    if (!livekitUrl || !token) return;

    const cancelled = { current: false };
    const nextRoom = new Room(buildRoomOptions());
    roomRef.current = nextRoom;

    const startWithVideo = useCallStore.getState().localVideoIntent;
    const wantsVideo = (useCallStore.getState().call?.video ?? false) && startWithVideo;
    setCameraEnabled(wantsVideo);

    const handleParticipantDisconnected = (): void => {
      setRemoteIdentity(null);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);
      if (callRef.current?.status === "active") setReconnecting();
    };
    const handleTrackSubscribed = (
      track: Track,
      _publication: TrackPublicationLike,
      participant: { identity: string },
    ): void => {
      // The first real media from the other side — the proof the call is
      // actually connected both ways, not just that both sides reached the
      // SFU's signaling layer (`ParticipantConnected` fires before either
      // side has published anything, which is too early: see call-store.ts).
      setRemoteJoined();
      setRemoteIdentity(participant.identity);
      if (track.kind === Track.Kind.Video) setRemoteVideoTrack(track);
      else if (track.kind === Track.Kind.Audio) setRemoteAudioTrack(track);
    };
    const handleTrackUnsubscribed = (track: Track): void => {
      if (track.kind === Track.Kind.Video) {
        setRemoteVideoTrack((current) => (current === track ? null : current));
      } else if (track.kind === Track.Kind.Audio) {
        setRemoteAudioTrack((current) => (current === track ? null : current));
      }
    };
    // The source of truth for "is my camera/mic actually on": livekit-client's
    // `set*Enabled()` can reject ("publishing rejected as engine not connected
    // within timeout" on a weak mobile link) while the publish itself is not
    // cancelled and still completes once the engine reconnects — so a late
    // publish here must undo the error/disabled state the rejection left.
    const handleLocalTrackPublished = (publication: TrackPublicationLike): void => {
      if (publication.kind === Track.Kind.Video && publication.track) {
        setLocalVideoTrack(publication.track);
        setCameraEnabled(true);
        setMediaError((prev) => ({ ...prev, camera: null }));
      } else if (publication.kind === Track.Kind.Audio) {
        setMicEnabled(true);
        setMediaError((prev) => ({ ...prev, microphone: null }));
      }
    };
    const handleLocalTrackUnpublished = (publication: TrackPublicationLike): void => {
      if (publication.kind === Track.Kind.Video) setLocalVideoTrack(null);
    };
    const handleConnectionStateChanged = (state: ConnectionState): void => {
      setConnectionState(state);
      if (state === ConnectionState.Reconnecting) setReconnecting();
    };
    const handleReconnected = (): void => {
      // Only if the peer is still in the room: otherwise `TrackSubscribed` brings the call back.
      if (nextRoom.remoteParticipants.size > 0) setReconnected();
    };
    // Fires for our own `disconnect()` too, but cleanup detaches this handler first — so reaching
    // it mid-call for another reason means the room dropped us (e.g. `DUPLICATE_IDENTITY`, a revoked token).
    const handleDisconnected = (reason?: DisconnectReason): void => {
      if (cancelled.current) return;
      // The server deletes the room when the call ends, which can beat `call:updated`: that is
      // the normal end (the final status brings the right reason), not a drop.
      if (
        reason === DisconnectReason.ROOM_DELETED ||
        reason === DisconnectReason.CLIENT_INITIATED
      ) {
        return;
      }
      const { phase: currentPhase } = useCallStore.getState();
      if (currentPhase === "idle" || currentPhase === "incoming" || currentPhase === "ended") {
        return;
      }
      endLocally("failed");
      const callId = callRef.current?.id;
      if (callId) hangupMutateRef.current(callId);
    };
    const handleConnectionQualityChanged = (nextQuality: ConnectionQuality): void => {
      setQuality(nextQuality);
    };
    const handleActiveSpeakersChanged = (speakers: { identity: string }[]): void => {
      setActiveSpeakers(new Set(speakers.map((speaker) => speaker.identity)));
    };

    nextRoom.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    nextRoom.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    nextRoom.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    nextRoom.on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
    nextRoom.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
    nextRoom.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    nextRoom.on(RoomEvent.Reconnected, handleReconnected);
    nextRoom.on(RoomEvent.Disconnected, handleDisconnected);
    nextRoom.on(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged);
    nextRoom.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);

    void (async () => {
      try {
        await nextRoom.connect(resolveLivekitUrl(livekitUrl), token);
        if (cancelled.current) return;
        // TODO(calls plan §Фаза 5 doc T-068): a browser autoplay policy can
        // block remote audio here when this join wasn't itself triggered by
        // a user gesture (e.g. auto-accepting from a notification-click
        // deep link) — LiveKit's fix is `room.startAudio()` from a
        // subsequent click, which needs a "Включить звук" affordance
        // `CallScreen` doesn't have yet.

        try {
          await nextRoom.localParticipant.setMicrophoneEnabled(true);
        } catch (error) {
          if (roomRef.current !== nextRoom) return;
          setMediaError((prev) => ({ ...prev, microphone: (error as Error).message }));
          setMicEnabled(false);
        }

        if (wantsVideo) {
          try {
            await nextRoom.localParticipant.setCameraEnabled(true);
          } catch (error) {
            if (roomRef.current !== nextRoom) return;
            setMediaError((prev) => ({ ...prev, camera: (error as Error).message }));
            setCameraEnabled(false);
          }
        }

        const firstRemote = [...nextRoom.remoteParticipants.values()][0];
        if (firstRemote) setRemoteIdentity(firstRemote.identity);
      } catch {
        // `connect()` itself failing (bad/expired token, no network at all)
        // — the connect timeout below and the hangup control still give the
        // user a way out; there's nothing more specific to show here.
      }
    })();

    if ("mediaDevices" in navigator) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (!cancelled.current) {
            setCanFlipCamera(devices.filter((d) => d.kind === "videoinput").length > 1);
          }
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled.current = true;
      nextRoom.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      nextRoom.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      nextRoom.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      nextRoom.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
      nextRoom.off(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
      nextRoom.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
      nextRoom.off(RoomEvent.Reconnected, handleReconnected);
      nextRoom.off(RoomEvent.Disconnected, handleDisconnected);
      nextRoom.off(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged);
      nextRoom.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
      void nextRoom.disconnect();
      roomRef.current = null;
      setRemoteIdentity(null);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);
      setLocalVideoTrack(null);
    };
    // Only a genuinely new join (reconnect) should tear down and rebuild the
    // room — `localVideoIntent`/`call.video` are read fresh at connect time
    // above instead of being deps, same reasoning as the previous version of
    // this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livekitUrl, token]);

  // A stuck "connecting" phase (SFU unreachable, callee accepted but media
  // never actually came up) ends the call locally rather than hanging
  // forever — see `CONNECT_TIMEOUT_MS`.
  useEffect(() => {
    if (phase !== "connecting") return;
    const timer = setTimeout(() => {
      endLocally("connect_failed");
      const callId = callRef.current?.id;
      if (callId) hangupMutateRef.current(callId);
    }, CONNECT_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [phase, endLocally]);

  useEffect(() => {
    if (phase !== "reconnecting") return;
    const timer = setTimeout(() => {
      endLocally("connection_lost");
      const callId = callRef.current?.id;
      if (callId) hangupMutateRef.current(callId);
    }, RECONNECT_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [phase, endLocally]);

  const setMic = (enabled: boolean): Promise<void> => {
    const run = micQueueRef.current
      .then(async () => {
        const current = roomRef.current;
        if (!current) return;
        await current.localParticipant.setMicrophoneEnabled(enabled);
        setMicEnabled(enabled);
        setMediaError((prev) => ({ ...prev, microphone: null }));
      })
      .catch((error: unknown) => {
        setMediaError((prev) => ({ ...prev, microphone: (error as Error).message }));
      });
    micQueueRef.current = run;
    return run;
  };

  const toggleMic = (): void => {
    void setMic(!micEnabled);
  };

  const toggleCamera = (): void => {
    const current = roomRef.current;
    if (!current) return;
    const next = !cameraEnabled;
    current.localParticipant
      .setCameraEnabled(next)
      .then(() => {
        setCameraEnabled(next);
        setMediaError((prev) => ({ ...prev, camera: null }));
      })
      .catch((error: unknown) => {
        setMediaError((prev) => ({ ...prev, camera: (error as Error).message }));
      });
  };

  const flipCamera = (): void => {
    const current = roomRef.current;
    if (!current || !("mediaDevices" in navigator)) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        if (videoInputs.length < 2) return Promise.resolve();
        const nextIndex = (videoDeviceIndex + 1) % videoInputs.length;
        const nextDevice = videoInputs[nextIndex];
        if (!nextDevice) return Promise.resolve();
        return current.switchActiveDevice("videoinput", nextDevice.deviceId).then(() => {
          setVideoDeviceIndex(nextIndex);
        });
      })
      .catch(() => undefined);
  };

  return {
    connectionState,
    quality,
    remoteSpeaking: remoteIdentity !== null && activeSpeakers.has(remoteIdentity),
    localVideoTrack,
    remoteVideoTrack,
    remoteAudioTrack,
    micEnabled,
    cameraEnabled,
    mediaError,
    canFlipCamera,
    toggleMic,
    setMic,
    toggleCamera,
    flipCamera,
  };
}

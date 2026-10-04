import { CallEnded } from "./CallEnded";
import { CallScreen } from "./CallScreen";
import { IncomingCall } from "./IncomingCall";
import { useCallSession } from "./use-call-session";
import { useNativeCallBridge } from "./use-native-call-bridge";
import { useTrackAttach } from "./use-track-attach";

/**
 * The one call mount (`routes/app.tsx`, replacing the previous three
 * separate `<IncomingCall/> <CallScreen/> <CallMiniBar/>` mounts) — owns the
 * LiveKit session (`useCallSession`) for the lifetime of the app shell, so
 * minimizing/restoring the call UI (which only changes which of the
 * self-gating components below renders anything) never tears the `Room`
 * down and reconnects it. Every child here is self-gating on `call-store`'s
 * `phase`/`minimized`, so it's safe to always render all of them.
 *
 * The remote `<audio>` lives here rather than in `CallScreen` for the same
 * reason: `CallScreen` renders nothing while minimized, which would detach
 * the track and silence the peer.
 */
export function CallRoot() {
  const session = useCallSession();
  useNativeCallBridge(session);
  const remoteAudioRef = useTrackAttach(session.remoteAudioTrack);

  return (
    <>
      {session.remoteAudioTrack && <audio ref={remoteAudioRef} autoPlay />}
      <IncomingCall />
      <CallEnded />
      <CallScreen session={session} />
    </>
  );
}

import { useEffect } from "react";

import { playRingback, useCallStore } from "../../entities/call";

import { CallEnded } from "./CallEnded";
import { CallScreen } from "./CallScreen";
import { IncomingCall } from "./IncomingCall";
import { useCallSession } from "./use-call-session";
import { useNativeCallBridge } from "./use-native-call-bridge";
import { useTrackAttach } from "./use-track-attach";

/**
 * The one call mount (the signed-in host at the router root,
 * `routes/-signed-in-host.tsx`) — owns the LiveKit session (`useCallSession`)
 * for as long as the user is signed in, so minimizing/restoring the call UI
 * or navigating off `/app` never tears the `Room` down and reconnects it. Every child here is self-gating on `call-store`'s
 * `phase`/`minimized`, so it's safe to always render all of them.
 *
 * The remote `<audio>` lives here rather than in `CallScreen` for the same
 * reason: `CallScreen` renders nothing while minimized, which would detach
 * the track and silence the peer.
 */
export function CallRoot() {
  const session = useCallSession();
  useNativeCallBridge(session);
  // On hold (a GSM call took the line) the peer must not be heard — the track stays attached.
  const held = useCallStore((state) => state.held);
  const remoteAudioRef = useTrackAttach(session.remoteAudioTrack);
  // Here rather than in the outgoing screen: the tone must outlive minimizing it to the mini-bar.
  const dialing = useCallStore((state) => state.phase === "outgoing");
  useEffect(() => {
    if (!dialing) return;
    return playRingback();
  }, [dialing]);

  return (
    <>
      {session.remoteAudioTrack && <audio ref={remoteAudioRef} autoPlay muted={held} />}
      <IncomingCall />
      <CallEnded />
      <CallScreen session={session} />
    </>
  );
}

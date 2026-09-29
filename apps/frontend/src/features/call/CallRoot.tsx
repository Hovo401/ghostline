import { CallEnded } from "./CallEnded";
import { CallMiniBar } from "./CallMiniBar";
import { CallScreen } from "./CallScreen";
import { IncomingCall } from "./IncomingCall";
import { useCallSession } from "./use-call-session";

/**
 * The one call mount (`routes/app.tsx`, replacing the previous three
 * separate `<IncomingCall/> <CallScreen/> <CallMiniBar/>` mounts) — owns the
 * LiveKit session (`useCallSession`) for the lifetime of the app shell, so
 * minimizing/restoring the call UI (which only changes which of the
 * self-gating components below renders anything) never tears the `Room`
 * down and reconnects it. Every child here is self-gating on `call-store`'s
 * `phase`/`minimized`, so it's safe to always render all of them.
 */
export function CallRoot() {
  const session = useCallSession();

  return (
    <>
      <IncomingCall />
      <CallEnded />
      <CallScreen session={session} />
      <CallMiniBar />
    </>
  );
}

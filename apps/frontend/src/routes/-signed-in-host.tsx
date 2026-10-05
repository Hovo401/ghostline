import { CallRoot } from "../features/call";
import { useMessengerSession } from "../features/chat";
import { Toaster } from "../shared/ui/toast";

/** Everything that must live as long as the user is signed in, on whichever route they are:
 * the socket and its realtime subscriptions (`useMessengerSession`), the call mount (a call
 * survives navigating to `/`, T-093) and the toast stack. Rendered by `__root.tsx`. */
export function SignedInHost() {
  useMessengerSession();

  return (
    <>
      <CallRoot />
      <Toaster />
    </>
  );
}

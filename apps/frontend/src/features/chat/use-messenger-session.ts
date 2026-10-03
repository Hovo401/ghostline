import { useActiveCallQuery, useCallRealtime } from "../../entities/call";
import { useChatRealtime, useTypingRealtime } from "../../entities/chat";
import { useMessageRealtime } from "../../entities/message";
import { useMessageNotificationFallback, usePushSubscription } from "../../entities/notification";
import { useMeRealtime } from "../../entities/session";
import { useGhostlineSocket } from "../../shared/api/socket-client";

import { useNotificationDeepLink } from "./use-notification-deep-link";
import { useServiceWorkerMessages } from "./use-service-worker-messages";

/**
 * Everything the signed-in messenger keeps alive for as long as `/app` is
 * mounted, whichever child screen (chats, settings) is showing: the socket
 * and its realtime subscriptions — `call:updated` included, so a call that
 * ends while settings is open still ends here — the active-call resync,
 * push/notification wiring and the notification-click handoffs. Mounted once
 * by the `/app` layout; living in `Chat` instead used to drop the socket on
 * every trip to settings.
 */
export function useMessengerSession(): void {
  useGhostlineSocket();
  useChatRealtime();
  useMessageRealtime();
  useTypingRealtime();
  useMeRealtime();
  useCallRealtime();
  useActiveCallQuery();
  const { status: pushStatus } = usePushSubscription();
  useMessageNotificationFallback(pushStatus !== "subscribed");
  useServiceWorkerMessages();
  useNotificationDeepLink();
}

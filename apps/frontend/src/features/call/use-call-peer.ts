import type { Call } from "../../entities/call";
import { useChats } from "../../entities/chat";
import { useCurrentUserId } from "../../entities/user";

/** Shown while the other side's name cannot be resolved. */
export const FALLBACK_PEER_NAME = "Абонент";

export interface CallPeer {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Resolves "the other participant" for a call, reusing the chat list's
 * already-cached peer info (`ChatListItem.peer`) instead of a second
 * user-lookup request. Takes `chatId` rather than a `Call` so the outgoing
 * call screen can resolve a name during the "draft" phase too, before any
 * `Call` object exists (`call-store.ts`'s `draft`) — `call` is only used as
 * a fallback for computing "the other side" once a chat isn't in cache yet
 * (e.g. a push notification's "Ответить" opened the app before `useChats`
 * has settled).
 */
export function useCallPeer(chatId: string | null, call: Call | null = null): CallPeer | null {
  const { data: chats } = useChats();
  const currentUserId = useCurrentUserId();

  if (!chatId) return null;
  const chat = chats?.find((c) => c.id === chatId);
  if (chat?.peer)
    return {
      id: chat.peer.id,
      displayName: chat.peer.displayName,
      avatarUrl: chat.peer.avatarUrl ?? undefined,
    };
  if (!call) return null;
  const peerId = call.callerId === currentUserId ? call.calleeId : call.callerId;
  return { id: peerId, displayName: FALLBACK_PEER_NAME };
}

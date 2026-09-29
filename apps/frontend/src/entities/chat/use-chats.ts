import { ChatListItemSchema } from "@ghostline/contracts";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { CHATS_QUERY_KEY } from "../../shared/api/query-keys";

import type { ChatListItem } from "./chat.types";

export { CHATS_QUERY_KEY };

/** `zod` isn't a direct dependency here (only `@ghostline/contracts` is) —
 * validating element-by-element with the schema it already exports avoids
 * pulling `z.array` in just for this. */
function parseChatList(data: unknown): ChatListItem[] {
  if (!Array.isArray(data)) throw new Error("expected an array of chats");
  return data.map((item) => ChatListItemSchema.parse(item));
}

/** Chat list (FR-LIST-01–05) — `GET /chats`, kept current by chat:updated/
 * chat:removed over the socket (see use-chat-realtime.ts). */
export function useChats() {
  return useQuery<ChatListItem[]>({
    queryKey: CHATS_QUERY_KEY,
    queryFn: async () => {
      const data: unknown = await apiFetch("/chats");
      return parseChatList(data);
    },
  });
}

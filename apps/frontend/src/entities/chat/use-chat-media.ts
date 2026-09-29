import { ChatMediaResponseSchema, type Attachment } from "@ghostline/contracts";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { chatMediaQueryKey } from "../../shared/api/query-keys";

/**
 * Profile panel's "МЕДИА" grid (DESIGN-BRIEF.md §7.2) — `GET /chats/:id/media`,
 * every attachment sent in the chat (image/file/voice/video), newest first.
 * `enabled` lets the caller skip the request while the panel is closed —
 * ProfilePanel is always mounted (it animates open/closed), it just
 * shouldn't fetch until it's actually visible.
 */
export function useChatMedia(chatId: string, enabled: boolean) {
  return useQuery<Attachment[]>({
    queryKey: chatMediaQueryKey(chatId),
    queryFn: async () => {
      const data: unknown = await apiFetch(`/chats/${chatId}/media`);
      return ChatMediaResponseSchema.parse(data);
    },
    enabled,
  });
}

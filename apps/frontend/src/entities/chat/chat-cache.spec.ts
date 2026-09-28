import type { ChatListItem, UserPublicProfile } from "@ghostline/contracts";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { CHATS_QUERY_KEY } from "../../shared/api/query-keys";

import { patchPeerProfile } from "./chat-cache";

function makeChat(overrides: Partial<ChatListItem> = {}): ChatListItem {
  return {
    id: "chat-1",
    type: "DIRECT",
    peer: {
      id: "peer-1",
      username: "oleg",
      displayName: "Олег",
      avatarKey: null,
      online: true,
    },
    lastMessage: null,
    unreadCount: 0,
    muted: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserPublicProfile> = {}): UserPublicProfile {
  return {
    id: "peer-1",
    username: "oleg_new",
    displayName: "Олег Новый",
    avatarKey: "attachments/1/avatar.jpg",
    avatarUrl: "http://example.test/avatar.jpg",
    bio: null,
    online: true,
    lastSeenAt: null,
    ...overrides,
  };
}

describe("patchPeerProfile", () => {
  it("patches the matching peer's username/displayName/avatarKey", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(CHATS_QUERY_KEY, [makeChat()]);

    patchPeerProfile(queryClient, makeProfile());

    const chats = queryClient.getQueryData<ChatListItem[]>(CHATS_QUERY_KEY);
    expect(chats?.[0]?.peer).toMatchObject({
      id: "peer-1",
      username: "oleg_new",
      displayName: "Олег Новый",
      avatarKey: "attachments/1/avatar.jpg",
    });
  });

  it("leaves chats whose peer doesn't match untouched", () => {
    const queryClient = new QueryClient();
    const other = makeChat({
      id: "chat-2",
      peer: { id: "someone-else", username: "d", displayName: "D", avatarKey: null, online: false },
    });
    queryClient.setQueryData(CHATS_QUERY_KEY, [other]);

    patchPeerProfile(queryClient, makeProfile());

    expect(queryClient.getQueryData<ChatListItem[]>(CHATS_QUERY_KEY)).toEqual([other]);
  });

  it("is a no-op on Saved Messages chats (no peer)", () => {
    const queryClient = new QueryClient();
    const saved = makeChat({ type: "SAVED", peer: null });
    queryClient.setQueryData(CHATS_QUERY_KEY, [saved]);

    patchPeerProfile(queryClient, makeProfile());

    expect(queryClient.getQueryData<ChatListItem[]>(CHATS_QUERY_KEY)).toEqual([saved]);
  });
});

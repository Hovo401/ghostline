import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";

import { useChatMedia } from "./use-chat-media";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

const ATTACHMENT = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "k",
  mime: "image/png",
  size: 1000,
  width: 800,
  height: 600,
  name: "photo.png",
  url: "https://s3.example/photo.png",
};

function renderWithClient<T>(callback: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(callback, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("useChatMedia", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("fetches and parses the chat's media list", async () => {
    vi.mocked(apiFetch).mockResolvedValue([ATTACHMENT]);

    const { result } = renderWithClient(() => useChatMedia("chat-1", true));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiFetch).toHaveBeenCalledWith("/chats/chat-1/media");
    expect(result.current.data).toEqual([ATTACHMENT]);
  });

  it("does not fetch while disabled", () => {
    renderWithClient(() => useChatMedia("chat-1", false));

    expect(apiFetch).not.toHaveBeenCalled();
  });
});

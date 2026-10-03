import { beforeEach, describe, expect, it } from "vitest";

import { useChatUiStore } from "./chat-ui-store";

function reset(): void {
  useChatUiStore.setState({
    newChatModalOpen: false,
    listFilter: "",
    drafts: {},
    editing: {},
  });
}

describe("useChatUiStore", () => {
  beforeEach(reset);

  it("keeps drafts per chat independently", () => {
    useChatUiStore.getState().setDraft("chat-1", "Привет");
    useChatUiStore.getState().setDraft("chat-2", "Как дела?");

    expect(useChatUiStore.getState().drafts).toEqual({
      "chat-1": "Привет",
      "chat-2": "Как дела?",
    });

    useChatUiStore.getState().setDraft("chat-1", "");
    expect(useChatUiStore.getState().drafts["chat-1"]).toBe("");
    expect(useChatUiStore.getState().drafts["chat-2"]).toBe("Как дела?");
  });

  it("toggles the new-chat modal and list filter independently of chat selection", () => {
    useChatUiStore.getState().openNewChatModal();
    useChatUiStore.getState().setListFilter("олег");

    expect(useChatUiStore.getState().newChatModalOpen).toBe(true);
    expect(useChatUiStore.getState().listFilter).toBe("олег");

    useChatUiStore.getState().closeNewChatModal();
    expect(useChatUiStore.getState().newChatModalOpen).toBe(false);
    expect(useChatUiStore.getState().listFilter).toBe("олег");
  });

  it("editing a message leaves the chat's draft alone and ends cleanly", () => {
    const store = useChatUiStore.getState;
    store().setDraft("chat-1", "черновик");

    store().startEditing("chat-1", "m1", "helo");
    store().setEditingText("chat-1", "hello");

    expect(store().editing["chat-1"]).toEqual({ messageId: "m1", original: "helo", text: "hello" });
    expect(store().drafts["chat-1"]).toBe("черновик");

    store().cancelEditing("chat-1");

    expect(store().editing["chat-1"]).toBeUndefined();
    expect(store().drafts["chat-1"]).toBe("черновик");
  });
});

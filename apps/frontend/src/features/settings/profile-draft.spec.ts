import type { MeResponse } from "@ghostline/contracts";
import { describe, expect, it } from "vitest";

import { diffProfileDraft, draftFromMe, isProfileDraftDirty } from "./profile-draft";

const ME: MeResponse = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "alex",
  displayName: "Алекс",
  avatarKey: null,
  avatarUrl: null,
  bio: "Пишу код",
  online: true,
  lastSeenAt: null,
  showOnline: true,
  readReceipts: true,
};

describe("draftFromMe", () => {
  it("seeds an editable draft with no pending avatar", () => {
    expect(draftFromMe(ME)).toEqual({
      displayName: "Алекс",
      username: "alex",
      bio: "Пишу код",
      showOnline: true,
      readReceipts: true,
      avatarAttachmentId: null,
      avatarPreviewUrl: null,
    });
  });

  it("defaults a null bio to an empty string for the textarea", () => {
    expect(draftFromMe({ ...ME, bio: null }).bio).toBe("");
  });
});

describe("isProfileDraftDirty", () => {
  it("is false for an unedited draft", () => {
    expect(isProfileDraftDirty(draftFromMe(ME), ME)).toBe(false);
  });

  it("is true once a field changes", () => {
    const draft = { ...draftFromMe(ME), displayName: "Новое имя" };
    expect(isProfileDraftDirty(draft, ME)).toBe(true);
  });

  it("is true once a new avatar is pending, even with no other change", () => {
    const draft = { ...draftFromMe(ME), avatarAttachmentId: "attachment-1" };
    expect(isProfileDraftDirty(draft, ME)).toBe(true);
  });
});

describe("diffProfileDraft", () => {
  it("is empty for an unedited draft", () => {
    expect(diffProfileDraft(draftFromMe(ME), ME)).toEqual({});
  });

  it("only includes fields that changed", () => {
    const draft = { ...draftFromMe(ME), displayName: "Новое имя", readReceipts: false };
    expect(diffProfileDraft(draft, ME)).toEqual({
      displayName: "Новое имя",
      readReceipts: false,
    });
  });

  it("sends bio as null when cleared", () => {
    const draft = { ...draftFromMe(ME), bio: "" };
    expect(diffProfileDraft(draft, ME)).toEqual({ bio: null });
  });

  it("includes avatarAttachmentId only when a new photo is pending", () => {
    const draft = { ...draftFromMe(ME), avatarAttachmentId: "attachment-1" };
    expect(diffProfileDraft(draft, ME)).toEqual({ avatarAttachmentId: "attachment-1" });
  });
});

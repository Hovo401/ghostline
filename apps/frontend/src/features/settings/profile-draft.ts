import type { MeResponse, UpdateMeRequest } from "@ghostline/contracts";

/**
 * Local edit buffer for the "Профиль" tab (FR-USER-01) — `ProfileTab` seeds
 * this from `useMe()`'s data once, then edits stay here (not written back
 * to the `["me"]` cache) until "Сохранить" round-trips through `PATCH /me`.
 * `avatarAttachmentId`/`avatarPreviewUrl` track a freshly uploaded photo
 * that hasn't been saved yet — `me.avatarUrl` has no local equivalent to
 * seed from, a new upload always starts these both `null`.
 */
export interface ProfileDraft {
  displayName: string;
  username: string;
  bio: string;
  showOnline: boolean;
  readReceipts: boolean;
  avatarAttachmentId: string | null;
  avatarPreviewUrl: string | null;
}

export function draftFromMe(me: MeResponse): ProfileDraft {
  return {
    displayName: me.displayName,
    username: me.username,
    bio: me.bio ?? "",
    showOnline: me.showOnline,
    readReceipts: me.readReceipts,
    avatarAttachmentId: null,
    avatarPreviewUrl: null,
  };
}

/** "Сохранить" only lights up once something actually changed — DESIGN-
 * BRIEF §7.3. */
export function isProfileDraftDirty(draft: ProfileDraft, me: MeResponse): boolean {
  return (
    draft.displayName !== me.displayName ||
    draft.username !== me.username ||
    draft.bio !== (me.bio ?? "") ||
    draft.showOnline !== me.showOnline ||
    draft.readReceipts !== me.readReceipts ||
    draft.avatarAttachmentId !== null
  );
}

/**
 * Only the fields that actually changed — `UpdateMeRequestSchema`'s fields
 * are all optional for exactly this reason: sending an unchanged
 * `username` back would make the backend re-validate it against itself for
 * no reason (and could false-positive a "taken" conflict on a case
 * variant).
 */
export function diffProfileDraft(draft: ProfileDraft, me: MeResponse): UpdateMeRequest {
  const body: UpdateMeRequest = {};
  if (draft.displayName !== me.displayName) body.displayName = draft.displayName;
  if (draft.username !== me.username) body.username = draft.username;
  if (draft.bio !== (me.bio ?? "")) body.bio = draft.bio.length > 0 ? draft.bio : null;
  if (draft.showOnline !== me.showOnline) body.showOnline = draft.showOnline;
  if (draft.readReceipts !== me.readReceipts) body.readReceipts = draft.readReceipts;
  if (draft.avatarAttachmentId) body.avatarAttachmentId = draft.avatarAttachmentId;
  return body;
}

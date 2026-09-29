/**
 * Shared privacy math for presence (FR-USER-04) and read receipts
 * (FR-USER-08) — both toggles use the exact same "mutual" rule per
 * REQUIREMENTS.md: turning yours off hides your status from the other
 * person *and* hides theirs from you, so a single AND check covers both
 * directions for either toggle.
 */
export function isMutuallyVisible(viewerToggleOn: boolean, targetToggleOn: boolean): boolean {
  return viewerToggleOn && targetToggleOn;
}

export interface PresenceView {
  online: boolean;
  lastSeenAt: string | null;
}

/**
 * What the viewer gets to see of `target`'s presence: hidden entirely
 * (neither online nor a timestamp) when blocked either way or when the
 * showOnline toggle isn't mutually on; otherwise the real state, with
 * `lastSeenAt` only meaningful while offline.
 */
export function computePresenceView(
  viewerShowOnline: boolean,
  target: { showOnline: boolean; lastSeenAt: Date | null },
  isTargetOnline: boolean,
  blocked: boolean,
): PresenceView {
  if (blocked || !isMutuallyVisible(viewerShowOnline, target.showOnline)) {
    return { online: false, lastSeenAt: null };
  }
  return {
    online: isTargetOnline,
    lastSeenAt: isTargetOnline ? null : (target.lastSeenAt?.toISOString() ?? null),
  };
}

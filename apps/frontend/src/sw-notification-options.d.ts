// TypeScript's bundled `lib.webworker.d.ts` `NotificationOptions` lags the
// spec — it's missing `actions`, `renotify` and `vibrate`, all of which
// `sw-notifications.ts` needs (per-call action buttons, one notification per
// chat/call via `tag`+`renotify`, and the incoming-call vibration pattern).
// Declaration merging adds them back rather than widening every call site
// with `as any`.
export {};

declare global {
  interface NotificationAction {
    action: string;
    title: string;
    icon?: string;
  }

  interface NotificationOptions {
    actions?: NotificationAction[];
    renotify?: boolean;
    vibrate?: number | number[];
  }
}

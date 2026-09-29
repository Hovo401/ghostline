import { createFileRoute, redirect } from "@tanstack/react-router";

import { ensureSession } from "../entities/session";
import { CallRoot } from "../features/call";
import { Chat } from "../features/chat";
import { MediaViewer } from "../features/media-viewer";
import { useSessionStore } from "../shared/api/session-store";

/** Messenger shell (REQUIREMENTS.md §4/§5.4-§5.6, DESIGN-BRIEF.md §7.2),
 * plus the fullscreen media viewer (T-033) and the call overlay (calls
 * plan) mounted once here — `routes` can import sibling features,
 * `features/chat` can't import `features/media-viewer`/`features/call`
 * directly (apps/frontend/CLAUDE.md layering). `CallRoot` owns the LiveKit
 * session for as long as the app shell is mounted and renders nothing
 * unless `call-store` says a call applies. */
function AppShell() {
  return (
    <>
      <Chat />
      <MediaViewer />
      <CallRoot />
    </>
  );
}

/** `?chat=`/`?call=&answer=1` — a notification-click deep link `sw.ts`
 * attaches when it opened a fresh tab (calls plan §Фаза 5 doc T-068);
 * `features/chat/use-notification-deep-link.ts` consumes and clears them. */
interface AppSearch {
  chat?: string;
  call?: string;
  answer?: string;
}

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>): AppSearch => ({
    chat: typeof search.chat === "string" ? search.chat : undefined,
    call: typeof search.call === "string" ? search.call : undefined,
    answer: typeof search.answer === "string" ? search.answer : undefined,
  }),
  beforeLoad: async () => {
    await ensureSession();
    if (useSessionStore.getState().status !== "authenticated") {
      // TanStack Router's redirect() is meant to be thrown from `beforeLoad`
      // — it's a plain routing signal, not an Error subclass.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/login" });
    }
  },
  component: AppShell,
});

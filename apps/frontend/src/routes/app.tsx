import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { selectHasActiveUploads, useUploadQueueStore } from "../entities/attachment";
import { ensureSession } from "../entities/session";
import { CallMiniBar, CallRoot } from "../features/call";
import { useMessengerSession } from "../features/chat";
import { MediaViewer } from "../features/media-viewer";
import { useSessionStore } from "../shared/api/session-store";
import { useBeforeUnload } from "../shared/lib/use-before-unload";
import { Toaster } from "../shared/ui/toast";

/** Messenger layout (REQUIREMENTS.md §4/§5.4-§5.6, DESIGN-BRIEF.md §7.2) —
 * stays mounted across its child screens (`/app` chats, `/app/settings`),
 * which is the point: the socket + realtime subscriptions
 * (`useMessengerSession`), the fullscreen media viewer (T-033), the toast
 * stack and the call overlay (calls plan) live here once. `CallRoot` owns
 * the LiveKit session, so a call must outlive any in-app navigation —
 * settings used to be a sibling route, and opening it unmounted `CallRoot`
 * and hung up the call (ADR 0016). `routes` can import sibling features,
 * `features/chat` can't import `features/media-viewer`/`features/call`
 * directly (apps/frontend/CLAUDE.md layering).
 *
 * `useBeforeUnload` is gated on `upload-queue-store` having any active
 * upload (T-032) — closing the tab mid a multi-hundred-MB upload should
 * warn instead of silently losing it.
 */
function AppShell() {
  useMessengerSession();
  const hasActiveUploads = useUploadQueueStore(selectHasActiveUploads);
  useBeforeUnload(hasActiveUploads);

  return (
    <>
      <div className="p-safe flex h-dvh flex-col">
        <CallMiniBar />
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </div>
      <MediaViewer />
      <CallRoot />
      <Toaster />
    </>
  );
}

/** `?chat=` is the open chat (`features/chat/use-chat-navigation.ts`), so
 * it's a real history entry and also the notification-click deep link
 * `sw.ts` opens a fresh tab with. `?call=&answer=1` is a one-shot deep link
 * (calls plan §Фаза 5 doc T-068) that `use-notification-deep-link.ts`
 * consumes and clears. */
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
      throw redirect({ to: "/login", replace: true });
    }
  },
  component: AppShell,
});

import { createFileRoute, redirect } from "@tanstack/react-router";

import { ensureSession } from "../entities/session";
import { Settings } from "../features/settings";
import { useSessionStore } from "../shared/api/session-store";

// Settings shell (DESIGN-BRIEF.md §7.3) — profile + appearance, reached from
// the chat list's settings button (header on phone, avatar footer on desktop
// — ChatListPanel.tsx).
export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    await ensureSession();
    if (useSessionStore.getState().status !== "authenticated") {
      // TanStack Router's redirect() is meant to be thrown from `beforeLoad`
      // — it's a plain routing signal, not an Error subclass.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/login" });
    }
  },
  component: Settings,
});

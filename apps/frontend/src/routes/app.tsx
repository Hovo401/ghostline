import { createFileRoute, redirect } from "@tanstack/react-router";

import { ensureSession } from "../entities/session";
import { Chat } from "../features/chat";
import { useSessionStore } from "../shared/api/session-store";

// Messenger shell (REQUIREMENTS.md §4/§5.4-§5.6, DESIGN-BRIEF.md §7.2).
export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    await ensureSession();
    if (useSessionStore.getState().status !== "authenticated") {
      // TanStack Router's redirect() is meant to be thrown from `beforeLoad`
      // — it's a plain routing signal, not an Error subclass.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/login" });
    }
  },
  component: Chat,
});

import { createFileRoute, redirect } from "@tanstack/react-router";

import { ensureSession } from "../entities/session";
import { Auth } from "../features/auth";
import { useSessionStore } from "../shared/api/session-store";

interface LoginSearch {
  tab?: "login" | "register";
}

// Login/register (REQUIREMENTS.md §4/§5.2, DESIGN-BRIEF.md §7.1). Already
// signed in (a fresh access token minted from the refresh cookie) → skip
// straight to the messenger instead of showing the form again.
export const Route = createFileRoute("/login")({
  // `tab` lets the landing page's "Войти"/"Создать аккаунт" buttons open
  // this screen on the matching tab (BACKLOG.md F6).
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    search.tab === "login" || search.tab === "register" ? { tab: search.tab } : {},
  beforeLoad: async () => {
    await ensureSession();
    if (useSessionStore.getState().status === "authenticated") {
      // TanStack Router's redirect() is meant to be thrown from `beforeLoad`
      // — it's a plain routing signal, not an Error subclass.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/app" });
    }
  },
  component: Auth,
});

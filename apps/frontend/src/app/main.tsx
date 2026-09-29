import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../shared/theme/theme.css";
import { registerServiceWorker } from "../entities/notification";
import { routeTree } from "../routeTree.gen";
import { useApplyAppearance } from "../shared/theme/use-apply-appearance";

const router = createRouter({ routeTree });

// Registers `src/sw.ts` for Web Push (calls plan §Фаза 5) — a no-op where
// service workers aren't supported at all; safe to call unconditionally at
// boot since it doesn't itself request notification permission or subscribe.
registerServiceWorker();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

function AppRoot() {
  useApplyAppearance();
  return (
    <>
      <RouterProvider router={router} />
      {/* Vite inlines import.meta.env.DEV at build time, so this whole
          branch (and the two devtools packages) is dead-code-eliminated
          from the production bundle — not just hidden at runtime. */}
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools router={router} position="bottom-right" />
          <ReactQueryDevtools client={queryClient} buttonPosition="bottom-left" />
        </>
      )}
    </>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRoot />
    </QueryClientProvider>
  </StrictMode>,
);

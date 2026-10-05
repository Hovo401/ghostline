import { createRootRoute, Outlet } from "@tanstack/react-router";

import { useSessionStore } from "../shared/api/session-store";

import { SignedInHost } from "./-signed-in-host";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const authenticated = useSessionStore((state) => state.status === "authenticated");

  return (
    <>
      <Outlet />
      {authenticated && <SignedInHost />}
    </>
  );
}

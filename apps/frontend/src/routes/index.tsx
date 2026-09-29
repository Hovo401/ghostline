import { createFileRoute } from "@tanstack/react-router";

import { Landing } from "../features/landing";

// Home page (REQUIREMENTS.md §4/§5.1, DESIGN-BRIEF.md §6).
export const Route = createFileRoute("/")({
  component: Landing,
});

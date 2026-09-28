import { createFileRoute } from "@tanstack/react-router";

// Messenger shell (REQUIREMENTS.md §4/§5.4-§5.6, DESIGN-BRIEF.md §7.2).
// Chat list / conversation / composer are their own features under
// src/features once auth exists to protect this route.
export const Route = createFileRoute("/app")({
  component: MessengerShell,
});

function MessengerShell() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg2 text-fg">
      <p className="font-mono text-sm text-mute">// мессенджер — TODO</p>
    </main>
  );
}

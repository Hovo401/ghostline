import { createFileRoute } from "@tanstack/react-router";

import { Chat } from "../../features/chat";

// Chat list + open thread — the messenger's home screen; the `/app` layout
// guards the session and owns `?chat=`.
export const Route = createFileRoute("/app/")({
  component: Chat,
});

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useCallActions } from "../../entities/call";

/**
 * Applies `/app`'s `?call=&answer=1` deep-link search params once on mount —
 * set by `sw.ts`'s `notificationclick` handler when it had no open tab to
 * hand off to and had to `clients.openWindow` a fresh one instead (calls
 * plan §Фаза 5 doc T-068): it accepts that call. The params are stripped
 * from the URL right after so a reload doesn't re-trigger them; a ref
 * guards against re-firing before that navigation lands. `?chat=` needs no
 * handling here — it's the open chat's own URL (`use-chat-navigation.ts`),
 * so it's kept. `strict: false` reads `/app`'s search params without
 * requiring this to be mounted at that exact route, same as `Auth.tsx`.
 */
export function useNotificationDeepLink(): void {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const { accept } = useCallActions();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    const { chat, call, answer } = search;
    if (!(call && answer)) return;
    handledRef.current = true;

    accept(call);
    void navigate({ to: ".", search: chat ? { chat } : {}, replace: true });
  }, [search, navigate, accept]);
}

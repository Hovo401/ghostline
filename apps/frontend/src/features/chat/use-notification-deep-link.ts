import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useCallActions } from "../../entities/call";

import { useChatUiStore } from "./chat-ui-store";

/**
 * Applies `/app`'s `?chat=`/`?call=&answer=1` deep-link search params once on
 * mount — set by `sw.ts`'s `notificationclick` handler when it had no open
 * tab to hand off to and had to `clients.openWindow` a fresh one instead
 * (calls plan §Фаза 5 doc T-068): `chat` selects that chat, `call`+`answer`
 * accepts that call. `strict: false` reads `/app`'s search params without
 * requiring this to be mounted at that exact route, same as `Auth.tsx`. The
 * params are stripped from the URL right after so a reload doesn't
 * re-trigger them; a ref guards against re-firing before that navigation
 * lands.
 */
export function useNotificationDeepLink(): void {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const selectChat = useChatUiStore((state) => state.selectChat);
  const { accept } = useCallActions();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    const { chat, call, answer } = search;
    if (!chat && !(call && answer)) return;
    handledRef.current = true;

    if (chat) selectChat(chat);
    if (call && answer) accept(call);
    void navigate({ to: ".", search: {}, replace: true });
  }, [search, navigate, selectChat, accept]);
}

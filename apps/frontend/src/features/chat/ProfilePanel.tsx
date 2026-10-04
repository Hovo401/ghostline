import type { CSSProperties } from "react";

import {
  type Attachment,
  fileExtension,
  shouldAutoDownload,
  useMediaSource,
  useMediaViewerStore,
} from "../../entities/attachment";
import { type ChatListItem, useChatMedia } from "../../entities/chat";
import { Avatar } from "../../shared/ui/avatar";
import { Backdrop } from "../../shared/ui/backdrop";
import { IconButton } from "../../shared/ui/icon-button";

import { chatDisplayName } from "./format";

interface ProfilePanelProps {
  chat: ChatListItem;
  open: boolean;
  onClose: () => void;
}

function stagger(step: number): CSSProperties {
  return { transitionDelay: `${(step * 60 + 80).toString()}ms` };
}

/** One "МЕДИА" grid cell — a real photo thumbnail, or (file/voice/video)
 * the same extension badge MessageBubble's file chip uses, reusing
 * `fileExtension` instead of re-deriving it. An image cell opens the
 * fullscreen viewer (T-033) on the chat's photos; non-image cells aren't
 * clickable (file/voice/video already play/download inline). */
function MediaGridItem({ attachment, onOpen }: { attachment: Attachment; onOpen?: () => void }) {
  const isImage = attachment.mime.startsWith("image/");
  // Same cache + policy as the feed (docs/adr/0013): small photos load as
  // they scroll into view, big ones stay a plate — tapping opens the viewer.
  const media = useMediaSource(isImage ? attachment : null, {
    autoDownload: isImage && shouldAutoDownload("image", attachment, false),
  });
  if (isImage) {
    return (
      <button
        ref={media.ref}
        type="button"
        onClick={onOpen}
        aria-label="Открыть фото"
        className="relative flex aspect-square cursor-zoom-in items-end justify-end overflow-hidden rounded-lg bg-panel p-1.5"
      >
        {media.src ? (
          <img
            src={media.src}
            alt={attachment.name ?? "Фото"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="relative font-mono text-[10px] text-mute">
            {fileExtension(attachment.name, attachment.mime)}
          </span>
        )}
      </button>
    );
  }
  return (
    <div className="relative flex aspect-square items-end justify-end overflow-hidden rounded-lg bg-panel p-1.5">
      <span className="font-mono text-[10px] text-mute">
        {fileExtension(attachment.name, attachment.mime)}
      </span>
    </div>
  );
}

/** Slide-in panel — DESIGN-BRIEF.md §7.2: 500ms slide + scrim, staggered
 * content fade (80ms step). */
export function ProfilePanel({ chat, open, onClose }: ProfilePanelProps) {
  const media = useChatMedia(chat.id, open);
  const openViewer = useMediaViewerStore((state) => state.open);
  const name = chatDisplayName(chat);
  const peer = chat.peer;
  const imageAttachments = (media.data ?? []).filter((attachment) =>
    attachment.mime.startsWith("image/"),
  );

  const fadeClass = (extra: string): string =>
    [
      extra,
      "transition-[opacity,transform] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
      open ? "translate-y-0 opacity-100" : "translate-y-3.5 opacity-0",
    ].join(" ");

  return (
    <>
      <Backdrop open={open} onClose={onClose} />
      <div
        className={[
          "pt-safe pb-safe fixed inset-y-0 right-0 z-50 flex w-full max-w-95 flex-col border-l border-line bg-bg shadow-glow transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-17 flex-none items-center justify-between border-b border-line pr-3 pl-5">
          <span className="text-[15px] font-medium">Профиль</span>
          <IconButton icon={<span aria-hidden>{"✕"}</span>} label="Закрыть" onClick={onClose} />
        </div>

        <div className="flex flex-1 flex-col gap-6.5 overflow-y-auto px-5 pt-7 pb-8">
          <div
            className={fadeClass("flex flex-col items-center gap-3.5 text-center")}
            style={stagger(0)}
          >
            <Avatar
              name={name}
              src={peer?.avatarUrl ?? undefined}
              size={112}
              online={peer?.online}
              ring
            />
            <div className="flex flex-col gap-1">
              <div className="text-[22px] font-medium tracking-tight">{name}</div>
              {peer && <div className="font-mono text-xs text-accent-text">@{peer.username}</div>}
              <div className="text-sm text-mute">
                {peer ? (peer.online ? "в сети" : "не в сети") : "только вы"}
              </div>
            </div>
          </div>

          {media.data && media.data.length > 0 && (
            // No card treatment here — the prototype's "Медиа" section is a plain column
            // spanning the panel's full content width; a bg2/padding
            // wrapper would shrink the grid below the prototype's cell size.
            <div className={fadeClass("flex flex-col gap-2.5")} style={stagger(2)}>
              <span className="flex items-baseline justify-between">
                <span className="text-[15px] font-medium">Медиа</span>
                <span className="font-mono text-xs text-mute">{media.data.length}</span>
              </span>
              <div className="grid grid-cols-3 gap-1">
                {media.data.map((attachment) => (
                  <MediaGridItem
                    key={attachment.id}
                    attachment={attachment}
                    onOpen={() => {
                      const index = imageAttachments.findIndex((item) => item.id === attachment.id);
                      if (index !== -1) openViewer(imageAttachments, index);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

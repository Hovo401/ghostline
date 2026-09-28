import type { Attachment as WireAttachment } from "@ghostline/contracts";
import type { Attachment as PrismaAttachment } from "@prisma/client";

import type { StorageService } from "../storage/storage.service";

/**
 * Pure helper for building the wire `Attachment` shape — exported as a
 * plain function (not part of `AttachmentsService`) so `message.util.ts`
 * can reuse it for `Message.attachment` without importing
 * `AttachmentsModule` (same reasoning as `message.util.ts`'s own
 * docstring: these are shared pure helpers, not a service-to-service call).
 *
 * `url` is computed fresh on every call via `StorageService.createDownloadUrl`
 * — never persisted (see docs/adr/0007-embed-presigned-media-urls.md) — so
 * `<img>`/`<audio>`/`<video>` tags can load it without an `Authorization`
 * header.
 */
export async function toWireAttachment(
  attachment: PrismaAttachment,
  storage: StorageService,
): Promise<WireAttachment> {
  return {
    id: attachment.id,
    key: attachment.key,
    mime: attachment.mime,
    size: Number(attachment.size),
    width: attachment.width,
    height: attachment.height,
    name: attachment.name,
    url: await storage.createDownloadUrl(attachment.key, attachment.name ?? undefined),
  };
}

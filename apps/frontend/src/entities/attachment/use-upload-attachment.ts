import type { Attachment } from "@ghostline/contracts";
import { useMutation } from "@tanstack/react-query";

import { uploadAttachment, type UploadAttachmentParams } from "./upload-attachment";

/** Composer-facing hook for `uploadAttachment` — `mutateAsync` so callers
 * (photo/file pick, voice/video finish) can `await` the resulting
 * `Attachment` before sending the message that references it. */
export function useUploadAttachment() {
  return useMutation<Attachment, Error, UploadAttachmentParams>({
    mutationFn: uploadAttachment,
  });
}

import {
  AttachmentSchema,
  CompleteUploadRequestSchema,
  PresignUploadResponseSchema,
  type Attachment,
  type AttachmentKind,
  type CompleteUploadRequest,
  type PresignUploadRequest,
} from "@ghostline/contracts";

import { apiFetch } from "../../shared/api/http-client";

import { readMediaDimensions } from "./read-media-dimensions";
import { putFileWithProgress } from "./upload-file";

export interface UploadAttachmentParams {
  file: File | Blob;
  fileName: string;
  kind: AttachmentKind;
  onProgress?: (fraction: number) => void;
}

/**
 * Presign → direct PUT (with progress) → complete flow (REQUIREMENTS.md
 * §7.6): `POST /attachments/presign` gets a short-lived `uploadUrl`, the
 * file goes straight to storage, then `POST /attachments/:id/complete`
 * confirms it landed and returns the full `Attachment` (presigned GET
 * `url` included) ready to hand to `useSendMessage`'s media send.
 * Exported as a plain async function so it's testable without going
 * through React Query — `use-upload-attachment.ts` is a thin `useMutation`
 * wrapper around it.
 */
export async function uploadAttachment(params: UploadAttachmentParams): Promise<Attachment> {
  const { file, fileName, kind, onProgress } = params;
  const mime = file.type || "application/octet-stream";

  const presignBody: PresignUploadRequest = { kind, mime, size: file.size, fileName };
  const presignData = await apiFetch("/attachments/presign", { method: "POST", body: presignBody });
  const { attachmentId, uploadUrl } = PresignUploadResponseSchema.parse(presignData);

  await putFileWithProgress(uploadUrl, file, mime, onProgress);

  const dimensions =
    kind === "image" || kind === "video" ? await readMediaDimensions(file, kind) : null;
  const completeBody: CompleteUploadRequest = CompleteUploadRequestSchema.parse({
    attachmentId,
    ...(dimensions ?? {}),
  });
  const completeData = await apiFetch(`/attachments/${attachmentId}/complete`, {
    method: "POST",
    body: completeBody,
  });
  return AttachmentSchema.parse(completeData);
}

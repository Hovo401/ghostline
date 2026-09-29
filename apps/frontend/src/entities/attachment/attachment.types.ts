export type {
  Attachment,
  AttachmentKind,
  AttachmentLimitsResponse,
  CompleteUploadRequest,
  PresignPartsRequest,
  PresignPartsResponse,
  PresignUploadRequest,
  PresignUploadResponse,
} from "@ghostline/contracts";
export { MULTIPART_THRESHOLD_BYTES } from "@ghostline/contracts";

/** Width/height read off an image/video file client-side before upload
 * completes — the wire contract only carries them once the server has
 * confirmed the object, this is the local best-effort read. */
export interface MediaDimensions {
  width: number;
  height: number;
}

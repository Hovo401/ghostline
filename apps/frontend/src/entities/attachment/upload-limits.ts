import {
  AttachmentLimitsResponseSchema,
  type AttachmentLimitsResponse,
} from "@ghostline/contracts";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";

const UPLOAD_LIMITS_QUERY_KEY = ["attachments", "limits"] as const;

async function fetchUploadLimits(): Promise<AttachmentLimitsResponse> {
  const data = await apiFetch("/attachments/limits");
  return AttachmentLimitsResponseSchema.parse(data);
}

/** `GET /attachments/limits` — the composer's picker and `AttachPreviewDialog`
 * both need the current max size/file count to validate a selection before
 * spending a presign round trip on a file that's doomed to a 413. Limits
 * change essentially never, so a long `staleTime` avoids refetching it on
 * every dialog open. */
export function useUploadLimits() {
  return useQuery({
    queryKey: UPLOAD_LIMITS_QUERY_KEY,
    queryFn: fetchUploadLimits,
    staleTime: 10 * 60 * 1000,
  });
}

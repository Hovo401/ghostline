import type { AttachmentLimitsResponse } from "@ghostline/contracts";

import { formatFileSize } from "./format-file-size";

export interface FileRejection {
  file: File;
  reason: string;
}

export interface ValidateFilesResult {
  accepted: File[];
  rejected: FileRejection[];
}

/**
 * Pre-upload validation against `useUploadLimits()`'s response — run before
 * `AttachPreviewDialog` lets the user hit "Отправить" so an oversized/empty
 * file (or picking too many at once) is caught client-side instead of
 * spending a presign round trip on a file that's doomed to a 413.
 */
export function validateFiles(
  files: File[],
  limits: AttachmentLimitsResponse,
): ValidateFilesResult {
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];

  const overflow = files.length > limits.maxFilesPerSend ? files.slice(limits.maxFilesPerSend) : [];
  const withinCount = files.slice(0, limits.maxFilesPerSend);

  for (const file of withinCount) {
    if (file.size === 0) {
      rejected.push({ file, reason: "Пустой файл" });
      continue;
    }
    if (file.size > limits.maxFileSizeBytes) {
      rejected.push({
        file,
        reason: `Больше ${formatFileSize(limits.maxFileSizeBytes)}`,
      });
      continue;
    }
    accepted.push(file);
  }

  for (const file of overflow) {
    rejected.push({ file, reason: `Больше ${limits.maxFilesPerSend.toFixed(0)} файлов за раз` });
  }

  return { accepted, rejected };
}

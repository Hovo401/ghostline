import { ApiError } from "../../shared/api/http-client";

import { isUploadError } from "./upload-file";

/**
 * Maps any error surfaced by the upload pipeline (`upload-file.ts`'s
 * `UploadError`, `ApiError` from a presign/parts/complete call, or a bare
 * network `TypeError` from `fetch`) to the Russian, user-facing string
 * `upload-queue-store`/`MessageBubble`'s failed state shows — this repo's UI
 * copy is Russian throughout (see existing aria-labels).
 */
export function describeUploadError(error: unknown): string {
  if (isUploadError(error)) {
    if (error.code === "aborted") return "Загрузка отменена";
    if (error.code === "network") return "Нет соединения с сервером — проверьте интернет";
    if (error.status === 413) return "Файл слишком большой";
    if (error.status === 401) return "Сессия истекла";
    if (error.status === 507 || error.status === 503) return "Хранилище недоступно";
    return `Ошибка сервера (${(error.status ?? 0).toFixed(0)})`;
  }

  if (error instanceof ApiError) {
    if (error.status === 413) return "Файл слишком большой";
    if (error.status === 401) return "Сессия истекла";
    if (error.status === 507 || error.status === 503) return "Хранилище недоступно";
    return `Ошибка сервера (${error.status.toFixed(0)})`;
  }

  if (error instanceof TypeError) {
    return "Нет соединения с сервером — проверьте интернет";
  }

  return "Не удалось загрузить файл";
}

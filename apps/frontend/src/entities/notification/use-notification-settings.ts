import { NotificationSettingsSchema, type NotificationSettings } from "@ghostline/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { NOTIFICATION_SETTINGS_QUERY_KEY } from "../../shared/api/query-keys";

/** `GET /notifications/settings` — the settings screen's "Уведомления" tab
 * (FR-NOTIF-05). */
export function useNotificationSettings() {
  return useQuery<NotificationSettings>({
    queryKey: NOTIFICATION_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const data: unknown = await apiFetch("/notifications/settings");
      return NotificationSettingsSchema.parse(data);
    },
  });
}

/** `PATCH /notifications/settings` — each toggle (messages/calls/preview)
 * PATCHes just the field it owns; the response is the full settings object
 * either way, so the cache is simply replaced with it. */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation<NotificationSettings, Error, Partial<NotificationSettings>>({
    mutationFn: async (body) => {
      const data: unknown = await apiFetch("/notifications/settings", { method: "PATCH", body });
      return NotificationSettingsSchema.parse(data);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(NOTIFICATION_SETTINGS_QUERY_KEY, settings);
    },
  });
}

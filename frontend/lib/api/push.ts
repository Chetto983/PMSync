import { apiClient } from '../api-client';

export interface PushSubscriptionDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPreferences {
  pushEmailEnabled: boolean;
  pushCalendarEnabled: boolean;
  pushAiEnabled: boolean;
}

export const pushApi = {
  subscribe: (dto: PushSubscriptionDto) =>
    apiClient.post('/push/subscribe', dto),
  unsubscribe: (endpoint: string) =>
    apiClient.delete('/push/subscribe', { data: { endpoint } }),
  getPreferences: () =>
    apiClient.get<PushPreferences>('/users/me/preferences').then(
      (res) => ({
        pushEmailEnabled: res.data?.pushEmailEnabled ?? true,
        pushCalendarEnabled: res.data?.pushCalendarEnabled ?? true,
        pushAiEnabled: res.data?.pushAiEnabled ?? true,
      }),
    ),
  updatePreference: (key: keyof PushPreferences, value: boolean) =>
    apiClient.patch('/users/me/preferences', { [key]: value }),
};

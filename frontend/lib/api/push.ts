import { apiClient } from '../api-client';

export interface PushSubscriptionDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushApi = {
  subscribe: (dto: PushSubscriptionDto) =>
    apiClient.post('/push/subscribe', dto),
  unsubscribe: (endpoint: string) =>
    apiClient.delete('/push/subscribe', { data: { endpoint } }),
};

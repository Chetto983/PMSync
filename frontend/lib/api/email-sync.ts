/**
 * Email Sync API
 *
 * API client for email synchronization operations.
 * Syncs both folder structure AND email messages from providers.
 */

import { apiClient } from './index';

/**
 * Sync emails for a specific provider
 * This triggers full email synchronization including folders + messages
 *
 * @param providerId - Provider ID to sync
 * @returns Promise with sync job status
 */
export async function syncProvider(providerId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const response = await apiClient.post(`/email-sync/sync/${providerId}`);
  return response.data;
}

/**
 * Sync all providers (DANGEROUS - purges all data)
 * This purges emails, attachments, embeddings and re-syncs everything
 *
 * @returns Promise with sync results for all providers
 */
export async function syncAll(): Promise<{
  success: boolean;
  message: string;
  results: Array<{
    providerId: string;
    providerEmail: string;
    success: boolean;
    message?: string;
  }>;
}> {
  const response = await apiClient.post('/email-sync/sync-all');
  return response.data;
}

/**
 * Email Sync API object for convenient access
 */
export const emailSyncApi = {
  syncProvider,
  syncAll,
};

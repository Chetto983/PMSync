/**
 * Email Sync Job Interfaces
 */

export interface SyncJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  email: string;
  priority: 'high' | 'normal' | 'low';
  syncType: 'full' | 'incremental';
  lastSyncedAt?: Date;
  authToken?: string;
  /** Correlation ID from the originating HTTP request (undefined for cron/worker-triggered jobs) */
  requestId?: string;
}

export interface SyncJobResult {
  success: boolean;
  providerId: string;
  email: string;
  messagesProcessed: number;
  newMessages: number;
  errors?: string[];
  syncDuration: number;
  lastSyncToken?: string; // For incremental sync (UID, historyId, deltaLink)
  metadata?: Record<string, any>;
  isAuthError?: boolean; // True if sync failed due to authentication issues
}

export interface SyncStatus {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

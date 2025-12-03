/**
 * Webhook interfaces for real-time email synchronization
 */

// ===== COMMON WEBHOOK INTERFACES =====

export interface WebhookNotification {
  providerId: string;
  providerType: 'google' | 'microsoft';
  timestamp: Date;
  resourceId?: string;
  changeType?: string;
}

export interface WebhookSubscriptionData {
  providerId: string;
  providerType: 'google' | 'microsoft';
  subscriptionId: string;
  webhookUrl?: string;
  resourcePath?: string;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

// ===== GMAIL PUB/SUB INTERFACES =====

export interface GmailPubSubMessage {
  message: {
    data: string; // Base64-encoded JSON
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

export interface GmailPubSubData {
  emailAddress: string;
  historyId: string;
}

export interface GmailWatchResponse {
  historyId: string;
  expiration: string; // Unix timestamp in milliseconds
}

// ===== MICROSOFT GRAPH INTERFACES =====

export interface MicrosoftGraphNotification {
  subscriptionId: string;
  subscriptionExpirationDateTime: string;
  changeType: 'created' | 'updated' | 'deleted';
  resource: string;
  resourceData?: {
    '@odata.type': string;
    '@odata.id': string;
    '@odata.etag'?: string;
    id?: string;
  };
  clientState?: string;
  tenantId?: string;
}

export interface MicrosoftGraphWebhookPayload {
  value: MicrosoftGraphNotification[];
  validationToken?: string; // For initial validation
}

export interface MicrosoftGraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
  latestSupportedTlsVersion?: string;
}

// ===== WEBHOOK LIFECYCLE INTERFACES =====

export interface CreateWebhookOptions {
  providerId: string;
  providerType: 'google' | 'microsoft';
  webhookUrl?: string; // Required for Microsoft
  expirationHours?: number; // Custom expiration (default: 7 days Gmail, 3 days Microsoft)
}

export interface RenewWebhookOptions {
  subscriptionId: string;
  expirationHours?: number;
}

export interface WebhookStats {
  totalSubscriptions: number;
  activeSubscriptions: number;
  expiringWithin24h: number;
  byProvider: {
    google: number;
    microsoft: number;
  };
  recentNotifications: {
    last1h: number;
    last24h: number;
  };
  errors: {
    totalErrors: number;
    providersWithErrors: number;
  };
  staleRenewals?: number;
}

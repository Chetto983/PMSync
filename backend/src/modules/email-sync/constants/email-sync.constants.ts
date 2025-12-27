/**
 * Email Sync Module Constants
 *
 * Centralized constants for the email-sync module to eliminate magic strings/numbers.
 * All hardcoded values should be extracted here for maintainability.
 *
 * @module email-sync/constants
 */

// =============================================================================
// IMAP FLAGS (RFC 3501)
// =============================================================================

export const IMAP_FLAGS = {
  SEEN: '\\Seen',
  FLAGGED: '\\Flagged',
  DELETED: '\\Deleted',
  DRAFT: '\\Draft',
  ANSWERED: '\\Answered',
  RECENT: '\\Recent',
} as const;

export type ImapFlag = (typeof IMAP_FLAGS)[keyof typeof IMAP_FLAGS];

// =============================================================================
// CANONICAL FOLDER NAMES
// =============================================================================

export const CANONICAL_FOLDERS = {
  INBOX: 'INBOX',
  SENT: 'SENT',
  DRAFTS: 'DRAFTS',
  TRASH: 'TRASH',
  SPAM: 'SPAM',
  JUNK: 'JUNK',
  ARCHIVE: 'ARCHIVE',
  STARRED: 'STARRED',
  IMPORTANT: 'IMPORTANT',
} as const;

export type CanonicalFolderName = (typeof CANONICAL_FOLDERS)[keyof typeof CANONICAL_FOLDERS];

/** System folders that cannot be deleted/renamed by users */
export const SYSTEM_FOLDERS = [
  CANONICAL_FOLDERS.INBOX,
  CANONICAL_FOLDERS.SENT,
  CANONICAL_FOLDERS.DRAFTS,
  CANONICAL_FOLDERS.TRASH,
  CANONICAL_FOLDERS.SPAM,
  CANONICAL_FOLDERS.JUNK,
  CANONICAL_FOLDERS.ARCHIVE,
] as const;

// =============================================================================
// GMAIL LABELS
// =============================================================================

export const GMAIL_LABELS = {
  INBOX: 'INBOX',
  SENT: 'SENT',
  DRAFT: 'DRAFT',
  TRASH: 'TRASH',
  SPAM: 'SPAM',
  STARRED: 'STARRED',
  IMPORTANT: 'IMPORTANT',
  UNREAD: 'UNREAD',
  CATEGORY_PERSONAL: 'CATEGORY_PERSONAL',
  CATEGORY_SOCIAL: 'CATEGORY_SOCIAL',
  CATEGORY_PROMOTIONS: 'CATEGORY_PROMOTIONS',
  CATEGORY_UPDATES: 'CATEGORY_UPDATES',
  CATEGORY_FORUMS: 'CATEGORY_FORUMS',
} as const;

export type GmailLabel = (typeof GMAIL_LABELS)[keyof typeof GMAIL_LABELS];

/** Gmail system labels for folder sync */
export const GMAIL_SYSTEM_LABELS = [
  GMAIL_LABELS.INBOX,
  GMAIL_LABELS.SENT,
  GMAIL_LABELS.DRAFT,
  GMAIL_LABELS.TRASH,
  GMAIL_LABELS.SPAM,
  GMAIL_LABELS.STARRED,
  GMAIL_LABELS.IMPORTANT,
] as const;

// =============================================================================
// MICROSOFT GRAPH
// =============================================================================

export const MICROSOFT_FLAG_STATUS = {
  FLAGGED: 'flagged',
  NOT_FLAGGED: 'notFlagged',
  COMPLETE: 'complete',
} as const;

export type MicrosoftFlagStatus = (typeof MICROSOFT_FLAG_STATUS)[keyof typeof MICROSOFT_FLAG_STATUS];

// =============================================================================
// TIMEOUTS (milliseconds)
// =============================================================================

export const TIMEOUTS = {
  // IMAP connection
  IMAP_CONNECTION_IDLE: 60000, // 60s
  IMAP_CONNECTION_ACQUIRE: 10000, // 10s
  IMAP_BODY_DOWNLOAD: 15000, // 15s

  // Microsoft Graph API
  MICROSOFT_GRAPH_API: 30000, // 30s

  // Folder operations
  FOLDER_JOB_DEFAULT: 30000, // 30s

  // Resilience
  RETRY_MAX_DELAY: 30000, // 30s
  CIRCUIT_BREAKER_RESET: 60000, // 60s
  DEFAULT_CONNECT: 10000, // 10s
  DEFAULT_REQUEST: 30000, // 30s
  DEFAULT_BATCH: 120000, // 2min
  DEFAULT_IDLE: 60000, // 60s

  // Batch operations
  BATCH_CONNECT: 10000, // 10s
  BATCH_REQUEST: 120000, // 2min
  BATCH_MAX: 300000, // 5min
  BATCH_IDLE: 60000, // 60s

  // Gmail specific
  GMAIL_QUOTA_RETRY: 60000, // 60s
  GMAIL_RATE_LIMIT_RETRY: 30000, // 30s
  GMAIL_SERVER_ERROR_RETRY: 5000, // 5s

  // Email sync-back
  EMAIL_OPERATION: 30000, // 30s
  SYNC_BACK_LOCK_TTL: 60000, // 60s
  TOKEN_REFRESH_LOCK_TTL: 30000, // 30s
} as const;

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
  EXPONENTIAL_BASE: 2,
  JITTER_FACTOR: 0.1,
  RETRYABLE_HTTP_CODES: [429, 500, 502, 503, 504] as const,

  // Execute retry
  EXECUTE_MAX_ATTEMPTS: 5,
  EXECUTE_BASE_DELAY_MS: 500,

  // Sync retry
  SYNC_MAX_ATTEMPTS: 3,
  SYNC_429_DELAY_MS: 2000,
  SYNC_5XX_DELAY_MS: 2000,

  // Attachment upload
  ATTACHMENT_UPLOAD_MAX_RETRIES: 2,

  // Lock retries
  LOCK_MAX_RETRIES: 2,
  QUEUE_OPERATION_MAX_RETRIES: 2,
  QUEUE_PUBLISH_MAX_RETRIES: 2,
} as const;

// =============================================================================
// CIRCUIT BREAKER CONFIGURATION
// =============================================================================

export const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 5,
  SUCCESS_THRESHOLD: 2,
  HALF_OPEN_REQUESTS: 1,
  RESET_TIMEOUT_MS: 60000,
} as const;

// =============================================================================
// RATE LIMITING CONFIGURATION
// =============================================================================

export const RATE_LIMITS = {
  GOOGLE: {
    REQUESTS_PER_SECOND: 10,
    REQUESTS_PER_MINUTE: 250,
    BURST_LIMIT: 25,
    COOLDOWN_MS: 60000,
  },
  MICROSOFT: {
    REQUESTS_PER_SECOND: 8,
    REQUESTS_PER_MINUTE: 180,
    BURST_LIMIT: 30,
    COOLDOWN_MS: 30000,
  },
  IMAP: {
    REQUESTS_PER_SECOND: 5,
    REQUESTS_PER_MINUTE: 200,
    BURST_LIMIT: 10,
    COOLDOWN_MS: 30000,
  },
} as const;

// =============================================================================
// SYNC SCHEDULER INTERVALS
// =============================================================================

export const SYNC_INTERVALS = {
  // Priority-based intervals (in minutes/hours)
  HIGH_PRIORITY_MINUTES: 3,
  MEDIUM_HIGH_PRIORITY_MINUTES: 15,
  MEDIUM_PRIORITY_MINUTES: 30,
  LOW_PRIORITY_HOURS: 2,
  VERY_LOW_PRIORITY_HOURS: 6,

  // Activity thresholds (emails per hour)
  ACTIVITY_THRESHOLD_HIGH: 4,
  ACTIVITY_THRESHOLD_MEDIUM_HIGH: 2,
  ACTIVITY_THRESHOLD_MEDIUM: 0.5,
  ACTIVITY_THRESHOLD_LOW: 0.1,
} as const;

// =============================================================================
// WEBHOOK CONFIGURATION
// =============================================================================

export const WEBHOOK_CONFIG = {
  STALE_THRESHOLD_MINUTES: 10,
  BACKUP_SYNC_HOURS: 6,
  REPLAY_WINDOW_MS: 3 * 60 * 1000, // 3 minutes (SEC-3 fix)
  RATE_LIMIT_PER_MINUTE: 100,
  DEDUP_WINDOW_MINUTES: 5,
} as const;

// =============================================================================
// JOB STATUS
// =============================================================================

export const JOB_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

// =============================================================================
// EMAIL SEND STATUS
// =============================================================================

export const EMAIL_SEND_STATUS = {
  PENDING: 'pending',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type EmailSendStatus = (typeof EMAIL_SEND_STATUS)[keyof typeof EMAIL_SEND_STATUS];

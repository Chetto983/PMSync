/**
 * Canonical Types for Multi-Provider Email Abstraction
 *
 * These types provide a unified representation of email data across
 * different providers (Google, Microsoft, IMAP). All provider-specific
 * data is normalized to these canonical types.
 *
 * Based on RFC 6154 (IMAP LIST Extension for Special-Use Mailboxes)
 */

/**
 * Known canonical folder types based on:
 * - RFC 6154 (IMAP LIST Extension for Special-Use Mailboxes)
 * - RFC 8457 (IMAP "$Important" Keyword and "\Important" Special-Use Attribute)
 * - Microsoft Graph API wellKnownName values
 * - Gmail API system labels
 *
 * These are locale-independent identifiers for standard mailbox folders.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6154.html
 * @see https://www.rfc-editor.org/rfc/rfc8457.html
 * @see https://learn.microsoft.com/en-us/graph/api/resources/mailfolder
 * @see https://developers.google.com/workspace/gmail/api/guides/labels
 */
export type KnownFolderType =
  // RFC 6154 standard special-use attributes
  | 'INBOX'      // Primary inbox - \Inbox
  | 'SENT'       // Sent messages - \Sent
  | 'DRAFTS'     // Draft messages - \Drafts
  | 'TRASH'      // Deleted items - \Trash
  | 'SPAM'       // Junk/spam mail - \Junk
  | 'ARCHIVE'    // Archived messages - \Archive
  | 'ALL'        // All mail - \All
  | 'FLAGGED'    // Flagged messages - \Flagged
  // RFC 8457 - Important
  | 'IMPORTANT'  // Important/priority - \Important
  // Common aliases
  | 'STARRED'    // Starred (alias for FLAGGED)
  | 'JUNK'       // Junk (alias for SPAM)
  // Microsoft Graph wellKnownName values
  | 'OUTBOX'             // Pending send
  | 'CONVERSATIONHISTORY' // Skype/Teams IM history
  | 'CLUTTER'            // Low-priority messages
  | 'CONFLICTS'          // Sync conflicts
  | 'LOCALFAILURES'      // Local sync failures
  | 'SERVERFAILURES'     // Server sync failures
  | 'SYNCISSUES'         // Sync logs
  | 'SCHEDULED'          // Scheduled messages
  // Gmail categories
  | 'SOCIAL'
  | 'PROMOTIONS'
  | 'UPDATES'
  | 'FORUMS'
  | 'PERSONAL'
  // Gmail system labels
  | 'CHAT'       // Gmail chat messages
  | 'UNREAD';    // Gmail unread label

/**
 * CanonicalFolderType allows any string for custom user folders.
 * Use KnownFolderType when you need strict type checking for system folders.
 */
export type CanonicalFolderType = KnownFolderType | (string & Record<never, never>);

/**
 * FIX 3.6: Enum for type-safe specialUse field operations
 * Provides compile-time type checking and autocomplete for special folder types
 *
 * Usage:
 * ```typescript
 * if (folder.specialUse === SpecialUse.INBOX) { ... }
 * const systemFolders = Object.values(SpecialUse);
 * const isCore = CORE_SYSTEM_FOLDERS.includes(folder.specialUse as SpecialUse);
 * ```
 */
export enum SpecialUse {
  // RFC 6154 standard special-use attributes
  INBOX = 'INBOX',
  SENT = 'SENT',
  DRAFTS = 'DRAFTS',
  TRASH = 'TRASH',
  SPAM = 'SPAM',
  ARCHIVE = 'ARCHIVE',
  ALL = 'ALL',
  FLAGGED = 'FLAGGED',
  IMPORTANT = 'IMPORTANT',
  STARRED = 'STARRED',
  JUNK = 'JUNK',
  // Microsoft Graph wellKnownName values
  OUTBOX = 'OUTBOX',
  CONVERSATIONHISTORY = 'CONVERSATIONHISTORY',
  CLUTTER = 'CLUTTER',
  CONFLICTS = 'CONFLICTS',
  LOCALFAILURES = 'LOCALFAILURES',
  SERVERFAILURES = 'SERVERFAILURES',
  SYNCISSUES = 'SYNCISSUES',
  SCHEDULED = 'SCHEDULED',
  // Gmail categories
  SOCIAL = 'SOCIAL',
  PROMOTIONS = 'PROMOTIONS',
  UPDATES = 'UPDATES',
  FORUMS = 'FORUMS',
  PERSONAL = 'PERSONAL',
  // Gmail system labels
  CHAT = 'CHAT',
  UNREAD = 'UNREAD',
}

/**
 * Core system folders that should not be deleted or renamed
 * Used for validation in folder operations
 */
export const CORE_SYSTEM_FOLDERS: readonly string[] = [
  SpecialUse.INBOX,
  SpecialUse.SENT,
  SpecialUse.DRAFTS,
  SpecialUse.TRASH,
  SpecialUse.SPAM,
  SpecialUse.JUNK,
  SpecialUse.ARCHIVE,
] as const;

/**
 * Mapping from provider-specific folder identifiers to canonical types
 */
export const GMAIL_TO_CANONICAL: Record<string, CanonicalFolderType> = {
  // Core system labels
  'INBOX': 'INBOX',
  'SENT': 'SENT',
  'DRAFT': 'DRAFTS',
  'TRASH': 'TRASH',
  'SPAM': 'SPAM',
  'STARRED': 'STARRED',
  'IMPORTANT': 'IMPORTANT',
  'UNREAD': 'UNREAD',
  'CHAT': 'CHAT',
  // Category labels
  // FIX 1.3: CATEGORY_PERSONAL maps to INBOX (not 'PERSONAL')
  // This aligns with google.driver.ts:determineFolderFromLabels() logic
  // and prevents creating phantom "Personale" folders for Italian Gmail accounts
  'CATEGORY_PERSONAL': 'INBOX',
  'CATEGORY_SOCIAL': 'SOCIAL',
  'CATEGORY_PROMOTIONS': 'PROMOTIONS',
  'CATEGORY_UPDATES': 'UPDATES',
  'CATEGORY_FORUMS': 'FORUMS',
};

/**
 * Microsoft Graph API wellKnownName to canonical mapping
 * @see https://learn.microsoft.com/en-us/graph/api/resources/mailfolder
 */
export const MICROSOFT_WELLKNOWN_TO_CANONICAL: Record<string, CanonicalFolderType> = {
  // Core folders
  'inbox': 'INBOX',
  'sentitems': 'SENT',
  'drafts': 'DRAFTS',
  'deleteditems': 'TRASH',
  'junkemail': 'SPAM',
  'archive': 'ARCHIVE',
  'outbox': 'OUTBOX',
  // Extended Microsoft folders
  'conversationhistory': 'CONVERSATIONHISTORY',
  'clutter': 'CLUTTER',
  'conflicts': 'CONFLICTS',
  'localfailures': 'LOCALFAILURES',
  'serverfailures': 'SERVERFAILURES',
  'syncissues': 'SYNCISSUES',
  'scheduled': 'SCHEDULED',
  // Aliases (localized display names from wellKnownName)
  'junk email': 'SPAM',
  'deleted items': 'TRASH',
  'sent items': 'SENT',
};

/**
 * Reverse mapping: canonical to provider-specific
 * Indexed by string to allow dynamic lookups
 */
export const CANONICAL_TO_GMAIL: Record<string, string> = {
  // Core folders
  'INBOX': 'INBOX',
  'SENT': 'SENT',
  'DRAFTS': 'DRAFT',
  'TRASH': 'TRASH',
  'SPAM': 'SPAM',
  'STARRED': 'STARRED',
  'IMPORTANT': 'IMPORTANT',
  'ARCHIVE': 'all',           // Gmail uses 'all' for archive
  'ALL': 'all',
  'FLAGGED': 'STARRED',
  'JUNK': 'SPAM',
  'UNREAD': 'UNREAD',
  'CHAT': 'CHAT',
  // Categories
  'SOCIAL': 'CATEGORY_SOCIAL',
  'PROMOTIONS': 'CATEGORY_PROMOTIONS',
  'UPDATES': 'CATEGORY_UPDATES',
  'FORUMS': 'CATEGORY_FORUMS',
  // FIX 1.3: PERSONAL maps to INBOX (not 'CATEGORY_PERSONAL')
  // Ensures reverse mapping consistency with forward mapping above
  'PERSONAL': 'INBOX',
  // Gmail doesn't have these - map to INBOX as fallback
  'OUTBOX': 'INBOX',
  'CONVERSATIONHISTORY': 'INBOX',
  'CLUTTER': 'INBOX',
  'SCHEDULED': 'INBOX',
};

/**
 * Microsoft Graph API canonical to wellKnownName mapping
 * Indexed by string to allow dynamic lookups
 */
export const CANONICAL_TO_MICROSOFT: Record<string, string> = {
  // Core folders
  'INBOX': 'inbox',
  'SENT': 'sentitems',
  'DRAFTS': 'drafts',
  'TRASH': 'deleteditems',
  'SPAM': 'junkemail',
  'ARCHIVE': 'archive',
  'OUTBOX': 'outbox',
  // Extended Microsoft folders
  'CONVERSATIONHISTORY': 'conversationhistory',
  'CLUTTER': 'clutter',
  'CONFLICTS': 'conflicts',
  'LOCALFAILURES': 'localfailures',
  'SERVERFAILURES': 'serverfailures',
  'SYNCISSUES': 'syncissues',
  'SCHEDULED': 'scheduled',
  // Aliases
  'JUNK': 'junkemail',
  'ALL': 'archive',
  'FLAGGED': 'inbox',         // Microsoft doesn't have flagged folder
  // Microsoft doesn't have these - map to inbox as fallback
  'STARRED': 'inbox',
  'IMPORTANT': 'inbox',
  'SOCIAL': 'inbox',
  'PROMOTIONS': 'inbox',
  'UPDATES': 'inbox',
  'FORUMS': 'inbox',
  'PERSONAL': 'inbox',
  'CHAT': 'inbox',
  'UNREAD': 'inbox',
};

/**
 * IMAP RFC 6154 special-use attributes to canonical mapping
 */
export const IMAP_SPECIAL_USE_TO_CANONICAL: Record<string, CanonicalFolderType> = {
  '\\Inbox': 'INBOX',
  '\\Sent': 'SENT',
  '\\Drafts': 'DRAFTS',
  '\\Trash': 'TRASH',
  '\\Junk': 'SPAM',
  '\\Archive': 'ARCHIVE',
  '\\Flagged': 'STARRED',
  '\\Important': 'IMPORTANT',
  '\\All': 'ARCHIVE',
};

/**
 * Heuristic folder name matching for IMAP servers without RFC 6154 support
 */
export const IMAP_NAME_HEURISTICS: Record<string, CanonicalFolderType> = {
  // English
  'inbox': 'INBOX',
  'sent': 'SENT',
  'sent items': 'SENT',
  'sent mail': 'SENT',
  'sent messages': 'SENT',
  'drafts': 'DRAFTS',
  'draft': 'DRAFTS',
  'trash': 'TRASH',
  'deleted': 'TRASH',
  'deleted items': 'TRASH',
  'deleted messages': 'TRASH',
  'bin': 'TRASH',
  'spam': 'SPAM',
  'junk': 'SPAM',
  'junk e-mail': 'SPAM',
  'junk email': 'SPAM',
  'bulk mail': 'SPAM',
  'archive': 'ARCHIVE',
  'archives': 'ARCHIVE',
  'all mail': 'ARCHIVE',
  'all': 'ARCHIVE',
  'important': 'IMPORTANT',
  'starred': 'STARRED',
  'flagged': 'STARRED',
  'outbox': 'SENT', // Libero and others use 'outbox' for Sent items

  // Italian
  'posta in arrivo': 'INBOX',
  'posta inviata': 'SENT',
  'inviata': 'SENT',
  'elementi inviati': 'SENT',
  'bozze': 'DRAFTS',
  'cestino': 'TRASH',
  'posta eliminata': 'TRASH',
  'eliminata': 'TRASH',
  'posta indesiderata': 'SPAM',
  'indesiderata': 'SPAM',
  'archivio': 'ARCHIVE',
  'archivia': 'ARCHIVE',
  'posta in uscita': 'OUTBOX',

  // German
  'posteingang': 'INBOX',
  'gesendet': 'SENT',
  'gesendete objekte': 'SENT',
  'entwürfe': 'DRAFTS',
  'papierkorb': 'TRASH',
  'gelöscht': 'TRASH',
  'gelöschte objekte': 'TRASH',
  'junk-e-mail': 'SPAM',
  'archiv': 'ARCHIVE',
  'postausgang': 'OUTBOX',

  // French
  'boîte de réception': 'INBOX',
  'éléments envoyés': 'SENT',
  'envoyés': 'SENT',
  'brouillons': 'DRAFTS',
  'corbeille': 'TRASH',
  'courrier indésirable': 'SPAM',
  // 'archives': 'ARCHIVE', // Duplicate removal
  'boîte d\'envoi': 'OUTBOX',

  // Spanish
  'bandeja de entrada': 'INBOX',
  'elementos enviados': 'SENT',
  'enviados': 'SENT',
  'borradores': 'DRAFTS',
  'papelera': 'TRASH',
  'eliminados': 'TRASH',
  'correo no deseado': 'SPAM',
  'archivo': 'ARCHIVE',
  'bandeja de salida': 'OUTBOX',
};

/**
 * Email address representation
 */
export interface EmailAddress {
  name?: string;
  email: string;
}

/**
 * Attachment metadata (without content)
 */
export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;   // For inline images
  isInline: boolean;
}

/**
 * Attachment with content
 */
export interface AttachmentData extends AttachmentMeta {
  content: string;      // Base64 encoded content
}

/**
 * Canonical folder representation
 */
export interface CanonicalFolder {
  id: string;                         // Provider's folder ID
  externalId: string;                 // Provider's external ID (same as id for most providers)
  name: string;                       // Display name (localized, e.g., "Posta in arrivo")
  type: CanonicalFolderType;          // Canonical type (INBOX, SENT, etc.)
  path: string;                       // Full path for nested folders
  parentId?: string;                  // Parent folder ID for hierarchy
  unreadCount: number;
  totalCount: number;
  attributes: {
    selectable: boolean;              // Can contain messages
    hasChildren: boolean;             // Has subfolders
    subscribed: boolean;              // IMAP subscription status
  };
}

/**
 * Canonical message representation
 * This is the unified format for emails across all providers
 */
export interface CanonicalMessage {
  id: string;                         // Provider's message ID
  externalId: string;                 // Provider's external ID
  threadId?: string;                  // Thread/conversation ID
  folder: CanonicalFolderType;        // Canonical folder type (INBOX, SENT, etc.)
  folderDisplayName?: string;         // Original provider folder name for reference

  // Headers
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  messageId?: string;                 // RFC 2822 Message-ID header
  inReplyTo?: string;                 // In-Reply-To header
  references?: string;                // References header

  // Content
  bodyText?: string;
  bodyHtml?: string;
  snippet: string;                    // Preview text

  // Timestamps
  receivedAt: Date;
  sentAt?: Date;

  // Flags
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  isDraft: boolean;
  isDeleted: boolean;

  // Labels (Gmail labels, Microsoft categories)
  labels: string[];

  // Attachments
  hasAttachments: boolean;
  attachments: AttachmentMeta[];

  // Provider-specific metadata (preserved for sync operations)
  providerMetadata?: {
    historyId?: string;               // Gmail history ID
    changeKey?: string;               // Microsoft change key
    modSeq?: string;                  // IMAP MODSEQ
    [key: string]: unknown;
  };
}

/**
 * Message compose data
 */
export interface ComposeMessage {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: AttachmentData[];
  inReplyTo?: string;
  references?: string;
  threadId?: string;
  fromEmail?: string;                 // Send as alias
}

/**
 * Change notification from provider
 */
export interface ProviderChange {
  type: 'added' | 'modified' | 'deleted';
  messageId: string;
  threadId?: string;
  folder?: CanonicalFolderType;
  timestamp: Date;
}

/**
 * Subscription handle for real-time updates
 */
export interface ProviderSubscription {
  unsubscribe(): Promise<void>;
  isActive(): boolean;
}

/**
 * Provider types supported by the system
 */
export type ProviderType = 'google' | 'microsoft' | 'imap';

/**
 * Helper function to get canonical folder type from Gmail label
 */
export function gmailLabelToCanonical(labelId: string): CanonicalFolderType {
  return GMAIL_TO_CANONICAL[labelId] || labelId;
}

/**
 * Helper function to get canonical folder type from Microsoft wellKnownName
 */
export function microsoftWellKnownToCanonical(wellKnownName: string): CanonicalFolderType {
  return MICROSOFT_WELLKNOWN_TO_CANONICAL[wellKnownName.toLowerCase()] || wellKnownName;
}

/**
 * Helper function to get canonical folder type from folder display name (heuristic)
 */
export function folderNameToCanonical(name: string): CanonicalFolderType {
  const normalized = name.toLowerCase().trim();
  return IMAP_NAME_HEURISTICS[normalized] || name.toUpperCase();
}

/**
 * Helper function to get canonical folder type from IMAP special-use attribute
 */
export function imapSpecialUseToCanonical(specialUse: string): CanonicalFolderType | undefined {
  return IMAP_SPECIAL_USE_TO_CANONICAL[specialUse];
}

/**
 * System label IDs that cannot be modified or deleted
 * Based on Zero/Mail-0 pattern for Gmail compatibility
 *
 * @see https://github.com/elie222/inbox-zero (Zero reference)
 */
export const SYSTEM_LABEL_IDS = new Set<string>([
  // Core system folders (all providers)
  'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE', 'IMPORTANT', 'STARRED', 'OUTBOX',
  // Aliases
  'JUNK', 'FLAGGED', 'DRAFT',
  // Gmail system labels
  'UNREAD', 'MUTED', 'CHAT', 'ALL',
  // Gmail categories
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS',
  // Gmail star variants
  'YELLOW_STAR', 'BLUE_STAR', 'GREEN_STAR', 'RED_STAR', 'ORANGE_STAR', 'PURPLE_STAR',
  // Microsoft extended folders (from Zero systemFolderNames)
  'CONVERSATIONHISTORY', 'CONVERSATION HISTORY', 'CLUTTER', 'SCHEDULED', 'NOTES', 'JOURNAL',
]);

/**
 * Check if a folder type is a system folder that cannot be deleted
 */
export function isSystemFolder(type: CanonicalFolderType): boolean {
  return SYSTEM_LABEL_IDS.has(type);
}

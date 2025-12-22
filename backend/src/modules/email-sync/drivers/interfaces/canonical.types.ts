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
 * Known canonical folder types based on RFC 6154 special-use attributes.
 * These are locale-independent identifiers for standard mailbox folders.
 */
export type KnownFolderType =
  | 'INBOX'      // Primary inbox - \Inbox
  | 'SENT'       // Sent messages - \Sent
  | 'DRAFTS'     // Draft messages - \Drafts
  | 'TRASH'      // Deleted items - \Trash
  | 'SPAM'       // Junk/spam mail - \Junk
  | 'ARCHIVE'    // Archived messages - \Archive
  | 'IMPORTANT'  // Important/priority - \Important
  | 'STARRED'    // Starred/flagged - \Flagged
  | 'OUTBOX'     // Pending send
  // Gmail categories
  | 'SOCIAL'
  | 'PROMOTIONS'
  | 'UPDATES'
  | 'FORUMS'
  | 'PERSONAL';

/**
 * CanonicalFolderType allows any string for custom user folders.
 * Use KnownFolderType when you need strict type checking for system folders.
 */
export type CanonicalFolderType = KnownFolderType | (string & Record<never, never>);

/**
 * Mapping from provider-specific folder identifiers to canonical types
 */
export const GMAIL_TO_CANONICAL: Record<string, CanonicalFolderType> = {
  'INBOX': 'INBOX',
  'SENT': 'SENT',
  'DRAFT': 'DRAFTS',
  'TRASH': 'TRASH',
  'SPAM': 'SPAM',
  'STARRED': 'STARRED',
  'IMPORTANT': 'IMPORTANT',
  'CATEGORY_PERSONAL': 'PERSONAL',
  'CATEGORY_SOCIAL': 'SOCIAL',
  'CATEGORY_PROMOTIONS': 'PROMOTIONS',
  'CATEGORY_UPDATES': 'UPDATES',
  'CATEGORY_FORUMS': 'FORUMS',
};

export const MICROSOFT_WELLKNOWN_TO_CANONICAL: Record<string, CanonicalFolderType> = {
  'inbox': 'INBOX',
  'sentitems': 'SENT',
  'drafts': 'DRAFTS',
  'deleteditems': 'TRASH',
  'junkemail': 'SPAM',
  'archive': 'ARCHIVE',
  'outbox': 'OUTBOX',
};

/**
 * Reverse mapping: canonical to provider-specific
 */
export const CANONICAL_TO_GMAIL: Record<CanonicalFolderType, string> = {
  'INBOX': 'INBOX',
  'SENT': 'SENT',
  'DRAFTS': 'DRAFT',
  'TRASH': 'TRASH',
  'SPAM': 'SPAM',
  'STARRED': 'STARRED',
  'IMPORTANT': 'IMPORTANT',
  'ARCHIVE': 'all', // Gmail uses 'all' for archive
  'OUTBOX': 'INBOX', // Gmail doesn't have outbox
  'SOCIAL': 'CATEGORY_SOCIAL',
  'PROMOTIONS': 'CATEGORY_PROMOTIONS',
  'UPDATES': 'CATEGORY_UPDATES',
  'FORUMS': 'CATEGORY_FORUMS',
  'PERSONAL': 'CATEGORY_PERSONAL',
};

export const CANONICAL_TO_MICROSOFT: Record<CanonicalFolderType, string> = {
  'INBOX': 'inbox',
  'SENT': 'sentitems',
  'DRAFTS': 'drafts',
  'TRASH': 'deleteditems',
  'SPAM': 'junkemail',
  'ARCHIVE': 'archive',
  'OUTBOX': 'outbox',
  'STARRED': 'inbox', // Microsoft doesn't have starred folder
  'IMPORTANT': 'inbox', // Microsoft doesn't have important folder
  'SOCIAL': 'inbox',
  'PROMOTIONS': 'inbox',
  'UPDATES': 'inbox',
  'FORUMS': 'inbox',
  'PERSONAL': 'inbox',
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
 * Check if a folder type is a system folder
 */
export function isSystemFolder(type: CanonicalFolderType): boolean {
  const systemFolders: CanonicalFolderType[] = [
    'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE', 'IMPORTANT', 'STARRED', 'OUTBOX'
  ];
  return systemFolders.includes(type);
}

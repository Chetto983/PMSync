// ============================================
// Constants - Matching Backend Enums
// These provide type-safe constants while allowing string flexibility
// ============================================

/**
 * Action types that agents can propose
 * Matches: backend/src/modules/ai/voltagent/interfaces/agent-action.interface.ts
 */
export const AgentActionType = {
  // Email actions
  SEND_EMAIL: 'SEND_EMAIL',
  REPLY_EMAIL: 'REPLY_EMAIL',
  FORWARD_EMAIL: 'FORWARD_EMAIL',
  ARCHIVE_EMAIL: 'ARCHIVE_EMAIL',
  DELETE_EMAIL: 'DELETE_EMAIL',
  CATEGORIZE_EMAIL: 'CATEGORIZE_EMAIL',
  LABEL_EMAIL: 'LABEL_EMAIL',
  SEARCH_EMAILS: 'SEARCH_EMAILS',
  MARK_READ: 'MARK_READ',
  MARK_UNREAD: 'MARK_UNREAD',
  STAR_EMAIL: 'STAR_EMAIL',
  UNSTAR_EMAIL: 'UNSTAR_EMAIL',
  GET_UNREAD: 'GET_UNREAD',

  // Folder actions
  CREATE_FOLDER: 'CREATE_FOLDER',
  RENAME_FOLDER: 'RENAME_FOLDER',
  DELETE_FOLDER: 'DELETE_FOLDER',

  // Calendar actions
  CREATE_EVENT: 'CREATE_EVENT',
  UPDATE_EVENT: 'UPDATE_EVENT',
  DELETE_EVENT: 'DELETE_EVENT',
  RESCHEDULE_EVENT: 'RESCHEDULE_EVENT',
  INVITE_ATTENDEES: 'INVITE_ATTENDEES',
  GET_EVENTS: 'GET_EVENTS',
  CHECK_AVAILABILITY: 'CHECK_AVAILABILITY',
  SCHEDULE_MEETING: 'SCHEDULE_MEETING',

  // Contact actions
  CREATE_CONTACT: 'CREATE_CONTACT',
  UPDATE_CONTACT: 'UPDATE_CONTACT',
  DELETE_CONTACT: 'DELETE_CONTACT',
  MERGE_CONTACTS: 'MERGE_CONTACTS',
  ENRICH_CONTACT: 'ENRICH_CONTACT',
  SEARCH_CONTACTS: 'SEARCH_CONTACTS',
  GET_CONTACT: 'GET_CONTACT',

  // Knowledge actions
  SEARCH_KNOWLEDGE: 'SEARCH_KNOWLEDGE',
  ADD_TO_KNOWLEDGE: 'ADD_TO_KNOWLEDGE',

  // General
  NOTIFY_USER: 'NOTIFY_USER',
  NO_ACTION: 'NO_ACTION',
} as const;

/**
 * Severity levels for actions - determines HITL requirements
 */
export const ActionSeverity = {
  LOW: 'LOW',       // Can be auto-executed with high confidence
  MEDIUM: 'MEDIUM', // Requires moderate confidence for auto-execution
  HIGH: 'HIGH',     // Always requires human approval
} as const;

/**
 * Status of a pending action
 */
export const ActionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  EXECUTED: 'EXECUTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED',
} as const;

/**
 * Agent names in the multi-agent system
 */
export const AgentName = {
  ROUTER: 'RouterAgent',
  EMAIL: 'EmailAgent',
  CALENDAR: 'CalendarAgent',
  CONTACTS: 'ContactsAgent',
  SUPERVISOR: 'SupervisorAgent',
} as const;

/**
 * User job roles for personalization
 */
export const JobRole = {
  EXECUTIVE: 'EXECUTIVE',
  MANAGER: 'MANAGER',
  IC: 'IC',
  FREELANCER: 'FREELANCER',
  STUDENT: 'STUDENT',
  OTHER: 'OTHER',
} as const;

/**
 * Company size options
 */
export const CompanySize = {
  SOLO: 'SOLO',
  STARTUP: 'STARTUP',
  SMB: 'SMB',
  ENTERPRISE: 'ENTERPRISE',
} as const;

/**
 * Communication style preferences
 */
export const CommunicationStyle = {
  FORMAL: 'FORMAL',
  CASUAL: 'CASUAL',
  TECHNICAL: 'TECHNICAL',
  CREATIVE: 'CREATIVE',
} as const;

/**
 * Response length preferences
 */
export const ResponseLength = {
  BRIEF: 'BRIEF',
  MODERATE: 'MODERATE',
  DETAILED: 'DETAILED',
} as const;

/**
 * AI proactivity levels
 */
export const ProactivityLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;

/**
 * Notification frequency preferences
 */
export const NotificationFrequency = {
  IMMEDIATE: 'IMMEDIATE',
  DIGEST: 'DIGEST',
  MINIMAL: 'MINIMAL',
} as const;

/**
 * Provider types
 */
export const ProviderType = {
  GOOGLE: 'google',
  MICROSOFT: 'microsoft',
  GENERIC: 'generic',
} as const;

/**
 * Label types
 */
export const LabelType = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
} as const;

/**
 * Folder special use flags
 */
export const FolderSpecialUse = {
  INBOX: '\\Inbox',
  SENT: '\\Sent',
  DRAFTS: '\\Drafts',
  TRASH: '\\Trash',
  SPAM: '\\Spam',
  ALL: '\\All',
  ARCHIVE: '\\Archive',
  FLAGGED: '\\Flagged',
} as const;

/**
 * Calendar event status
 */
export const EventStatus = {
  CONFIRMED: 'confirmed',
  TENTATIVE: 'tentative',
  CANCELLED: 'cancelled',
} as const;

/**
 * Calendar event visibility
 */
export const EventVisibility = {
  DEFAULT: 'default',
  PUBLIC: 'public',
  PRIVATE: 'private',
  CONFIDENTIAL: 'confidential',
} as const;

/**
 * Email tone options for AI composition
 */
export const EmailTone = {
  FORMAL: 'formal',
  CASUAL: 'casual',
  TECHNICAL: 'technical',
} as const;

/**
 * Supported locales
 * Matches: frontend/locales/index.ts
 */
export const SupportedLocales = {
  EN: 'en',
  IT: 'it',
} as const;

/**
 * Theme options
 */
export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

/**
 * Email density options
 */
export const EmailDensity = {
  COMPACT: 'compact',
  COMFORTABLE: 'comfortable',
  SPACIOUS: 'spacious',
} as const;

/**
 * Working days
 */
export const WorkingDays = {
  MON: 'MON',
  TUE: 'TUE',
  WED: 'WED',
  THU: 'THU',
  FRI: 'FRI',
  SAT: 'SAT',
  SUN: 'SUN',
} as const;

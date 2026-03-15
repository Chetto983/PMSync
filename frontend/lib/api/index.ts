/**
 * Centralized API Client Exports
 *
 * Import all API clients from this single file:
 * import { emailApi, aiApi, calendarApi } from '@/lib/api';
 */

// Email API - rebuilt with TanStack Query patterns
export { emailsApi } from './emails';
export type {
  Email,
  EmailAttachment,
  EmailLabel,
  EmailThread,
  EmailStats,
  ListEmailsParams,
  ListEmailsPagination,
  ListEmailsResponse,
  SendEmailDto,
  ReplyEmailDto,
  ForwardEmailDto,
  UpdateEmailDto,
  SaveDraftDto,
  DraftResponse,
  ParsedCalendarInvite,
  CalendarInviteAttendee,
  RespondToInviteDto,
  SendInviteDto,
  SendEmailResponse,
  BulkEmailIdsDto,
  BulkReadDto,
  BulkFlagDto,
  BulkMoveDto,
  BulkLabelsDto,
} from './emails';

export { aiApi } from './ai';
export type {
  ChatMessage,
  ChatSession,
  MemorySearchItem,
} from './ai';

export { analyticsApi } from './analytics';
export type {
  EmailAnalyticsDataPoint,
  EmailAnalyticsResponse,
  EmailStatsResponse,
  ActivityTimelineItem,
  ActivityTimelineResponse,
} from './analytics';

export { calendarApi } from './calendar';
export type {
  CalendarEvent,
  CreateEventDto,
  UpdateEventDto,
  CalendarEventListParams,
  CalendarEventListResponse,
  CalendarSyncResult,
} from './calendar';

export { contactsApi } from './contacts';
export type {
  Contact,
  ContactEmail,
  ContactPhone,
  ContactAddress,
  ContactProviderSummary,
  ListContactsParams,
  ListContactsResponse,
  CreateContactDto,
  UpdateContactDto,
} from './contacts';

export { providersApi } from './providers';
export type {
  ProviderConfig,
  OAuthUrlResponse,
  ProviderAlias,
  ConnectGoogleDto,
  ConnectMicrosoftDto,
  ConnectGenericDto,
} from './providers';

export { labelsApi } from './labels';
export type {
  Label,
  CreateLabelDto,
  UpdateLabelDto,
  AddEmailsToLabelDto,
  ReorderLabelsDto,
  LabelsResponse,
  LabelResponse,
  LabelEmailsResponse,
} from './labels';

export {
  getFolders,
  getFoldersByProvider,
  syncFolders,
  syncAllFolders,
  updateFolderCounts,
} from './folders';
export type {
  Folder,
  Provider,
  FoldersResponse,
  ProviderFoldersResponse,
} from './folders';

export { complianceApi } from './compliance';
export type { GdprStatus } from './compliance';

export { usersApi } from './users';

export { crmApi } from './crm';
export type { ContactRelationshipStats, StaleContactsParams } from './crm';

export { remindersApi, telegramApi } from './reminders';
export type {
  Reminder,
  ReminderPeriodo,
  ReminderAzione,
  ReminderPriorita,
  ReminderCondizioneTipo,
  ReminderStatus,
  CreateReminderDto,
  UpdateReminderDto,
  ListRemindersParams,
  ListRemindersResponse,
  TelegramSettings,
  UpdateTelegramSettingsDto,
} from './reminders';

// Export the base API client for custom requests
export { apiClient } from '../api-client';

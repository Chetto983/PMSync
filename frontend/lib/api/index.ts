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
export type {
  InteractionType,
  ContactRelationshipStats,
  ContactInteraction,
  RelationshipGraphNode,
  StaleContactsParams,
  ReconnectCandidatesParams,
  TopContactsParams,
  InteractionHistoryParams,
  RecordInteractionPayload,
  RelationshipGraphParams,
} from './crm';

export { documentLibraryApi } from './document-library';
export type {
  DocumentLibrary,
  LibraryDocument,
  DocumentCitation,
  DocumentQueryResult,
  CreateLibraryPayload,
  QueryDocumentsPayload,
} from './document-library';

// Export the base API client for custom requests
export { apiClient } from '../api-client';

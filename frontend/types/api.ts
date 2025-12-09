// ============================================
// API Request/Response Types
// Based on backend DTOs
// ============================================

import type {
  Email,
  Folder,
  UserLabel,
  CalendarEvent,
  Contact,
  ProviderConfig,
  ChatSession,
  AgentPendingAction,
  UserPreferences,
  VoltAgentConversation,
  VoltAgentMessage,
} from './entities';

// ============================================
// Generic API Response
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// Auth API
// ============================================

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug: string;
}

export interface LoginResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    tenantId: string;
  };
  token: string;
  requiresMfa?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  tenantName: string;
}

export interface VerifyOtpRequest {
  email: string;
  code: string;
  tenantSlug: string;
}

export interface ForgotPasswordRequest {
  email: string;
  tenantSlug: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// ============================================
// Email API
// ============================================

export interface GetEmailsRequest {
  providerId?: string;
  folder?: string;
  labelId?: string;
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface GetEmailsResponse {
  success: boolean;
  emails: Email[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SendEmailRequest {
  providerId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
  attachments?: EmailAttachmentRequest[];
}

export interface EmailAttachmentRequest {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface UpdateEmailRequest {
  isRead?: boolean;
  isStarred?: boolean;
  isFlagged?: boolean;
  isArchived?: boolean;
  folder?: string;
  labels?: string[];
}

export interface BatchEmailUpdateRequest {
  emailIds: string[];
  updates: UpdateEmailRequest;
}

// ============================================
// Folder API
// ============================================

export interface GetFoldersResponse {
  success: boolean;
  folders: Folder[];
}

export interface CreateFolderRequest {
  providerId: string;
  name: string;
  parentPath?: string;
}

// ============================================
// Label API
// ============================================

export interface GetLabelsResponse {
  success: boolean;
  labels: UserLabel[];
}

export interface CreateLabelRequest {
  name: string;
  color?: {
    backgroundColor: string;
    textColor: string;
  };
  icon?: string;
  parentId?: string;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: {
    backgroundColor: string;
    textColor: string;
  } | null;
  icon?: string | null;
  parentId?: string | null;
  orderIndex?: number;
}

export interface AddEmailsToLabelRequest {
  emailIds: string[];
}

export interface ReorderLabelsRequest {
  labelIds: string[];
}

// ============================================
// Calendar API
// ============================================

export interface GetCalendarEventsRequest {
  providerId?: string;
  calendarId?: string;
  startDate: string; // ISO date string
  endDate: string;
  timeZone?: string;
}

export interface GetCalendarEventsResponse {
  success: boolean;
  events: CalendarEvent[];
}

export interface CreateCalendarEventRequest {
  providerId: string;
  calendarId?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string; // ISO datetime
  endTime: string;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{ email: string; displayName?: string; optional?: boolean }>;
  recurrence?: string[];
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method: 'email' | 'popup'; minutes: number }>;
  };
}

export interface UpdateCalendarEventRequest {
  title?: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{ email: string; displayName?: string; optional?: boolean }>;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

// ============================================
// Contacts API
// ============================================

export interface GetContactsRequest {
  search?: string;
  tags?: string[];
  isFavorite?: boolean;
  page?: number;
  limit?: number;
}

export interface GetContactsResponse {
  success: boolean;
  contacts: Contact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateContactRequest {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  emails?: Array<{ email: string; type?: string; isPrimary?: boolean }>;
  phoneNumbers?: Array<{ number: string; type?: string; isPrimary?: boolean }>;
  addresses?: Array<{
    street?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    type?: string;
  }>;
  company?: string;
  jobTitle?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateContactRequest extends Partial<CreateContactRequest> {
  isStarred?: boolean;
  isFavorite?: boolean;
}

// ============================================
// Provider API
// ============================================

export interface GetProvidersResponse {
  success: boolean;
  providers: ProviderConfig[];
}

export interface ConnectGoogleRequest {
  code: string;
  redirectUri: string;
}

export interface ConnectMicrosoftRequest {
  code: string;
  redirectUri: string;
}

export interface ConnectGenericImapRequest {
  email: string;
  displayName?: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  imapPassword: string;
  imapUseTls?: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpUseTls?: boolean;
}

export interface UpdateProviderRequest {
  displayName?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

// ============================================
// AI API
// ============================================

// Classic Chat
export interface ChatRequest {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  conversationId?: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
}

// Agent API
export interface AgentRequest {
  message: string;
  sessionId?: string;
  history?: Array<{
    role: string;
    content: string;
    steps?: Array<{ tool: string; output: string }>;
  }>;
  locale?: string;
}

export interface AgentResponse {
  success: boolean;
  sessionId: string;
  session: Record<string, unknown>;
  messages: Array<{
    role: string;
    content: string;
    steps?: Array<{ tool: string; output: string }>;
  }>;
  response: string;
  steps: Array<{ tool: string; output: string }>;
}

// Chat Sessions
export interface CreateSessionRequest {
  locale?: string;
}

export interface GetSessionsResponse {
  success: boolean;
  sessions: ChatSession[];
}

export interface GetSessionResponse {
  success: boolean;
  session: ChatSession;
}

// Email AI Operations
export interface EmailAiRequest {
  locale?: string;
  tone?: 'formal' | 'casual' | 'technical';
}

export interface SummarizeResponse {
  success: boolean;
  summary: string;
}

export interface SmartReplyResponse {
  success: boolean;
  suggestions: string[];
}

export interface CategorizeResponse {
  success: boolean;
  labels: string[];
}

// Compose with AI
export interface ComposeEmailRequest {
  prompt: string;
  to?: string[];
  subject?: string;
  tone?: 'formal' | 'casual' | 'technical';
  locale?: string;
  variant?: string;
  threadContext?: Array<{ subject?: string; body?: string }>;
}

export interface ComposeEmailResponse {
  success: boolean;
  body: string;
  subject?: string;
  variantUsed?: string;
}

// Pending Actions
export interface GetPendingActionsRequest {
  status?: 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'EXPIRED';
  agentName?: string;
  limit?: number;
}

export interface GetPendingActionsResponse {
  success: boolean;
  actions: AgentPendingAction[];
}

export interface ApproveActionRequest {
  feedback?: string;
}

export interface RejectActionRequest {
  reason: string;
}

// ============================================
// VoltAgent API
// ============================================

export interface VoltAgentChatRequest {
  message: string;
  conversationId?: string;
  locale?: string;
}

export interface VoltAgentChatResponse {
  success: boolean;
  conversationId: string;
  response: string;
  messages: VoltAgentMessage[];
  toolCalls?: Array<{ name: string; output: unknown }>;
}

export interface GetVoltAgentConversationsResponse {
  success: boolean;
  conversations: VoltAgentConversation[];
}

export interface GetVoltAgentConversationResponse {
  success: boolean;
  conversation: VoltAgentConversation;
  messages: VoltAgentMessage[];
}

// ============================================
// User API
// ============================================

export interface GetCurrentUserResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    tenantId: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
  };
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
}

// Using type alias instead of empty interface to avoid ESLint no-empty-object-type error
export type UpdatePreferencesRequest = Partial<Omit<UserPreferences, 'id' | 'userId'>>;

export interface GetPreferencesResponse {
  success: boolean;
  preferences: UserPreferences;
}

// ============================================
// Analytics API
// ============================================

export interface EmailStatsResponse {
  success: boolean;
  stats: {
    total: number;
    unread: number;
    starred: number;
    byFolder: Record<string, number>;
    byProvider: Record<string, number>;
    receivedToday: number;
    sentToday: number;
  };
}

export interface CalendarStatsResponse {
  success: boolean;
  stats: {
    totalEvents: number;
    upcomingToday: number;
    upcomingWeek: number;
    byCalendar: Record<string, number>;
  };
}

export interface AiUsageStatsResponse {
  success: boolean;
  stats: {
    totalRequests: number;
    tokensUsed: number;
    pendingActions: number;
    approvalRate: number;
  };
}

// ============================================
// Sync API
// ============================================

export interface SyncStatusResponse {
  success: boolean;
  providers: Array<{
    id: string;
    email: string;
    providerType: string;
    lastSyncedAt: Date | null;
    status: 'idle' | 'syncing' | 'error';
    error?: string;
  }>;
}

export interface TriggerSyncRequest {
  providerId: string;
  syncType?: 'full' | 'delta';
}

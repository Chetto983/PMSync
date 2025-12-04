// ============================================
// Entity Types - Based on Prisma Schema
// ============================================

// User & Auth
export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  isActive: boolean;
  isMfaEnabled: boolean;
  lastLogin?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  id: string;
  userId: string;
  folderOrders?: Record<string, number> | null;
  sidebarSmartFiltersExpanded: boolean;
  sidebarLabelsExpanded: boolean;
  theme?: string | null;
  language?: string | null;
  timezone?: string | null;
  emailDensity?: string | null;

  // AI Preferences
  aiSmartRepliesEnabled: boolean;
  aiSummarizationEnabled: boolean;
  aiSchedulingEnabled: boolean;
  aiAutoApproveThreshold?: number | null;

  // Personalization
  jobTitle?: string | null;
  jobRole?: string | null;
  department?: string | null;
  industry?: string | null;
  companySize?: string | null;
  communicationStyle?: string | null;
  responseLength?: string | null;
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
  workingDays: string[];
  proactivityLevel?: string | null;
  notificationFrequency?: string | null;
}


// Tenant
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Provider
export interface ProviderConfig {
  id: string;
  tenantId: string;
  userId?: string | null;
  providerType: string;
  email: string;
  displayName?: string | null;
  supportsEmail: boolean;
  supportsCalendar: boolean;
  supportsContacts: boolean;
  isDefault: boolean;
  isActive: boolean;
  lastSyncedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown> | null;
}


// Email
export interface Email {
  id: string;
  tenantId: string;
  providerId: string;
  externalId: string;
  threadId?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string | null;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  snippet?: string | null;
  folder: string;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  isDraft: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  sentAt: Date;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  size?: number | null;
  attachments?: EmailAttachment[];
  emailLabels?: EmailLabel[];
  hasCalendarInvite?: boolean;
  calendarInviteStatus?: 'pending' | 'accepted' | 'declined' | 'tentative';
  calendarInviteData?: ParsedCalendarInvite | null;
}

export interface EmailAttachment {
  id: string;
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string | null;
  storageType: string;
  storagePath?: string | null;
  isInline: boolean;
}

export interface EmailLabel {
  id: string;
  emailId: string;
  labelId: string;
  createdAt: Date;
  label?: UserLabel;
}

export interface CalendarInviteAttendee {
  email: string;
  name?: string;
  status?: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
  role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'CHAIR' | 'NON-PARTICIPANT';
  rsvp?: boolean;
}

export interface ParsedCalendarInvite {
  uid: string;
  method: 'REQUEST' | 'REPLY' | 'CANCEL' | 'PUBLISH' | 'ADD' | 'REFRESH' | 'COUNTER' | 'DECLINECOUNTER';
  sequence: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  startTime: string | Date;
  endTime: string | Date;
  isAllDay: boolean;
  timezone?: string;
  recurrence?: string[];
  recurringEventId?: string;
  organizer: {
    email: string;
    name?: string;
  };
  attendees: CalendarInviteAttendee[];
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
  created?: string | Date;
  lastModified?: string | Date;
  rawIcs?: string;
}

// Folder
export interface Folder {
  id: string;
  tenantId: string;
  providerId: string;
  name: string;
  path: string;
  externalId?: string | null;
  delimiter: string;
  parentId?: string | null;
  level: number;
  isSelectable: boolean;
  specialUse?: string | null;
  attributes: string[];
  totalCount: number;
  unreadCount: number;
  recentCount: number;
  unseenCount: number;
  children?: Folder[];
}


// Labels
export interface UserLabel {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  type: string;
  color?: LabelColor | null;
  icon?: string | null;
  parentId?: string | null;
  level: number;
  orderIndex: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  children?: UserLabel[];
  emailCount?: number;
}

export interface LabelColor {
  backgroundColor: string;
  textColor: string;
}

// Calendar
export interface CalendarEvent {
  id: string;
  tenantId: string;
  providerId: string;
  externalId: string;
  calendarId?: string | null;
  iCalUID?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  organizer?: string | null;
  attendees?: CalendarAttendee[] | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  timeZone: string;
  recurrence: string[];
  recurringEventId?: string | null;
  status: string;
  visibility: string;
  isDeleted: boolean;
  isCancelled: boolean;
  reminders?: EventReminder | null;
  createdAt: Date;
  updatedAt: Date;
  htmlLink?: string | null;
  calendarName?: string | null;
  attachments?: CalendarEventAttachment[];
}

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  self?: boolean;
  organizer?: boolean;
  optional?: boolean;
}

export interface EventReminder {
  useDefault?: boolean;
  overrides?: Array<{ method: 'email' | 'popup'; minutes: number }>;
}


export interface CalendarEventAttachment {
  id: string;
  eventId: string;
  filename: string;
  mimeType: string;
  size: number;
  fileUrl?: string | null;
  iconLink?: string | null;
}

// Contacts
export interface Contact {
  id: string;
  tenantId: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  prefix?: string | null;
  suffix?: string | null;
  emails?: ContactEmail[] | null;
  phoneNumbers?: ContactPhone[] | null;
  addresses?: ContactAddress[] | null;
  company?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  birthday?: Date | null;
  anniversary?: Date | null;
  websites?: ContactWebsite[] | null;
  socialProfiles?: ContactSocialProfile[] | null;
  notes?: string | null;
  tags: string[];
  photoUrl?: string | null;
  isDeleted: boolean;
  isStarred: boolean;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  providerContacts?: ProviderContact[];
}

export interface ContactEmail {
  email: string;
  type?: string;
  isPrimary?: boolean;
}

export interface ContactPhone {
  number: string;
  type?: string;
  isPrimary?: boolean;
}

export interface ContactAddress {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  type?: string;
}

export interface ContactWebsite {
  url: string;
  type?: string;
}

export interface ContactSocialProfile {
  type: string;
  value: string;
}

export interface ProviderContact {
  id: string;
  contactId: string;
  tenantId: string;
  providerId: string;
  externalId: string;
  displayName?: string | null;
  lastSyncedAt: Date;
}

// AI - Chat Sessions
export interface ChatSession {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  steps?: Array<{ tool: string; output: string }>;
  timestamp?: Date;
}

// AI - Agent Pending Actions
export interface AgentPendingAction {
  id: string;
  sessionId?: string | null;
  tenantId: string;
  userId: string;
  agentName: string;
  actionType: string;
  payload: Record<string, unknown>;
  confidence: number;
  adjustedConfidence?: number | null;
  severity: string;
  status: string;
  reasoningSteps?: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  executedAt?: Date | null;
  rejectedAt?: Date | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
}

// VoltAgent Conversations
export interface VoltAgentConversation {
  id: string;
  tenantId: string;
  userId: string;
  title?: string | null;
  locale: string;
  lastActiveAt: Date;
  messageCount: number;
  isSummarized: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  messages?: VoltAgentMessage[];
}

export interface VoltAgentMessage {
  id: string;
  conversationId: string;
  tenantId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[] | null;
  toolResults?: ToolResult[] | null;
  messageIndex: number;
  tokenCount?: number | null;
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  result: unknown;
  error?: string;
}

// Writing Style Profile
export interface WritingStyleProfile {
  id: string;
  tenantId: string;
  userId: string;
  avgSentenceLength: number;
  avgParagraphLines: number;
  avgWordsPerEmail: number;
  bulletListRate: number;
  formalityScore: number;
  contractionRate: number;
  emojiRate: number;
  typeTokenRatio: number;
  exclamationRate: number;
  questionRate: number;
  ellipsisRate: number;
  greetingPresent: boolean;
  preferredGreetings: string[];
  signOffPresent: boolean;
  preferredSignOffs: string[];
  sentimentPolarity: number;
  empathyPhraseRate: number;
  hedgeRate: number;
  sampleCount: number;
  lastAnalyzed: Date;
}

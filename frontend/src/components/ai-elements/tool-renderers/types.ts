/**
 * TypeScript interfaces for VoltAgent tool output shapes.
 * Used by smart tool renderers to parse and display structured data.
 */

// --- Renderer Props ---

export interface ToolRendererProps {
  output: unknown;
  errorText?: string;
  toolName?: string;
  onAction?: (action: ArtifactAction) => void;
}

// --- Action Types ---

export type ArtifactAction =
  | { type: 'navigate'; route: string }
  | { type: 'send-message'; message: string }
  | { type: 'api-call'; fn: () => Promise<unknown> };

// --- Email Tool Outputs ---

export interface EmailIndexItem {
  idx: number;
  id: string;
  from: string;
  subject: string;
  date: string;
  preview: string;
  unread?: boolean;
  starred?: boolean;
}

export interface EmailIndexResult {
  success?: boolean;
  error?: string;
  count: number;
  index: EmailIndexItem[];
  searchType?: 'semantic' | 'text';
  hint?: string;
}

export interface EmailSearchItem {
  id: string;
  subject: string | null;
  from: string;
  snippet: string | null;
  receivedAt: string | null;
  isRead?: boolean;
  isStarred?: boolean;
  aiPriority: number | null;
  aiSentiment: string | null;
  aiLabels: string[] | null;
  relevanceScore?: number;
}

export interface EmailSearchResult {
  success?: boolean;
  error?: string;
  data: EmailSearchItem[];
  summary?: string;
  searchType?: 'rag' | 'text';
}

export interface EmailContentItem {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string | null;
  content: string;
  date: string | null;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  hasAttachments: boolean;
  attachments: string[];
}

export interface EmailContentResult {
  success?: boolean;
  error?: string;
  count: number;
  emails: EmailContentItem[];
}

// --- Follow-Up Tool Output ---

export interface FollowUpItem {
  followUpId: string;
  status: string;
  reason: string | null;
  dueDate: string | null;
  emailType: string | null;
  confidence: number | null;
  remindCount: number;
  lastRemindedAt: string | null;
  email: {
    id: string;
    subject: string | null;
    from: string;
    receivedAt: string | null;
    aiPriority: number | null;
    aiSentiment: string | null;
  };
}

export interface FollowUpResult {
  error?: string;
  message?: string;
  count: number;
  status?: string;
  followUps: FollowUpItem[];
}

// --- Contact Tool Output ---

export interface ContactItem {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  emails: Array<{ value: string; type?: string }>;
  phoneNumbers?: unknown;
  company: string | null;
  jobTitle: string | null;
}

export interface ContactSearchResult {
  success?: boolean;
  error?: string;
  data: ContactItem[];
  summary?: string;
}

// --- Event Tool Output ---

export interface EventItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  isAllDay: boolean;
  startTime: string | null;
  endTime: string | null;
  startTimeFormatted?: string;
  endTimeFormatted?: string;
}

export interface EventResult {
  success?: boolean;
  error?: string;
  data: EventItem[];
  summary?: string;
}

// --- Count Tool Output ---

export interface CountResult {
  success?: boolean;
  error?: string;
  data: {
    total: number;
    unread: number;
    read: number;
    period: string;
    folder: string;
  };
  summary?: string;
}

// --- Folder Tool Output ---

export interface FolderItem {
  id: string;
  name: string;
  path: string;
  level: number;
  unreadCount: number;
  totalCount: number;
  providerId?: string;
}

export interface FolderResult {
  success?: boolean;
  error?: string;
  folders: FolderItem[];
  count: number;
}

// --- Analysis Tool Output ---

export interface AnalysisResult {
  error?: string;
  emailId: string;
  subject: string | null;
  from: string;
  receivedAt: string | null;
  summary: string;
  analysis: {
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    tone: string;
    urgency: 'critical' | 'high' | 'medium' | 'low';
    intent: string;
    priority: number;
    escalationRisk?: number;
    keyTopics: string[];
    suggestedResponse: string;
    deadline: string | null;
    confidence: number;
    reasoning?: string | null;
  };
  hasDeadline: boolean;
  needsFollowUp: boolean;
  suggestedLabels: string[];
  smartReplies?: string[];
}

// --- Memory Tool Output ---

export interface MemoryItem {
  content: string;
  type: 'FACT' | 'PREFERENCE' | 'CONTACT_NOTE' | 'PATTERN';
  category: string | null;
  score: number;
  createdAt: string;
}

export interface MemorySearchResult {
  success?: boolean;
  error?: string;
  message?: string;
  memories: MemoryItem[];
}

// --- Briefing Tool Output ---

export interface BriefingSectionItem {
  title: string;
  detail?: string;
}

export interface BriefingResult {
  success?: boolean;
  error?: string;
  generatedAt: string;
  validUntil: string;
  stats: {
    totalUnread: number;
    newToday: number;
    highPriority: number;
  };
  summary: {
    summary: string;
    highlights: string[];
  };
  followUps: {
    pending: number;
    overdue: number;
    dueToday: number;
    message: string;
  };
  deadlines: {
    count: number;
    message: string;
    items: BriefingSectionItem[];
  };
  actionItems: {
    count: number;
    message: string;
    items: BriefingSectionItem[];
  };
  calendar: {
    hasEvents: boolean;
    message: string;
  };
}

// --- CRM Tool Output ---

export interface CrmContactStat {
  contactId: string;
  displayName: string;
  email: string;
  relationshipScore: number;
  lastInteraction: string | null;
  interactionCount: number;
  staleDays?: number;
}

export interface CrmResult {
  success?: boolean;
  error?: string;
  summary?: string;
  contacts: CrmContactStat[];
  totalContacts?: number;
  averageScore?: number;
}

// --- Bulk Action / Triage Tool Output ---

export interface BulkActionResult {
  success?: boolean;
  error?: string;
  requiresApproval?: boolean;
  actionType?: string;
  severity?: string;
  summary?: string;
  payload?: {
    emailIds?: string[];
    labelNames?: string[];
    labelIds?: string[];
    reason?: string;
    dueDays?: number;
    count?: number;
    skipped?: number;
    folder?: string;
    permanent?: boolean;
  };
  data?: {
    count?: number;
    jobId?: string;
    [key: string]: unknown;
  };
}

// --- Generic / Fallback ---

export interface GenericToolResult {
  success?: boolean;
  error?: string;
  message?: string;
  summary?: string;
  data?: unknown;
  [key: string]: unknown;
}

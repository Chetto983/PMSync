/**
 * Shared types for assistant-ui chat components.
 * All tool output types inlined directly (previously in ai-elements/tool-renderers/types.ts).
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
  /** Backend returns `date` from search_emails */
  date?: string | null;
  receivedAt?: string | null;
  isRead?: boolean;
  isStarred?: boolean;
  labels?: string[];
  aiPriority: number | null;
  aiSentiment: string | null;
  aiLabels: string[] | null;
  relevanceScore?: number;
}

export interface EmailSearchResult {
  success?: boolean;
  error?: string;
  /** Backend returns `results` array from search_emails tool */
  results?: EmailSearchItem[];
  count?: number;
  summary?: string;
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

/** Backend read_email returns a single email object (not wrapped in array) */
export type EmailContentResult = EmailContentItem & {
  error?: string;
  bodyText?: string;
  snippet?: string;
  labels?: string[];
  analysis?: {
    summary: string | null;
    keyPoints: string[];
    sentiment: string | null;
    priority: number | null;
    category: string | null;
    hasDeadline: boolean;
    deadlineDate: string | null;
    needsFollowUp: boolean;
    followUpDate: string | null;
    suggestedActions: string | null;
  } | null;
};

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
  /** Backend tool returns `name` (display name string) */
  name?: string;
  /** Legacy fields from raw contact model */
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Backend tool returns `email` (primary email string) */
  email?: string;
  /** Legacy field from raw contact model */
  emails?: Array<{ value: string; type?: string }>;
  phoneNumbers?: string[] | unknown;
  company: string | null;
  jobTitle: string | null;
}

export interface ContactSearchResult {
  success?: boolean;
  error?: string;
  contacts: ContactItem[];
  count?: number;
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
  /** Backend returns `events` array from view_calendar tool */
  events?: EventItem[];
  count?: number;
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
  /** Backend semantic_search returns `results` array */
  results?: MemoryItem[];
  count?: number;
}

export interface SavedMemoryResult {
  id: string;
  content: string;
  category: string | null;
  savedAt: string;
}

export interface AskUserResult {
  type: 'clarification_request';
  question: string;
  options: string[];
  context: string | null;
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

// --- CRM Deal Tool Outputs ---

export interface CrmDealItem {
  id: string;
  name: string;
  amount: number | null;
  currency?: string;
  stage: string;
  probability?: number;
  account?: string | null;
  score?: number | null;
  priority?: string | null;
  expectedClose?: string | null;
  created?: string;
}

export interface CrmDealListResult {
  error?: string;
  pipeline?: string;
  deals?: CrmDealItem[];
  count?: number;
}

export interface CrmDealMoveResult {
  error?: string;
  status?: string;
  deal?: string;
  from?: string;
  to?: string;
  probability?: number;
  message?: string;
}

export interface CrmTimelineActivity {
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
  date: string;
}

export interface CrmTimelineResult {
  error?: string;
  deal?: string;
  currentStage?: string;
  created?: string;
  activities?: CrmTimelineActivity[];
  count?: number;
}

// --- CRM Intelligence Tool Outputs ---

export interface CrmLeadScoreResult {
  error?: string;
  contactId?: string;
  contactName?: string;
  score?: number;
  tier?: 'hot' | 'warm' | 'cold';
  confidence?: number;
  features?: Record<string, unknown>;
  computedAt?: string;
}

export interface CrmTopLead {
  contactId: string;
  name: string;
  email?: string | null;
  score: number;
  tier: 'hot' | 'warm' | 'cold';
  confidence?: number;
}

export interface CrmTopLeadsResult {
  error?: string;
  leads?: CrmTopLead[];
  count?: number;
}

export interface CrmForecastPeriod {
  label: string;
  predicted: number;
  confidenceLow?: number | null;
  confidenceHigh?: number | null;
  actual?: number | null;
}

export interface CrmForecastResult {
  error?: string;
  pipeline?: string;
  period?: string;
  method?: string;
  mae?: number;
  forecasts?: CrmForecastPeriod[];
}

export interface CrmChurnRiskResult {
  error?: string;
  message?: string;
  contactId?: string | null;
  accountId?: string | null;
  contactName?: string | null;
  accountName?: string | null;
  riskLevel?: string;
  probability?: number;
  signals?: unknown[];
  reasoning?: string;
  computedAt?: string;
}

export interface CrmChurnAtRiskItem {
  contactId?: string | null;
  accountId?: string | null;
  name: string;
  riskLevel: string;
  probability: number;
  topSignal?: unknown;
}

export interface CrmChurnAtRiskResult {
  error?: string;
  atRisk?: CrmChurnAtRiskItem[];
  count?: number;
}

export interface CrmAiCostFeature {
  feature: string;
  cost: string;
  tokens: number;
  calls: number;
}

export interface CrmAiCostsResult {
  error?: string;
  range?: string;
  features?: CrmAiCostFeature[];
  totalCost?: string;
  totalTokens?: number;
}

export interface CrmModelEntry {
  modelType: string;
  version: string;
  isActive: boolean;
  lastTrained: string;
  accuracy: number | null;
}

export interface CrmModelPerformanceResult {
  error?: string;
  models?: CrmModelEntry[];
  recentAccuracy?: Array<{
    date: string;
    modelType: string;
    metric: string;
    value: number;
  }>;
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

// --- Chat-specific Types ---

/** Backend conversation summary shape from GET /api/v1/ai/chat/conversations */
export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  messageCount: number;
}

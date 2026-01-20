/**
 * VoltAgent Locales
 *
 * Centralized localization for VoltAgent.
 * To add a new language:
 * 1. Create a new file (e.g., de.ts for German)
 * 2. Copy en.ts as template
 * 3. Translate all strings
 * 4. Add to locales object below
 * 5. Add language code to SupportedLocale type
 */
import { en } from './en';
import { it } from './it';

/**
 * Supported locales
 */
export type SupportedLocale = 'en' | 'it';

/**
 * Translation structure for tools
 */
export interface ToolTranslations {
  email: {
    sent: (to: string, subject: string) => string;
    replied: (subject: string) => string;
    forwarded: (to: string) => string;
    searched: (count: number, query: string) => string;
    deleted: (subject: string) => string;
    archived: (subject: string) => string;
    markedRead: (subject: string) => string;
    markedUnread: (subject: string) => string;
    starred: (subject: string) => string;
    unstarred: (subject: string) => string;
    unreadCount: (count: number) => string;
    moved: (subject: string, folder: string) => string;
    labeled: (subject: string, label: string) => string;
    unlabeled: (subject: string, label: string) => string;
    noSubject: string;
    serviceUnavailable: string;
    notFound: string;
    requiresApproval: string;
  };
  calendar: {
    eventsFound: (count: number) => string;
    eventCreated: (title: string, date: string) => string;
    eventUpdated: (title: string) => string;
    eventDeleted: (title: string) => string;
    slotAvailable: string;
    slotConflict: (count: number) => string;
    serviceUnavailable: string;
    notFound: string;
    requiresApproval: string;
  };
  contacts: {
    found: (count: number, query: string) => string;
    contact: string;
    created: (name: string) => string;
    updated: (name: string) => string;
    deleted: (name: string) => string;
    alreadyExists: (email: string) => string;
    notFound: string;
    requiresApproval: string;
  };
  knowledge: {
    found: (count: number) => string;
    noResults: string;
    // P1.6 Unified Knowledge Agent
    instructions: string;
    remembered: string;
    sources: {
      emails: string;
      deadlines: string;
      followups: string;
      actions: string;
      memories: string;
    };
  };
  webSearch: {
    description: string;
    queryDescription: string;
    sources: string;
    searchFailed: (error: string) => string;
    noResults: string;
  };
  analytics: {
    description: string;
    queryDescription: string;
    analysisFailed: (error: string) => string;
    noData: string;
    insights: string;
  };
  documentLibrary: {
    description: string;
    queryDescription: string;
    listDescription: string;
    createDescription: string;
    queryFailed: (error: string) => string;
    listFailed: (error: string) => string;
    noLibraries: string;
    noDocuments: string;
    sources: string;
  };
  folder: {
    created: (name: string) => string;
    renamed: (oldName: string, newName: string) => string;
    deleted: (name: string) => string;
    emailMoved: (subject: string, folder: string) => string;
    notFound: string;
    requiresApproval: string;
  };
  common: {
    success: string;
    error: string;
    pending: string;
    approved: string;
    rejected: string;
    executed: string;
  };
  insights: {
    summarize: {
      description: string;
      systemPrompt: string;
    };
    sentiment: {
      description: string;
      systemPrompt: string;
    };
    // 2025 Best Practices - Aspect-Based Sentiment Analysis (ABSA)
    sentimentDeep: {
      description: string;
      systemPrompt: string;
    };
    priority: {
      description: string;
      systemPrompt: string;
    };
    analyzeComprehensive: {
      description: string;
      systemPrompt: string;
    };
    compose: {
      description: string;
      systemPrompt: (toneInstruction: string, language: string) => string;
      originalEmail: string;
      replyInstructions: string;
      // Compose prompt strings
      recipients: string;
      subjectHint: string;
      requestedTone: string;
      senderName: string;
      signatureInstruction: string;
      threadContext: string;
      message: string;
      draftInstruction: string;
      userPrompt: string;
      jsonInstruction: string;
      // Language names for AI prompt
      languageNames?: {
        en: string;
        it: string;
      };
    };
    actionItems: {
      description: string;
      systemPrompt: string;
    };
    categorize: {
      description: string;
      systemPrompt: (labels: string) => string;
    };
    smartReplies: {
      description: string;
      systemPrompt: (toneInstruction: string) => string;
    };
    // Enhanced 2025 tools
    analyze: {
      description: string;
    };
    detectIntent: {
      description: string;
    };
    calculatePriority: {
      description: string;
    };
    tones: {
      formal: string;
      casual: string;
      technical: string;
    };
    emailBody: string;
    noSubject: string;
    contentUnavailable: string;
    // Email header labels
    subject: string;
    from: string;
    to: string;
  };
}

/**
 * Translation structure for agents
 */
export interface AgentTranslations {
  supervisor: {
    instructions: string;
    delegateEmail: string;
    delegateCalendar: string;
    delegateContacts: string;
    delegateKnowledge: string;
    delegateGeneral: string;
    delegateWebSearch: string;
  };
  email: {
    instructions: string;
    confirmBeforeSend: string;
  };
  calendar: {
    instructions: string;
  };
  contacts: {
    instructions: string;
  };
  knowledge: {
    instructions: string;
  };
  general: {
    instructions: string;
  };
  webSearch: {
    instructions: string;
  };
  analytics: {
    instructions: string;
  };
  documentLibrary: {
    instructions: string;
  };
  // Phase 3: Consolidated agents (10 → 3)
  actions: {
    instructions: string;
  };
  intelligence: {
    instructions: string;
  };
}

/**
 * Observability translations for logging and metrics
 */
export interface ObservabilityTranslations {
  agent: {
    operationStarted: string;
    operationCompleted: string;
    operationFailed: string;
  };
  tool: {
    executionStarted: string;
    executionCompleted: string;
    executionFailed: string;
  };
  hitl: {
    actionAutoApproved: string;
    actionSuspended: string;
    actionApprovedByHuman: string;
    actionRejectedByHuman: string;
    actionExecuted: string;
    actionExecutionFailed: string;
    requiresApproval: (reason: string) => string;
    highSeverityAction: string;
    lowConfidenceAction: string;
  };
  learning: {
    feedbackRecorded: string;
    profileUpdated: string;
    confidenceAdjusted: string;
    learningApplied: (boost: number) => string;
    noLearningData: string;
    profileReset: string;
  };
}

/**
 * Action summary translations for ActionExecutorService
 */
export interface ActionSummaryTranslations {
  emailSent: (to: string, subject: string) => string;
  emailSentNoSubject: string;
  replySent: (to: string) => string;
  emailForwarded: (to: string) => string;
  emailDeleted: (subject: string) => string;
  emailArchived: (subject: string) => string;
  emailMarkedRead: string;
  emailMarkedUnread: string;
  emailStarred: string;
  emailUnstarred: string;
  emailsSearchFound: (count: number, query: string) => string;
  emailsSearchNotFound: (query: string) => string;
  labelsAdded: (labels: string) => string;
  labelsRemoved: (labels: string) => string;
  labelsAddedAndRemoved: (added: string, removed: string) => string;
  emailCategorized: (categories: string) => string;
  unreadEmailsFound: (count: number) => string;
  eventCreated: (title: string, date: string) => string;
  eventUpdated: (title: string) => string;
  eventDeleted: (title: string) => string;
  eventsFound: (count: number) => string;
  availabilityFree: (count: number) => string;
  availabilityBusy: (count: number) => string;
  eventRescheduled: (title: string, date: string) => string;
  contactCreated: (name: string) => string;
  contactUpdated: (name: string) => string;
  contactDeleted: (name: string) => string;
  contactsSearchFound: (count: number, query: string) => string;
  contactsSearchNotFound: (query: string) => string;
  contactsMerged: (count: number, name: string, removed: number) => string;
  contactFound: (name: string) => string;
  contactNotFound: string;
  folderCreated: (name: string) => string;
  folderRenamed: (name: string) => string;
  folderDeleted: (path: string) => string;
  // Bulk email actions
  bulkDeleteQueued: (count: number, folder: string) => string;
  bulkArchiveQueued: (count: number) => string;
  bulkMarkReadQueued: (count: number) => string;
  bulkMoveQueued: (count: number, folder: string) => string;
  noSubject: string;
  unknownSender: string;
  event: string;
  contact: string;
}

/**
 * MistralService translations for AI responses
 */
export interface MistralTranslations {
  title: {
    system: string;
    conversationLabel: string;
    titleLabel: string;
    defaultTitle: string;
  };
  roles: {
    assistant: string;
    user: string;
  };
  rag: {
    sourceLabel: (index: number) => string;
    contextIntro: string;
  };
  errors: {
    emptyResponse: string;
    notConfigured: string;
    unavailable: string;
    unauthorized: string;
    serverError: string;
    tryAgain: string;
    toolExecution: (error: string) => string;
    retryPrompt: (error: string) => string;
  };
}

/**
 * Deadline extraction keywords for NLP parsing (chrono-node)
 */
export interface DeadlineKeywordsTranslations {
  /** Keywords that indicate a deadline (e.g., "deadline", "due", "scadenza") */
  deadlineKeywords: string[];
  /** Keywords that indicate urgency (boost confidence) */
  urgencyKeywords: string[];
  /** Regex patterns for recurring deadlines */
  recurringPatterns: RegExp[];
}

/**
 * Follow-up detection translations for RAG queries
 */
export interface FollowUpTranslations {
  /** Semantic query for RAG follow-up detection */
  ragQuery: string;
  /** Reason text for high confidence detections */
  highConfidenceReason: string;
  /** Reason text for LLM-verified detections */
  verifiedReason: string;
}

/**
 * Daily briefing translations
 */
export interface BriefingTranslations {
  quotaExceeded: string;
  emptyInbox: string;
  fallbackSummary: (unread: number, today: number) => string;
  emailFrom: string;
  aiPromptLanguage: string;
  followUps: {
    overdue: (count: number) => string;
    dueToday: (count: number) => string;
    pending: (count: number) => string;
    none: string;
    unavailable: string;
  };
  deadlines: {
    placeholder: string;
  };
  actionItems: {
    placeholder: string;
  };
  calendar: {
    available: string;
    unavailable: string;
  };
}

/**
 * HTTP and validation error translations
 */
export interface ErrorTranslations {
  http: {
    forbidden: {
      admin: string;
      crossTenant: string;
    };
    notFound: {
      library: string;
      document: string;
      file: string;
      email: string;
      contact: string;
    };
    badRequest: {
      noFile: string;
      unsupportedFileType: (mimeType: string, supported: string) => string;
      fileTooLarge: (limitMb: number) => string;
      invalidInput: string;
    };
  };
  validation: {
    embedding: {
      notArray: string;
      empty: string;
      tooLarge: (max: number) => string;
      invalidValue: (index: number) => string;
    };
  };
  ai: {
    quotaExceeded: string;
    costLimitDaily: string;
    costLimitMonthly: string;
    agentFailed: string;
    providerNotConfigured: string;
    approvalNotInitialized: string;
  };
  subscription: {
    canceled: string;
    pastDue: string;
    featureNotAvailable: (feature: string) => string;
    emailQuotaExceeded: (limit: number) => string;
  };
}

/**
 * Router intent patterns for model routing service (multilingual support)
 * Patterns are strings that will be converted to RegExp at runtime
 */
export interface RouterPatternsTranslations {
  /** WRITE operations → ActionsAgent (destructive/mutating operations requiring HITL) */
  writeOps: string[];
  /** READ operations → IntelligenceAgent (search, list, analyze - non-destructive) */
  readOps: string[];
  /** Simple queries → handled directly by Supervisor (greetings, basic questions) */
  simple: string[];
  /** Complexity: simple patterns */
  complexitySimple: string[];
  /** Complexity: moderate patterns */
  complexityModerate: string[];
  /** Complexity: complex patterns */
  complexityComplex: string[];
}

/**
 * Complete translation structure for VoltAgent
 */
export interface VoltAgentTranslations {
  tools: ToolTranslations;
  agents: AgentTranslations;
  actions: ActionSummaryTranslations;
  observability: ObservabilityTranslations;
  mistral: MistralTranslations;
  deadline: DeadlineKeywordsTranslations;
  followUp: FollowUpTranslations;
  briefing: BriefingTranslations;
  errors: ErrorTranslations;
  router: RouterPatternsTranslations;
}

/**
 * All available locales
 */
export const locales: Record<SupportedLocale, VoltAgentTranslations> = {
  en,
  it,
};

/**
 * Get locale from user preferences or context
 */
export function getLocale(language?: string): SupportedLocale {
  if (!language) return 'en';
  const lang = language.toLowerCase();
  if (lang.startsWith('it')) return 'it';
  return 'en';
}

/**
 * Get translations for a specific locale
 */
export function getTranslations(locale: SupportedLocale): VoltAgentTranslations {
  return locales[locale] || locales.en;
}

/**
 * Get tool translations for a specific locale
 */
export function getToolTranslations(locale: SupportedLocale): ToolTranslations {
  return (locales[locale] || locales.en).tools;
}

/**
 * Get agent translations for a specific locale
 */
export function getAgentTranslations(locale: SupportedLocale): AgentTranslations {
  return (locales[locale] || locales.en).agents;
}

/**
 * Get action summary translations for a specific locale
 */
export function getActionTranslations(locale: SupportedLocale): ActionSummaryTranslations {
  return (locales[locale] || locales.en).actions;
}

/**
 * Get observability translations for a specific locale
 */
export function getObservabilityTranslations(locale: SupportedLocale): ObservabilityTranslations {
  return (locales[locale] || locales.en).observability;
}

/**
 * Alias for getLocale (backward compatibility)
 */
export const resolveLocale = getLocale;

/**
 * Helper to format date for locale
 */
export function formatDateForLocale(date: Date, locale: SupportedLocale): string {
  return date.toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get deadline keywords for a specific locale
 */
export function getDeadlineKeywords(locale: SupportedLocale): DeadlineKeywordsTranslations {
  return (locales[locale] || locales.en).deadline;
}

/**
 * Get error translations for a specific locale
 */
export function getErrorTranslations(locale: SupportedLocale): ErrorTranslations {
  return (locales[locale] || locales.en).errors;
}

/**
 * Get router patterns for a specific locale (combined with English fallback)
 * Returns merged patterns from both locale and English for maximum coverage
 */
export function getRouterPatterns(locale: SupportedLocale): RouterPatternsTranslations {
  const localePatterns = (locales[locale] || locales.en).router;
  const enPatterns = locales.en.router;

  // Merge locale-specific patterns with English for comprehensive coverage
  if (locale === 'en') {
    return localePatterns;
  }

  return {
    writeOps: [...enPatterns.writeOps, ...localePatterns.writeOps],
    readOps: [...enPatterns.readOps, ...localePatterns.readOps],
    simple: [...enPatterns.simple, ...localePatterns.simple],
    complexitySimple: [...enPatterns.complexitySimple, ...localePatterns.complexitySimple],
    complexityModerate: [...enPatterns.complexityModerate, ...localePatterns.complexityModerate],
    complexityComplex: [...enPatterns.complexityComplex, ...localePatterns.complexityComplex],
  };
}

/**
 * Convert string patterns to RegExp array
 */
export function patternsToRegex(patterns: string[]): RegExp[] {
  return patterns.map((p) => new RegExp(p, 'i'));
}

// Legacy export for backward compatibility with action-executor.service.ts
export { actionSummaries } from './action-summaries';

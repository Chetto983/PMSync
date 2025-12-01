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
    compose: {
      description: string;
      systemPrompt: (toneInstruction: string) => string;
      originalEmail: string;
      replyInstructions: string;
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
  noSubject: string;
  unknownSender: string;
  event: string;
  contact: string;
}

/**
 * Complete translation structure for VoltAgent
 */
export interface VoltAgentTranslations {
  tools: ToolTranslations;
  agents: AgentTranslations;
  actions: ActionSummaryTranslations;
  observability: ObservabilityTranslations;
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

// Legacy export for backward compatibility with action-executor.service.ts
export { actionSummaries } from './action-summaries';

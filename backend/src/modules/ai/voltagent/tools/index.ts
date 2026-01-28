/**
 * VoltAgent Tools Export
 *
 * Exports all tool factory functions.
 */

export { createEmailTools } from './email.tools';
export { createEmailRLMTools } from './email-rlm.tools';
export { createCalendarTools } from './calendar.tools';
export { createContactsTools } from './contacts.tools';
export { createFolderTools } from './folder.tools';
export {
  createInsightTools,
  createSummarizeEmailTool,
  createAnalyzeSentimentTool,
  createComposeReplyTool,
  createExtractActionItemsTool,
  createCategorizeEmailTool,
  createSmartRepliesTool,
  // Enhanced 2025 tools
  createAnalyzeEmailTool,
  createDetectIntentTool,
  createCalculatePriorityTool,
  EMAIL_INTENTS,
  type EmailIntent,
  type InsightsToolOptions,
} from './insights.tools';
export {
  createWebSearchTool,
  createWebSearchTools,
  clearWebSearchCache,
  clearAgentPool,
  type WebSearchToolOptions,
} from './web-search.tools';
export {
  createAnalyticsTool,
  createAnalyticsTools,
  clearAnalyticsCache,
  clearAnalyticsAgentPool,
  type AnalyticsToolOptions,
  type AnalyticsResult,
} from './analytics.tools';
export {
  createDocumentQueryTool,
  createListLibrariesTool,
  createCreateLibraryTool,
  createDocumentLibraryTools,
  clearDocumentLibraryCache,
  clearDocumentLibraryAgentPool,
  type DocumentLibraryToolOptions,
  type DocumentLibrary,
  type LibraryDocument,
  type DocumentSearchResult,
} from './document-library.tools';
export {
  createAskUserTool,
  isAskUserResult,
  type AskUserParams,
  type AskUserOption,
} from './ask-user.tool';
export {
  createMemorySearchTool,
  createMemoryStoreTool,
  createMemoryTools,
  type MemoryToolsOptions,
} from './memory.tools';

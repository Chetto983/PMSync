/**
 * VoltAgent Tools Export
 *
 * Exports all tool factory functions.
 */

export { createEmailTools } from './email.tools';
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

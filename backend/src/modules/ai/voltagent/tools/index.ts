/**
 * VoltAgent Tools Export
 *
 * Exports all tool factory functions.
 */

export { createEmailTools } from './email.tools';
export { createEmailRLMTools, type EmailRLMRagOptions } from './email-rlm.tools';
export { createCalendarTools } from './calendar.tools';
export { createContactsTools } from './contacts.tools';
export { createFolderTools } from './folder.tools';
export {
  createInsightTools,
  createComposeReplyTool,
  createAnalyzeEmailTool,
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
export {
  createListAttachmentsTool,
  createGetAttachmentContentTool,
  createAttachmentTools,
  type AttachmentToolsOptions,
} from './attachment.tools';

/**
 * Shared types for assistant-ui chat components.
 * Re-exports tool output types from existing renderers + adds chat-specific types.
 */

// Re-export all tool output types used across chat tool UIs
export type {
  EmailSearchResult,
  EmailSearchItem,
  EmailContentResult,
  EmailContentItem,
  EmailIndexResult,
  EmailIndexItem,
  FollowUpResult,
  FollowUpItem,
  ContactSearchResult,
  ContactItem,
  EventResult,
  EventItem,
  CountResult,
  FolderResult,
  FolderItem,
  AnalysisResult,
  MemorySearchResult,
  MemoryItem,
  BriefingResult,
  BriefingSectionItem,
  CrmResult,
  CrmContactStat,
  BulkActionResult,
  GenericToolResult,
} from '../ai-elements/tool-renderers/types';

/** Backend conversation summary shape from GET /api/v1/ai/chat/conversations */
export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  messageCount: number;
}

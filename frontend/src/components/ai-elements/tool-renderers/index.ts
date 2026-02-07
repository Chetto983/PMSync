/**
 * Tool Renderer Registry.
 * Maps VoltAgent tool names to custom React renderers.
 * Inspired by assistant-ui's makeAssistantToolUI pattern.
 */

import type { ComponentType } from "react";
import type { ToolRendererProps } from "./types";
import { EmailListRenderer } from "./renderers/EmailListRenderer";
import { EmailSearchRenderer } from "./renderers/EmailSearchRenderer";
import { EmailContentRenderer } from "./renderers/EmailContentRenderer";
import { FollowUpRenderer } from "./renderers/FollowUpRenderer";
import { ContactRenderer } from "./renderers/ContactRenderer";
import { EventRenderer } from "./renderers/EventRenderer";
import { CountRenderer } from "./renderers/CountRenderer";
import { FolderRenderer } from "./renderers/FolderRenderer";
import { AnalysisRenderer } from "./renderers/AnalysisRenderer";
import { MemoryRenderer } from "./renderers/MemoryRenderer";
import { FallbackRenderer } from "./renderers/FallbackRenderer";

const TOOL_RENDERERS: Record<string, ComponentType<ToolRendererProps>> = {
  // Email listing (RLM pattern)
  list_email_index: EmailListRenderer,

  // Email search / list
  search_emails: EmailSearchRenderer,
  list_emails: EmailSearchRenderer,
  semantic_search_emails: EmailSearchRenderer,

  // Email content
  get_email_content: EmailContentRenderer,

  // Follow-ups
  list_follow_ups: FollowUpRenderer,
  manage_follow_up: FallbackRenderer,

  // Contacts
  search_contacts: ContactRenderer,

  // Calendar
  get_events: EventRenderer,

  // Counts
  count_emails: CountRenderer,

  // Folders
  list_folders: FolderRenderer,

  // Analysis
  analyze_email: AnalysisRenderer,

  // Memory
  search_memory: MemoryRenderer,
  memory_search: MemoryRenderer,
};

export function getToolRenderer(
  toolName?: string
): ComponentType<ToolRendererProps> {
  if (!toolName) return FallbackRenderer;
  return TOOL_RENDERERS[toolName] || FallbackRenderer;
}

export { FallbackRenderer };
export type { ToolRendererProps };

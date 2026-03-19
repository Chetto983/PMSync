/**
 * Barrel export for chat tool UI renderers.
 * TOOL_RENDERERS maps tool names to renderer components for MessagePrimitive.Content.
 * FallbackToolRenderer handles unregistered tools and HITL approval cards.
 */
import { EmailSearchRenderer, ListEmailsRenderer, SemanticSearchRenderer } from './EmailSearchToolUI';
import { EmailListRenderer } from './EmailListToolUI';
import { EmailContentRenderer } from './EmailContentToolUI';
import { FollowUpRenderer } from './FollowUpToolUI';
import { ContactRenderer } from './ContactToolUI';
import { EventRenderer } from './EventToolUI';
import { CountRenderer } from './CountToolUI';
import { FolderRenderer } from './FolderToolUI';
import { AnalysisRenderer } from './AnalysisToolUI';
import { MemoryRenderer, MemorySearchRenderer } from './MemoryToolUI';
import { BriefingRenderer } from './BriefingToolUI';
import { CrmRenderer } from './CrmToolUI';
import { TriageRenderer } from './TriageToolUI';
import { AskUserRenderer, SaveMemoryRenderer } from './ConversationToolUI';
import { CreateReminderRenderer, ListRemindersRenderer } from './ReminderToolUI';

export { FallbackToolRenderer } from './FallbackToolUI';

export const TOOL_RENDERERS = {
  search_emails: EmailSearchRenderer,
  list_emails: ListEmailsRenderer,
  semantic_search_emails: SemanticSearchRenderer,
  list_email_index: EmailListRenderer,
  get_email_content: EmailContentRenderer,
  list_follow_ups: FollowUpRenderer,
  search_contacts: ContactRenderer,
  get_events: EventRenderer,
  count_emails: CountRenderer,
  list_folders: FolderRenderer,
  analyze_email: AnalysisRenderer,
  search_memory: MemoryRenderer,
  memory_search: MemorySearchRenderer,
  get_daily_briefing: BriefingRenderer,
  get_relationship_stats: CrmRenderer,
  bulk_email_actions: TriageRenderer,
  ask_user: AskUserRenderer,
  save_memory: SaveMemoryRenderer,
  create_reminder: CreateReminderRenderer,
  list_reminders: ListRemindersRenderer,
} as const;

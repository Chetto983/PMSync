/**
 * Actions Agent for VoltAgent
 *
 * Consolidated agent handling ALL WRITE operations across email, calendar,
 * contacts, and folders. Requires HITL approval for destructive actions.
 *
 * Part of Phase 3: Agent Consolidation (10 → 3 agents)
 * Created: 2026-01-10
 */
import { Agent, type AgentHooks, type Memory } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createEmailTools } from '../tools/email.tools';
import { createFolderTools } from '../tools/folder.tools';
import { createContactsTools } from '../tools/contacts.tools';
import { createCalendarTools } from '../tools/calendar.tools';

/**
 * Tool names that ActionsAgent uses (WRITE operations + supporting READ tools)
 *
 * IMPORTANT: ActionsAgent needs READ tools to resolve names/queries to IDs
 * before calling write operations. Without search_contacts/get_events, the agent
 * cannot fulfill requests like "Update contact John" (needs contactId).
 *
 * Bug fix 2026-01-22: Added search_contacts and get_events to enable name→ID resolution
 */
const ACTIONS_TOOLS = [
  // Email read operations (REQUIRED for getting providerId before send)
  'list_emails', // Needed for mode="accounts" to find providerId
  // Email write operations
  'manage_email',
  'bulk_email_actions',
  // Folder write operations
  'manage_folder',
  'list_folders', // Needed to find folderId by name
  // Contact operations (search needed to resolve names to contactId)
  'search_contacts', // REQUIRED: resolve "contact John" → contactId for update/delete
  'manage_contact',
  // Calendar operations (get_events needed to resolve event titles to eventId)
  'get_events', // REQUIRED: resolve "event Team Meeting" → eventId for update/delete
  'manage_event',
] as const;

export interface ActionsAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  emailSendService: EmailSendService | null;
  calendarService: CalendarService | null;
  cacheService?: CacheService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
  hooks?: AgentHooks;
  /** VoltAgent memory for conversation persistence */
  memory?: Memory;
}

/**
 * Creates an Actions Agent with all WRITE tools consolidated.
 * Handles: email send/reply/forward/delete, folder management, contact CRUD, event CRUD.
 * All destructive actions require HITL approval.
 */
export function createActionsAgent(options: ActionsAgentOptions): Agent {
  const {
    model,
    prisma,
    emailSendService,
    calendarService,
    cacheService,
    locale,
    tenantId,
    hooks,
    memory,
  } = options;

  // Always use English prompts - locale only affects response language
  const t = getAgentTranslations('en');
  const localeInstruction =
    locale !== 'en'
      ? `\n\n## Response Language\nIMPORTANT: Respond in ${locale === 'it' ? 'Italian (italiano)' : locale}.`
      : '';

  // Create tools from factories
  const emailTools = createEmailTools(prisma, emailSendService, locale, tenantId, cacheService);
  const folderTools = createFolderTools(prisma, locale, tenantId, cacheService);
  const contactsTools = createContactsTools(prisma, locale, tenantId, cacheService);
  const calendarTools = createCalendarTools(prisma, calendarService, locale, tenantId, cacheService);

  // Combine all tools and filter to WRITE operations only
  const allTools = [...emailTools, ...folderTools, ...contactsTools, ...calendarTools];
  const writeTools = allTools.filter((tool) =>
    ACTIONS_TOOLS.includes(tool.name as (typeof ACTIONS_TOOLS)[number]),
  );

  return new Agent({
    name: 'ActionsAgent',
    purpose:
      'Execute WRITE operations: send/reply/forward/delete emails, manage folders, create/update/delete contacts and events. All destructive actions require user approval.',
    model,
    instructions: t.actions.instructions + localeInstruction,
    tools: writeTools,
    hooks,
    // Disable VoltAgent auto-memory writes to avoid duplicate persistence (we store manually)
    memory: false,
    maxSteps: 5, // Name-to-ID workflow needs: search → get result → manage → get result
  });
}

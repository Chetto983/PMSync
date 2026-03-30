/**
 * Tools barrel export -- Phase 25: Tools & RAG.
 *
 * IMPORTANT: Do NOT export a getToolSet() function here.
 * Tools are instantiated via ToolsService.getTools() inside
 * AiChatService.createToolSet() which provides PII resolution via closure.
 * A static export would bypass PII detokenization.
 *
 * Each ToolsService is @Injectable() and receives domain services via NestJS DI.
 */

export { EmailToolsService } from './email-tools.service';
export { CalendarToolsService } from './calendar-tools.service';
export { ContactToolsService } from './contact-tools.service';
export { FolderToolsService } from './folder-tools.service';
export { RagToolsService } from './rag-tools.service';
export { ConversationToolsService } from './conversation-tools.service';
export { SandboxToolsService } from './sandbox-tools.service';
export { EmailProductivityToolsService } from './email-productivity-tools.service';
export { FollowUpToolsService } from './follow-up-tools.service';
export { ReminderToolsService } from './reminder-tools.service';
export { CrmToolsService } from './crm-tools.service';

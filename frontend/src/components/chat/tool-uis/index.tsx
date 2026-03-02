/**
 * Barrel export for all chat tool UIs.
 * Each tool UI self-registers in the assistant-ui runtime when mounted.
 * Mount <AllToolUIs /> inside <AssistantRuntimeProvider> to activate all renderers.
 */
import { EmailSearchToolUI, ListEmailsToolUI, SemanticSearchToolUI } from './EmailSearchToolUI';
import { EmailListToolUI } from './EmailListToolUI';
import { EmailContentToolUI } from './EmailContentToolUI';
import { FollowUpToolUI } from './FollowUpToolUI';
import { ContactToolUI } from './ContactToolUI';
import { EventToolUI } from './EventToolUI';
import { CountToolUI } from './CountToolUI';
import { FolderToolUI } from './FolderToolUI';
import { AnalysisToolUI } from './AnalysisToolUI';
import { MemoryToolUI, MemorySearchToolUI } from './MemoryToolUI';
import { BriefingToolUI } from './BriefingToolUI';
import { CrmToolUI } from './CrmToolUI';
import { TriageToolUI } from './TriageToolUI';
import { FallbackToolUI } from './FallbackToolUI';

export function AllToolUIs() {
  return (
    <>
      {/* Email/data tools (Plan 02) */}
      <EmailSearchToolUI />
      <ListEmailsToolUI />
      <SemanticSearchToolUI />
      <EmailListToolUI />
      <EmailContentToolUI />
      <FollowUpToolUI />
      <ContactToolUI />
      <EventToolUI />
      <CountToolUI />
      <FolderToolUI />
      {/* Analysis/AI tools (Plan 03) */}
      <AnalysisToolUI />
      <MemoryToolUI />
      <MemorySearchToolUI />
      <BriefingToolUI />
      <CrmToolUI />
      <TriageToolUI />
      {/* Fallback for unregistered tools */}
      <FallbackToolUI />
    </>
  );
}

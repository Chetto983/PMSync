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
// Plan 03 will extend this with analysis/AI tools + FallbackToolUI

export function AllToolUIs() {
  return (
    <>
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
    </>
  );
}

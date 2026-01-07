/**
 * Email Compose Components
 *
 * Components for email composition:
 * - ComposeDialog: Full compose modal
 * - ComposeEditor: Tiptap rich text editor
 * - ComposeRecipients: To/Cc/Bcc with autocomplete
 * - ComposeAttachments: File upload handling
 */

export { default as ComposeDialog } from './ComposeDialog';
export type { ComposeDialogProps, ComposeMode, OriginalEmail } from './ComposeDialog';

export { default as ComposeEditor } from './ComposeEditor';
export type { ComposeEditorProps } from './ComposeEditor';

export { default as ComposeRecipients } from './ComposeRecipients';
export type { ComposeRecipientsProps, Recipient } from './ComposeRecipients';

export { default as ComposeAttachments } from './ComposeAttachments';
export type { ComposeAttachmentsProps, Attachment } from './ComposeAttachments';

export { default as useExtensions } from './useExtensions';
export type { UseExtensionsOptions } from './useExtensions';

export { default as EditorMenuControls } from './EditorMenuControls';

export { default as AIInlineMenu, ContentPreview } from './AIInlineMenu';
export type { AIInlineMenuProps, ContentPreviewProps } from './AIInlineMenu';

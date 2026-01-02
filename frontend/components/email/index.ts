/**
 * Email Module Components
 *
 * Central export for all email-related components.
 */

// Layout
export { EmailLayout } from './layout/EmailLayout';

// Sidebar
export { FolderSidebar } from './sidebar/FolderSidebar';
export { FolderItem } from './sidebar/FolderItem';
export { SortableFolderItem, FolderItemDisplay } from './sidebar/SortableFolderItem';

// Compose
export { ComposeDialog, ComposeEditor, ComposeRecipients, ComposeAttachments } from './compose';
export type { ComposeDialogProps } from './compose';

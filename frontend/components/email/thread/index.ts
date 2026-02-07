/**
 * Thread View Components - New Outlook Style
 *
 * Export all thread-related components for convenient imports
 */

// Main ThreadView component (New Outlook Style)
export { ThreadView, ThreadViewOutlook } from './ThreadViewOutlook';
export type { ThreadMessageData } from './ThreadViewOutlook';

// Sub-components
export { CollapsedMessage } from './CollapsedMessage';
export { ExpandedMessage } from './ExpandedMessage';
export { EmailHtmlContent } from './EmailHtmlContent';

// AI Chat components (06-02)
export { EmailChatFab } from './EmailChatFab';
export { EmailChatPanel } from './EmailChatPanel';

// Legacy exports - DEPRECATED - Remove by 2026-06-01: Use ThreadViewOutlook instead
// export { ThreadMessage } from './ThreadMessage';

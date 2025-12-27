/**
 * Email Components - Clean, centralized exports
 *
 * This file provides a single entry point for all email-related components.
 * Components are organized by category for better discoverability.
 */

// ============================================================================
// CORE COMPONENTS - Main email interface components
// ============================================================================

/**
 * Layout component for email interface
 * Handles responsive layout with sidebar, list, and detail panels
 */
export { EmailLayout } from './EmailLayout';

/**
 * Unified thread list component
 * Replaces both EmailList and ConversationList with a single, flexible component
 */
export { ThreadList } from './ThreadList';
export { default as ThreadListDefault } from './ThreadList';

/**
 * Unified thread list item component
 * Displays individual email or conversation in the list
 */
export { ThreadListItem } from './ThreadListItem';

/**
 * Swipeable thread list item with mobile gesture support
 */
export { SwipeableThreadListItem } from './SwipeableThreadListItem';

/**
 * Thread display component
 * Shows full email/thread content with actions
 */
export { ThreadDisplay } from './ThreadDisplay';


// ============================================================================
// SHARED COMPONENTS - Reusable UI elements
// ============================================================================

/**
 * Floating action bar with quick actions (Star, Important, Archive, Delete)
 */
export { ThreadActionBar, type ThreadActionBarProps } from './shared/ThreadActionBar';

/**
 * Enhanced avatar component with unread indicator
 */
export { ThreadAvatar, type ThreadAvatarProps } from './shared/ThreadAvatar';

/**
 * Labels display component with overflow handling
 */
export { ThreadLabels, type ThreadLabelsProps, type Label } from './shared/ThreadLabels';

// ============================================================================
// SIDEBAR & NAVIGATION
// ============================================================================

/**
 * Email sidebar with folders and navigation
 */
export { EmailSidebar } from './EmailSidebar';
export type { FolderItem, FolderGroup, SmartFilter, EmailSidebarProps } from './EmailSidebar';

// ============================================================================
// DIALOGS & MODALS
// ============================================================================

/**
 * Compose email dialog
 */
export { ComposeDialog } from './ComposeDialog';

/**
 * Advanced search dialog
 */
export { AdvancedSearchDialog } from './AdvancedSearchDialog/AdvancedSearchDialog';

/**
 * Folder selector dialog
 */
export { FolderSelectorDialog } from './FolderSelectorDialog';

/**
 * Label selector dialog
 */
export { LabelSelectorDialog } from './LabelSelectorDialog';

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

/**
 * Bulk action bar for multi-selection actions
 */
export { BulkActionBar } from './BulkActionBar/BulkActionBar';

/**
 * Contact autocomplete for email inputs
 */
export { ContactAutocomplete } from './ContactAutocomplete';

// ============================================================================
// UI ENHANCEMENT COMPONENTS
// ============================================================================

/**
 * Modern empty state for email lists
 */
export { EmailEmptyState } from './EmailEmptyState';

/**
 * Enhanced skeleton loader with animations
 */
export { EnhancedThreadListSkeleton } from './EnhancedThreadListSkeleton';

// ============================================================================
// MIGRATION NOTES
// ============================================================================

// Old components have been removed. Use the new unified components:
// - EmailList + ConversationList → ThreadList
// - EmailListItem + ConversationListItem → ThreadListItem (internal)
// - EmailDetail + EmailThread → ThreadDisplay
//
// See README.md for migration guide and examples.

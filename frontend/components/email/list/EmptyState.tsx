/**
 * Empty State Component for Email List
 *
 * Displays placeholder content when email list is empty.
 * Supports 3 variants: inbox, folder, search
 *
 * Design: Clean, centered layout with icon and message
 * Following MUI theme tokens for consistent styling
 */

import { Box, Button, Typography } from '@mui/material';
import { Inbox, Folder, SearchX, Crown } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export type EmptyStateVariant = 'inbox' | 'folder' | 'search' | 'vip';

interface EmptyStateProps {
  /** Type of empty state to display */
  variant?: EmptyStateVariant;
  /** Optional custom title (overrides default) */
  title?: string;
  /** Optional custom description (overrides default) */
  description?: string;
  /** Primary action callback (e.g. "Clear search", "Compose email") */
  onAction?: () => void;
}

/**
 * Empty state for email list
 *
 * Displays appropriate message based on context:
 * - inbox: "Your inbox is empty"
 * - folder: "This folder is empty"
 * - search: "No results found"
 */
export function EmptyState({ variant = 'inbox', title, description, onAction }: EmptyStateProps) {
  const t = useTranslations();

  // Icon mapping for each variant
  const icons = {
    inbox: Inbox,
    folder: Folder,
    search: SearchX,
    vip: Crown,
  };

  // Default text based on variant
  const defaultTitles = {
    inbox: t.emailList.emptyInbox,
    folder: t.emailList.emptyFolder,
    search: t.emailList.emptySearch,
    vip: t.email.empty.vipTitle,
  };

  const defaultDescriptions = {
    inbox: t.emailList.emptyInboxDesc,
    folder: t.emailList.emptyFolderDesc,
    search: t.emailList.emptySearchDesc,
    vip: t.email.empty.vipSubtitle,
  };

  const defaultActions: Record<EmptyStateVariant, string | undefined> = {
    inbox: t.emailList.emptyInboxAction,
    folder: t.emailList.emptyFolderAction,
    search: t.emailList.emptySearchAction,
    vip: undefined,
  };

  const Icon = icons[variant];
  const displayTitle = title || defaultTitles[variant];
  const displayDescription = description || defaultDescriptions[variant];
  const actionLabel = onAction ? defaultActions[variant] : undefined;

  return (
    <Box
      data-testid="empty-state"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        py: 8,
        px: 3,
        textAlign: 'center',
      }}
    >
      {/* Icon with theme color */}
      <Box
        sx={{
          mb: 3,
          color: 'action.disabled',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={64} strokeWidth={1.5} />
      </Box>

      {/* Title */}
      <Typography
        variant="h6"
        color="text.primary"
        gutterBottom
        sx={{ fontWeight: 600 }}
      >
        {displayTitle}
      </Typography>

      {/* Description */}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ maxWidth: 400 }}
      >
        {displayDescription}
      </Typography>

      {/* Actionable CTA — anti-pattern #9 fix */}
      {actionLabel && onAction && (
        <Button
          variant="outlined"
          size="small"
          onClick={onAction}
          sx={{ mt: 2.5 }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}

export default EmptyState;

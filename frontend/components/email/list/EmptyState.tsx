/**
 * Empty State Component for Email List
 *
 * Displays placeholder content when email list is empty.
 * Supports 3 variants: inbox, folder, search
 *
 * Design: Clean, centered layout with icon and message
 * Following MUI theme tokens for consistent styling
 */

import { Box, Typography } from '@mui/material';
import { Inbox, Folder, SearchX } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export type EmptyStateVariant = 'inbox' | 'folder' | 'search';

interface EmptyStateProps {
  /** Type of empty state to display */
  variant?: EmptyStateVariant;
  /** Optional custom title (overrides default) */
  title?: string;
  /** Optional custom description (overrides default) */
  description?: string;
}

/**
 * Empty state for email list
 *
 * Displays appropriate message based on context:
 * - inbox: "Your inbox is empty"
 * - folder: "This folder is empty"
 * - search: "No results found"
 */
export function EmptyState({ variant = 'inbox', title, description }: EmptyStateProps) {
  const t = useTranslations();

  // Icon mapping for each variant
  const icons = {
    inbox: Inbox,
    folder: Folder,
    search: SearchX,
  };

  // Default text based on variant
  const defaultTitles = {
    inbox: t.emailList.emptyInbox,
    folder: t.emailList.emptyFolder,
    search: t.emailList.emptySearch,
  };

  const defaultDescriptions = {
    inbox: t.emailList.emptyInboxDesc,
    folder: t.emailList.emptyFolderDesc,
    search: t.emailList.emptySearchDesc,
  };

  const Icon = icons[variant];
  const displayTitle = title || defaultTitles[variant];
  const displayDescription = description || defaultDescriptions[variant];

  return (
    <Box
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
    </Box>
  );
}

export default EmptyState;

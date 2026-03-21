import React from 'react';
import { Box, Typography, Button, alpha } from '@mui/material';

interface EmptyStateProps {
  /** Lucide icon component */
  icon: React.ElementType;
  /** Semantic hex color (e.g., '#00aced' for email) */
  color?: string;
  /** Main message */
  title: string;
  /** Optional description below title */
  description?: string;
  /** Optional CTA button label */
  actionLabel?: string;
  /** CTA click handler */
  onAction?: () => void;
}

/**
 * Reusable empty state for content pages.
 * Centered layout with icon, title, description, and optional CTA.
 */
export function EmptyState({
  icon: Icon,
  color,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: 8,
        px: 3,
      }}
    >
      <Box
        sx={{
          display: 'inline-flex',
          p: 2,
          borderRadius: '50%',
          bgcolor: color ? alpha(color, 0.12) : 'action.hover',
          color: color || 'text.secondary',
          mb: 2,
        }}
      >
        <Icon size={24} />
      </Box>
      <Typography
        variant="h6"
        color="text.primary"
        sx={{ fontWeight: 600, mb: 1 }}
      >
        {title}
      </Typography>
      {description && (
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mb: 3, maxWidth: 360 }}
        >
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}

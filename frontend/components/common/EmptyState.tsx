import React from 'react';
import { Box, Typography, Button } from '@mui/material';

interface EmptyStateProps {
  /** Lucide icon component */
  icon: React.ElementType;
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
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Box
        sx={{
          display: 'inline-flex',
          p: 2,
          borderRadius: '50%',
          bgcolor: 'action.hover',
          mb: 2,
        }}
      >
        <Icon size={48} style={{ opacity: 0.4 }} />
      </Box>
      <Typography variant="h6" color="text.secondary" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button variant="outlined" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}

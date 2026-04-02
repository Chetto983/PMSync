/**
 * LabelsEmptyState — shown when a tenant has zero labels.
 * Encourages the user to create their first AI-powered label via the wizard.
 */
import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { InboxOutlined, AutoAwesome } from '@mui/icons-material';
import { useTranslations } from '@/lib/hooks/use-translations';

interface LabelsEmptyStateProps {
  onCreateClick: () => void;
}

export function LabelsEmptyState({ onCreateClick }: LabelsEmptyStateProps) {
  const t = useTranslations();
  const tw = t.email.labels.wizard;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
        px: 2,
        textAlign: 'center',
      }}
    >
      <InboxOutlined sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        {tw.emptyTitle}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 300 }}>
        {tw.emptyDescription}
      </Typography>
      <Button
        variant="contained"
        startIcon={<AutoAwesome />}
        onClick={onCreateClick}
      >
        {tw.createFirst}
      </Button>
    </Box>
  );
}

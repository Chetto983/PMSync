import React from 'react';
import { Box, Switch, Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';

interface ConsentToggleProps {
  feature: string;
  label: string;
  description: string;
  granted: boolean;
  lastUpdated: string | null;
  onToggle: () => void;
  disabled?: boolean;
}

export function ConsentToggle({
  feature,
  label,
  description,
  granted,
  lastUpdated,
  onToggle,
  disabled = false,
}: ConsentToggleProps) {
  const t = useTranslations();
  const consentCopy = t.settings.consentPanel;

  return (
    <Box
      data-testid={`consent-toggle-${feature}`}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
        py: 1.5,
      }}
    >
      <Box sx={{ flex: 1 }}>
        <Typography variant="body1" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
        {lastUpdated && (
          <Typography variant="caption" color="text.secondary">
            {consentCopy?.lastUpdated}: {new Date(lastUpdated).toLocaleDateString()}
          </Typography>
        )}
      </Box>
      <Switch
        checked={granted}
        onChange={onToggle}
        disabled={disabled}
        inputProps={{ 'aria-label': `${label} consent toggle` }}
      />
    </Box>
  );
}

import React, { useState, useEffect } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';

interface ComposeProviderSelectorProps {
  selectedProvider: string;
  onProviderChange: (providerId: string) => void;
  defaultProviderId?: string;
  sending: boolean;
  open: boolean;
  t: {
    email: {
      composer: {
        from: string;
        selectProvider: string;
        noProvider: string;
      };
    };
  };
}

/**
 * Provider (From) selector for compose dialog
 */
export function ComposeProviderSelector({
  selectedProvider,
  onProviderChange,
  defaultProviderId,
  sending,
  open,
  t,
}: ComposeProviderSelectorProps) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);

  // Fetch providers when dialog opens
  useEffect(() => {
    if (open) {
      providersApi.getProviders().then((data) => {
        const emailProviders = data.filter((p) => p.supportsEmail);
        setProviders(emailProviders);

        // Set default provider only if none selected yet
        if (!selectedProvider && emailProviders.length > 0) {
          const defaultProvider =
            emailProviders.find((p) => p.isDefault) || emailProviders[0];
          onProviderChange(defaultProvider.id);
        }
      });
    }
  }, [open, onProviderChange, selectedProvider]);

  // Update selected provider when defaultProviderId changes
  useEffect(() => {
    if (defaultProviderId) {
      onProviderChange(defaultProviderId);
    }
  }, [defaultProviderId, onProviderChange]);

  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
          {t.email.composer.from}:
        </Typography>
        <TextField
          select
          fullWidth
          size="small"
          value={selectedProvider}
          onChange={(e) => onProviderChange(e.target.value)}
          disabled={sending || providers.length === 0}
          slotProps={{
            htmlInput: {
              'aria-label': t.email.composer.selectProvider,
            },
          }}
          SelectProps={{
            native: true,
            inputProps: {
              title: t.email.composer.selectProvider,
              'aria-label': t.email.composer.selectProvider,
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              '& fieldset': { border: 'none' },
            },
          }}
        >
          {providers.length === 0 && (
            <option value="">{t.email.composer.noProvider}</option>
          )}
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.email} {provider.displayName ? `(${provider.displayName})` : ''}
            </option>
          ))}
        </TextField>
      </Box>
    </Box>
  );
}

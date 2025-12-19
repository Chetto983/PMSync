import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  CircularProgress,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { GoogleProviderCard } from '@/components/providers/GoogleProviderCard';
import { MicrosoftProviderCard } from '@/components/providers/MicrosoftProviderCard';
import { GenericProviderCard } from '@/components/providers/GenericProviderCard';
import { ProvidersList } from '@/components/providers/ProvidersList';
import type { ProviderConfig } from '@/lib/api/providers';

export interface AccountsSettingsProps {
  providers: ProviderConfig[];
  providersLoading: boolean;
  syncLoading: boolean;
  success: string;
  error: string;
  onClearSuccess: () => void;
  onClearError: () => void;
  onRefresh: () => void;
  onSyncAll: () => void;
  onProviderInitiated: () => void;
  onProviderConnected: () => void;
  onProviderDeleted: () => void;
  copy: {
    title: string;
    description: string;
    connectedTitle: string;
    refreshTooltip: string;
    syncAll: string;
    syncing: string;
    addTitle: string;
    addDescription: string;
  };
}

export function AccountsSettings({
  providers,
  providersLoading,
  syncLoading,
  success,
  error,
  onClearSuccess,
  onClearError,
  onRefresh,
  onSyncAll,
  onProviderInitiated,
  onProviderConnected,
  onProviderDeleted,
  copy,
}: AccountsSettingsProps) {
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {copy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {copy.description}
      </Typography>

      {(error || success) && (
        <Box sx={{ mb: 3 }}>
          {error && <Alert severity="error" onClose={onClearError}>{error}</Alert>}
          {success && <Alert severity="success" onClose={onClearSuccess}>{success}</Alert>}
        </Box>
      )}

      <SectionCard
        title={copy.connectedTitle}
        action={
          <Stack direction="row" spacing={1}>
            <Tooltip title={copy.refreshTooltip}>
              <IconButton size="small" onClick={onRefresh} disabled={providersLoading}>
                <RefreshCw size={16} className={providersLoading ? 'animate-spin' : ''} />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="outlined"
              onClick={onSyncAll}
              disabled={syncLoading || providers.length === 0}
            >
              {syncLoading ? copy.syncing : copy.syncAll}
            </Button>
          </Stack>
        }
      >
        {providersLoading ? (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <ProvidersList providers={providers} onDelete={onProviderDeleted} />
        )}
      </SectionCard>

      <SectionCard title={copy.addTitle} description={copy.addDescription}>
        <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
          <Box sx={{ flex: 1 }}>
            <GoogleProviderCard onSuccess={onProviderInitiated} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <MicrosoftProviderCard onSuccess={onProviderInitiated} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <GenericProviderCard onSuccess={onProviderConnected} />
          </Box>
        </Stack>
      </SectionCard>
    </Box>
  );
}

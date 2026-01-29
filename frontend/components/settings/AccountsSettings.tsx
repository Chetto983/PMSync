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
  Chip,
} from '@mui/material';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import type { SubscriptionLimits } from '@/hooks/queries/use-subscription-limits';
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
  limits?: SubscriptionLimits;
  copy: {
    title: string;
    description: string;
    connectedTitle: string;
    refreshTooltip: string;
    syncAll: string;
    syncing: string;
    addTitle: string;
    addDescription: string;
    // Limit-related copy (optional for backward compat)
    limitTitle?: string;
    limitCurrent?: string;
    limitReachedTitle?: string;
    limitReachedMessage?: string;
    limitUpgradePrompt?: string;
    limitUpgradeButton?: string;
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
  limits,
  copy,
}: AccountsSettingsProps) {
  const canAddProvider = limits?.canAddProvider ?? true;
  const isUnlimited = limits?.maxProviders === -1;
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

      <SectionCard
        title={copy.addTitle}
        description={copy.addDescription}
        action={
          limits && !isUnlimited ? (
            <Chip
              size="small"
              label={`${limits.currentProviders}/${limits.maxProviders}`}
              color={canAddProvider ? 'default' : 'warning'}
              variant="outlined"
            />
          ) : null
        }
      >
        {!canAddProvider && (
          <Alert
            severity="warning"
            icon={<AlertTriangle size={20} />}
            sx={{ mb: 2 }}
            action={
              <Button
                color="warning"
                size="small"
                href="/dashboard/settings?section=billing"
              >
                {copy.limitUpgradeButton || 'Upgrade'}
              </Button>
            }
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {copy.limitReachedTitle || 'Account Limit Reached'}
            </Typography>
            <Typography variant="body2">
              {copy.limitUpgradePrompt || 'Upgrade your plan to add more email accounts.'}
            </Typography>
          </Alert>
        )}
        <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
          <Box sx={{ flex: 1, opacity: canAddProvider ? 1 : 0.5, pointerEvents: canAddProvider ? 'auto' : 'none' }}>
            <GoogleProviderCard onSuccess={onProviderInitiated} />
          </Box>
          <Box sx={{ flex: 1, opacity: canAddProvider ? 1 : 0.5, pointerEvents: canAddProvider ? 'auto' : 'none' }}>
            <MicrosoftProviderCard onSuccess={onProviderInitiated} />
          </Box>
          <Box sx={{ flex: 1, opacity: canAddProvider ? 1 : 0.5, pointerEvents: canAddProvider ? 'auto' : 'none' }}>
            <GenericProviderCard onSuccess={onProviderConnected} />
          </Box>
        </Stack>
      </SectionCard>
    </Box>
  );
}

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  SvgIcon,
  CircularProgress,
} from '@mui/material';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

function GoogleIcon() {
  return (
    <SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 20 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </SvgIcon>
  );
}

function MicrosoftIcon() {
  return (
    <SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 20 }}>
      <path d="M3 3h8.5v8.5H3z" fill="#F25022" />
      <path d="M12.5 3H21v8.5h-8.5z" fill="#7FBA00" />
      <path d="M3 12.5h8.5V21H3z" fill="#00A4EF" />
      <path d="M12.5 12.5H21V21h-8.5z" fill="#FFB900" />
    </SvgIcon>
  );
}

interface AccountInfo {
  accountId?: string;
  providerId: string;
}

const PROVIDERS = [
  { id: 'google', icon: <GoogleIcon />, labelKey: 'google' as const },
  { id: 'microsoft', icon: <MicrosoftIcon />, labelKey: 'microsoft' as const },
];

export function SecurityAccountsSection() {
  const t = useTranslations();
  const sec = t.settings.securityPanel?.connectedAccounts;

  const [_loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [error, setError] = useState('');
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await authClient.listAccounts();
      if (result?.data) {
        setAccounts(result.data as AccountInfo[]);
      }
    } catch {
      setError('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const isLinked = (providerId: string) =>
    accounts.some((a) => a.providerId === providerId);

  const canUnlink = (providerId: string) => {
    // Must have at least one other auth method
    const otherMethods = accounts.filter((a) => a.providerId !== providerId);
    return otherMethods.length > 0;
  };

  const handleLink = useCallback(async (provider: string) => {
    try {
      setLinking(provider);
      setError('');
      await authClient.linkSocial({
        provider: provider as 'google' | 'microsoft',
        callbackURL: '/dashboard/settings?section=security',
      });
    } catch {
      setError('Failed to link account');
      setLinking(null);
    }
  }, []);

  const handleUnlink = useCallback(async (providerId: string) => {
    if (!canUnlink(providerId)) {
      setError(sec?.cannotUnlinkLast || 'Cannot unlink your only authentication method');
      setUnlinkTarget(null);
      return;
    }
    try {
      setUnlinking(true);
      setError('');
      await authClient.unlinkAccount({ providerId });
      setUnlinkTarget(null);
      loadAccounts();
    } catch {
      setError('Failed to unlink account');
    } finally {
      setUnlinking(false);
    }
  }, [loadAccounts, sec?.cannotUnlinkLast]);

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        {sec?.title || 'Connected Accounts'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {sec?.description || 'Manage linked social login providers'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {PROVIDERS.map((provider) => {
        const linked = isLinked(provider.id);
        return (
          <Card key={provider.id} variant="outlined" sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5, px: 3, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {provider.icon}
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {sec?.[provider.labelKey] || provider.id}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={linked ? (sec?.linked || 'Linked') : (sec?.notLinked || 'Not linked')}
                    color={linked ? 'success' : 'default'}
                    size="small"
                    variant="outlined"
                  />
                  {linked ? (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => setUnlinkTarget(provider.id)}
                      disabled={!canUnlink(provider.id)}
                    >
                      {sec?.unlink || 'Unlink'}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleLink(provider.id)}
                      disabled={linking === provider.id}
                      startIcon={linking === provider.id ? <CircularProgress size={14} /> : undefined}
                    >
                      {sec?.link || 'Link'}
                    </Button>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        );
      })}

      {/* Unlink Confirmation Dialog */}
      <Dialog open={!!unlinkTarget} onClose={() => setUnlinkTarget(null)}>
        <DialogTitle>{sec?.unlink || 'Unlink Account'}</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            {sec?.unlinkConfirm || 'Unlink this account?'}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlinkTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => unlinkTarget && handleUnlink(unlinkTarget)}
            disabled={unlinking}
            startIcon={unlinking ? <CircularProgress size={16} /> : undefined}
          >
            {sec?.unlink || 'Unlink'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

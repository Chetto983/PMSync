import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Skeleton,
  Paper,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Shield,
  ShieldCheck,
  Fingerprint,
  Key,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import Image from 'next/image';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const UAParser = require('ua-parser-js') as { new(ua: string): { getBrowser(): { name?: string }; getOS(): { name?: string } } };
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';

const MAX_PASSKEYS = 5;

function formatDate(date: string | Date, locale: string) {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getAutoPasskeyName(): string {
  if (typeof navigator === 'undefined') return 'Passkey';
  const parser = new UAParser(navigator.userAgent);
  const browser = parser.getBrowser().name || 'Browser';
  const os = parser.getOS().name || 'Unknown';
  return `${browser} on ${os}`;
}

export function SecurityMfaSection() {
  const t = useTranslations();
  const { locale } = useLocale();
  const sec = t.settings.securityPanel;
  const mfa = sec?.mfa;

  // State
  const [loading, setLoading] = useState(true);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [passkeys, setPasskeys] = useState<Array<{
    id: string;
    name?: string;
    createdAt?: string | Date;
    credential?: { deviceType?: string };
  }>>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // TOTP enable dialog state
  const [enableOpen, setEnableOpen] = useState(false);
  const [enableStep, setEnableStep] = useState(0); // 0=password, 1=QR, 2=verify, 3=backupCodes
  const [password, setPassword] = useState('');
  const [totpURI, setTotpURI] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [stepLoading, setStepLoading] = useState(false);

  // TOTP disable dialog
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  // Passkey remove confirmation
  const [removePasskeyId, setRemovePasskeyId] = useState<string | null>(null);
  const [addingPasskey, setAddingPasskey] = useState(false);

  // Backup codes regen
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenCodes, setRegenCodes] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Check if user has twoFactorEnabled from session
      const session = await authClient.getSession();
      const user = session?.data?.user;
      setTotpEnabled(!!user?.twoFactorEnabled);

      // Load passkeys
      const pkResult = await authClient.passkey.listUserPasskeys();
      if (pkResult?.data) {
        setPasskeys(pkResult.data as typeof passkeys);
      }
    } catch {
      setError('Failed to load security settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Generate QR data URL from totp URI
  useEffect(() => {
    if (!totpURI) return;
    // Use a simple QR code approach via a Google Charts API fallback
    // since the qrcode npm package may not be installed
    const encoded = encodeURIComponent(totpURI);
    setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`);
  }, [totpURI]);

  // TOTP enable flow
  const handleEnableStep1 = useCallback(async () => {
    try {
      setStepLoading(true);
      setError('');
      const result = await authClient.twoFactor.enable({ password });
      if (result?.data) {
        const data = result.data as { totpURI?: string; backupCodes?: string[] };
        setTotpURI(data.totpURI || '');
        setBackupCodes(data.backupCodes || []);
        setEnableStep(1);
      } else if (result?.error) {
        setError(result.error.message || 'Failed to enable TOTP');
      }
    } catch {
      setError('Failed to enable TOTP');
    } finally {
      setStepLoading(false);
    }
  }, [password]);

  const handleVerifyTotp = useCallback(async () => {
    try {
      setStepLoading(true);
      setError('');
      const result = await authClient.twoFactor.verifyTotp({ code: verifyCode });
      if (result?.data) {
        setEnableStep(3);
        setTotpEnabled(true);
        setSuccess('TOTP enabled successfully');
      } else if (result?.error) {
        setError(result.error.message || 'Invalid code');
      }
    } catch {
      setError('Verification failed');
    } finally {
      setStepLoading(false);
    }
  }, [verifyCode]);

  const handleCloseEnable = () => {
    setEnableOpen(false);
    setEnableStep(0);
    setPassword('');
    setTotpURI('');
    setQrDataUrl('');
    setVerifyCode('');
    if (enableStep === 3) loadData();
  };

  // TOTP disable
  const handleDisableTotp = useCallback(async () => {
    try {
      setDisableLoading(true);
      setError('');
      const result = await authClient.twoFactor.disable({ password: disablePassword });
      if (result?.error) {
        setError(result.error.message || 'Failed to disable TOTP');
      } else {
        setDisableOpen(false);
        setDisablePassword('');
        setTotpEnabled(false);
        setSuccess('TOTP disabled');
        loadData();
      }
    } catch {
      setError('Failed to disable TOTP');
    } finally {
      setDisableLoading(false);
    }
  }, [disablePassword, loadData]);

  // Passkey add
  const handleAddPasskey = useCallback(async () => {
    try {
      setAddingPasskey(true);
      setError('');
      const name = getAutoPasskeyName();
      const result = await authClient.passkey.addPasskey({ name });
      if (result?.error) {
        setError(result.error.message || 'Failed to add passkey');
      } else {
        setSuccess('Passkey added');
        loadData();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Registration was cancelled');
      } else {
        setError('Failed to add passkey');
      }
    } finally {
      setAddingPasskey(false);
    }
  }, [loadData]);

  // Passkey remove
  const handleRemovePasskey = useCallback(async (id: string) => {
    try {
      setError('');
      const result = await authClient.passkey.deletePasskey({ id });
      if (result?.error) {
        setError(result.error.message || 'Failed to remove passkey');
      } else {
        setRemovePasskeyId(null);
        loadData();
      }
    } catch {
      setError('Failed to remove passkey');
    }
  }, [loadData]);

  // Backup codes regenerate
  const handleRegenCodes = useCallback(async () => {
    try {
      setRegenLoading(true);
      setError('');
      const result = await authClient.twoFactor.generateBackupCodes({ password: regenPassword });
      if (result?.data) {
        const data = result.data as { backupCodes?: string[] };
        setRegenCodes(data.backupCodes || []);
        setRegenPassword('');
      } else if (result?.error) {
        setError(result.error.message || 'Failed to regenerate codes');
      }
    } catch {
      setError('Failed to regenerate codes');
    } finally {
      setRegenLoading(false);
    }
  }, [regenPassword]);

  const handleDownloadCodes = (codes: string[]) => {
    const text = `PMSync Backup Codes\n${'='.repeat(30)}\n\nStore these codes in a safe place.\nEach code can only be used once.\n\n${codes.join('\n')}\n\nGenerated: ${new Date().toISOString()}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pmsync-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={80} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={80} sx={{ mb: 2, borderRadius: 1 }} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        {mfa?.title || 'Two-Factor Authentication'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {mfa?.description || 'Add an extra layer of security to your account'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* TOTP Subsection */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: { xs: 'stretch', sm: 'center' },
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
              {totpEnabled ? <ShieldCheck size={20} /> : <Shield size={20} />}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {mfa?.totp.title || 'Authenticator App'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {mfa?.totp.description || 'Use an authenticator app'}
                </Typography>
              </Box>
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: 'flex-end',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1,
                width: { xs: '100%', sm: 'auto' },
                flexShrink: 0,
              }}
            >
              <Chip
                label={totpEnabled ? (mfa?.totp.enabled || 'Enabled') : (mfa?.totp.disabled || 'Not configured')}
                color={totpEnabled ? 'success' : 'default'}
                size="small"
                sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
              />
              {totpEnabled ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={() => setDisableOpen(true)}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  {mfa?.totp.disable || 'Disable'}
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setEnableOpen(true)}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  {mfa?.totp.enable || 'Enable'}
                </Button>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Passkeys Subsection */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: { xs: 'stretch', sm: 'center' },
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              mb: 2,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {mfa?.passkeys.title || 'Passkeys'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {mfa?.passkeys.description || 'Use Face ID, Touch ID, or security keys'}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="contained"
              startIcon={addingPasskey ? <CircularProgress size={14} /> : <Plus size={14} />}
              onClick={handleAddPasskey}
              disabled={addingPasskey || passkeys.length >= MAX_PASSKEYS}
              sx={{ width: { xs: '100%', sm: 'auto' }, alignSelf: { xs: 'stretch', sm: 'center' } }}
            >
              {addingPasskey
                ? (mfa?.passkeys.adding || 'Adding...')
                : passkeys.length >= MAX_PASSKEYS
                  ? (mfa?.passkeys.maxReached || 'Max reached')
                  : (mfa?.passkeys.add || 'Add Passkey')
              }
            </Button>
          </Box>

          {passkeys.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 1 }}>
              <Fingerprint size={28} style={{ opacity: 0.5, marginBottom: 4 }} />
              <Typography variant="body2" color="text.secondary">
                {mfa?.passkeys.noPasskeys || 'No passkeys registered'}
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {passkeys.map((pk) => (
                <ListItem
                  key={pk.id}
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {pk.credential?.deviceType === 'singleDevice'
                      ? <Key size={18} />
                      : <Fingerprint size={18} />
                    }
                  </ListItemIcon>
                  <ListItemText
                    primary={pk.name || 'Passkey'}
                    secondary={pk.createdAt
                      ? `${mfa?.passkeys.registered || 'Registered'}: ${formatDate(pk.createdAt, locale)}`
                      : undefined
                    }
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title={mfa?.passkeys.remove || 'Remove'}>
                      <IconButton size="small" onClick={() => setRemovePasskeyId(pk.id)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Backup Codes Subsection - only when TOTP enabled */}
      {totpEnabled && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ p: 3 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', sm: 'center' },
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                mb: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {mfa?.backupCodes.title || 'Backup Codes'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {mfa?.backupCodes.description || 'Use backup codes when your authenticator is unavailable'}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshCw size={14} />}
                onClick={() => setRegenOpen(true)}
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                {mfa?.backupCodes.regenerate || 'Regenerate'}
              </Button>
            </Box>

            {regenCodes.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {mfa?.backupCodes.warning || 'Save these codes — you will not see them again'}
                </Alert>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
                  {regenCodes.map((code, i) => (
                    <Box
                      key={i}
                      sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', textAlign: 'center', fontSize: '0.875rem' }}
                    >
                      {code}
                    </Box>
                  ))}
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Download size={14} />}
                  onClick={() => handleDownloadCodes(regenCodes)}
                >
                  {mfa?.backupCodes.download || 'Download as .txt'}
                </Button>
              </Paper>
            )}
          </CardContent>
        </Card>
      )}

      {/* TOTP Enable Dialog */}
      <Dialog open={enableOpen} onClose={handleCloseEnable} maxWidth="sm" fullWidth>
        <DialogTitle>{mfa?.totp.enable || 'Enable TOTP'}</DialogTitle>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (enableStep === 0) {
              void handleEnableStep1();
            } else if (enableStep === 2) {
              void handleVerifyTotp();
            }
          }}
        >
        <DialogContent>
          {enableStep === 0 && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {mfa?.totp.passwordRequired || 'Enter your password to continue'}
              </Typography>
              <TextField
                label={sec?.password.currentPassword || 'Password'}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                autoFocus
              />
            </Box>
          )}
          {enableStep === 1 && (
            <Box sx={{ pt: 1, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {mfa?.totp.scanQr || 'Scan this QR code with your authenticator app'}
              </Typography>
              {qrDataUrl && (
                <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'inline-block', bgcolor: 'white' }}>
                  <Image src={qrDataUrl} alt="TOTP QR Code" width={200} height={200} unoptimized />
                </Paper>
              )}
            </Box>
          )}
          {enableStep === 2 && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {mfa?.totp.enterCode || 'Enter the 6-digit code from your app to verify'}
              </Typography>
              <TextField
                label={mfa?.totp.verifyCode || 'Verify'}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputProps={{ maxLength: 6, inputMode: 'numeric', style: { letterSpacing: '0.5em', fontFamily: 'monospace' } }}
                fullWidth
                autoFocus
              />
            </Box>
          )}
          {enableStep === 3 && (
            <Box sx={{ pt: 1 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                {mfa?.backupCodes.warning || 'Save these codes — you will not see them again'}
              </Alert>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
                {backupCodes.map((code, i) => (
                  <Box
                    key={i}
                    sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', textAlign: 'center', fontSize: '0.875rem' }}
                  >
                    {code}
                  </Box>
                ))}
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Download size={14} />}
                onClick={() => handleDownloadCodes(backupCodes)}
              >
                {mfa?.backupCodes.download || 'Download as .txt'}
              </Button>
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          {enableStep < 3 && (
            <Button onClick={handleCloseEnable}>{t.common.cancel}</Button>
          )}
          {enableStep === 0 && (
            <Button
              type="submit"
              variant="contained"
              disabled={stepLoading || !password}
              startIcon={stepLoading ? <CircularProgress size={16} /> : undefined}
            >
              {t.common.continue}
            </Button>
          )}
          {enableStep === 1 && (
            <Button variant="contained" onClick={() => setEnableStep(2)}>
              {t.common.continue}
            </Button>
          )}
          {enableStep === 2 && (
            <Button
              type="submit"
              variant="contained"
              disabled={stepLoading || verifyCode.length !== 6}
              startIcon={stepLoading ? <CircularProgress size={16} /> : undefined}
            >
              {mfa?.totp.verifyCode || t.common.confirm}
            </Button>
          )}
          {enableStep === 3 && (
            <Button variant="contained" onClick={handleCloseEnable}>
              {t.common.done}
            </Button>
          )}
        </DialogActions>
        </Box>
      </Dialog>

      {/* TOTP Disable Dialog */}
      <Dialog open={disableOpen} onClose={() => setDisableOpen(false)}>
        <DialogTitle>{mfa?.totp.disable || 'Disable TOTP'}</DialogTitle>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleDisableTotp();
          }}
        >
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {mfa?.totp.passwordRequired || 'Enter your password to continue'}
          </Typography>
          <TextField
            label={sec?.password.currentPassword || 'Password'}
            type="password"
            autoComplete="current-password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisableOpen(false)}>{t.common.cancel}</Button>
          <Button
            type="submit"
            variant="contained"
            color="error"
            disabled={disableLoading || !disablePassword}
            startIcon={disableLoading ? <CircularProgress size={16} /> : undefined}
          >
            {mfa?.totp.disable || 'Disable'}
          </Button>
        </DialogActions>
        </Box>
      </Dialog>

      {/* Remove Passkey Confirmation */}
      <Dialog open={!!removePasskeyId} onClose={() => setRemovePasskeyId(null)}>
        <DialogTitle>{mfa?.passkeys.remove || 'Remove Passkey'}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" icon={<AlertTriangle size={20} />}>
            {mfa?.passkeys.removeConfirm || 'Are you sure you want to remove this passkey?'}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemovePasskeyId(null)}>{t.common.cancel}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => removePasskeyId && handleRemovePasskey(removePasskeyId)}
          >
            {mfa?.passkeys.remove || 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Backup Codes Regenerate Dialog */}
      <Dialog open={regenOpen} onClose={() => { setRegenOpen(false); setRegenPassword(''); }}>
        <DialogTitle>{mfa?.backupCodes.regenerate || 'Regenerate Codes'}</DialogTitle>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleRegenCodes();
          }}
        >
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {mfa?.backupCodes.regenerateConfirm || 'This will invalidate all existing backup codes. Continue?'}
          </Alert>
          <TextField
            label={sec?.password.currentPassword || 'Password'}
            type="password"
            autoComplete="current-password"
            value={regenPassword}
            onChange={(e) => setRegenPassword(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRegenOpen(false); setRegenPassword(''); }}>{t.common.cancel}</Button>
          <Button
            type="submit"
            variant="contained"
            color="warning"
            disabled={regenLoading || !regenPassword}
            startIcon={regenLoading ? <CircularProgress size={16} /> : undefined}
          >
            {mfa?.backupCodes.regenerate || 'Regenerate'}
          </Button>
        </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

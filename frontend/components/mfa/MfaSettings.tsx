import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  useTheme,
} from '@mui/material';
import { Shield, ShieldCheck } from 'lucide-react';
import { mfaApi, type MfaStatus, type TrustedDevice, type WebAuthnCredential } from '@/lib/api/mfa';
import { useTranslations } from '@/lib/hooks/use-translations';
import { TotpSetupWizard } from './TotpSetupWizard';
import { BackupCodesCard } from './BackupCodesCard';
import { TrustedDevicesList } from './TrustedDevicesList';
import { PasskeyCard } from './PasskeyCard';

export function MfaSettings() {
  const t = useTranslations();
  const theme = useTheme();
  const mfaCopy = t.auth.mfa;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [passkeys, setPasskeys] = useState<WebAuthnCredential[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dialog states
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodesDialog, setShowBackupCodesDialog] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [statusData, devicesData, passkeysData] = await Promise.all([
        mfaApi.getStatus(),
        mfaApi.listDevices(),
        mfaApi.listWebAuthnCredentials(),
      ]);
      setStatus(statusData);
      setDevices(devicesData);
      setPasskeys(passkeysData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load MFA status';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSetupComplete = useCallback((codes: string[]) => {
    setBackupCodes(codes);
    setSetupOpen(false);
    setShowBackupCodesDialog(true);
    setSuccess(mfaCopy.totp.verify.success);
    loadData();
  }, [loadData, mfaCopy]);

  const handleDisableTotp = useCallback(async () => {
    if (disableCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    try {
      setDisableLoading(true);
      setError('');
      await mfaApi.disableTotp(disableCode);
      setDisableOpen(false);
      setDisableCode('');
      setSuccess('Two-factor authentication has been disabled');
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : mfaCopy.errors.disableFailed;
      setError(message);
    } finally {
      setDisableLoading(false);
    }
  }, [disableCode, loadData, mfaCopy]);

  if (loading) {
    return (
      <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const isMfaEnabled = status?.totpEnabled ?? false;

  return (
    <Box>
      {/* Page Header - consistent with other settings sections */}
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {mfaCopy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {mfaCopy.subtitle}
      </Typography>

      {/* Status Badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        {isMfaEnabled ? (
          <ShieldCheck size={24} color={theme.palette.success.main} />
        ) : (
          <Shield size={24} color={theme.palette.text.secondary} />
        )}
        <Chip
          label={isMfaEnabled ? mfaCopy.enabled : mfaCopy.disabled}
          color={isMfaEnabled ? 'success' : 'default'}
          size="small"
        />
      </Box>

      {/* Alerts */}
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

      {/* Authenticator App Section */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {mfaCopy.totp.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {mfaCopy.totp.subtitle}
              </Typography>
            </Box>
            {isMfaEnabled ? (
              <Button
                variant="outlined"
                color="error"
                onClick={() => setDisableOpen(true)}
              >
                {mfaCopy.disable}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() => setSetupOpen(true)}
              >
                {mfaCopy.enable}
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Passkeys Section - Available for all users */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <PasskeyCard
            credentials={passkeys}
            onRefresh={loadData}
          />
        </CardContent>
      </Card>

      {/* Backup Codes Section - Only show if MFA is enabled */}
      {isMfaEnabled && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <BackupCodesCard
              remaining={status?.backupCodesRemaining ?? 0}
              onRefresh={loadData}
            />
          </CardContent>
        </Card>
      )}

      {/* Trusted Devices Section - Only show if MFA is enabled */}
      {isMfaEnabled && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <TrustedDevicesList
              devices={devices}
              onRefresh={loadData}
            />
          </CardContent>
        </Card>
      )}

      {/* Setup Dialog */}
      <Dialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogContent sx={{ p: 3 }}>
          <TotpSetupWizard
            onComplete={handleSetupComplete}
            onCancel={() => setSetupOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog open={disableOpen} onClose={() => setDisableOpen(false)}>
        <DialogTitle>{mfaCopy.disable}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Enter your authenticator code to disable two-factor authentication.
          </Typography>
          <TextField
            label="Verification Code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputProps={{
              maxLength: 6,
              inputMode: 'numeric',
              pattern: '[0-9]*',
              style: { letterSpacing: '0.5em', fontFamily: 'monospace' },
            }}
            fullWidth
            autoFocus
            error={!!error}
            helperText={error}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisableOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDisableTotp}
            variant="contained"
            color="error"
            disabled={disableLoading || disableCode.length !== 6}
          >
            {disableLoading ? 'Disabling...' : mfaCopy.disable}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Backup Codes Dialog (shown after setup) */}
      <Dialog
        open={showBackupCodesDialog}
        onClose={() => setShowBackupCodesDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShieldCheck size={24} color={theme.palette.success.main} />
            {mfaCopy.totp.verify.success}
          </Box>
        </DialogTitle>
        <DialogContent>
          <BackupCodesCard
            initialCodes={backupCodes}
            remaining={backupCodes.length}
            onRefresh={() => {}}
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => setShowBackupCodesDialog(false)}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

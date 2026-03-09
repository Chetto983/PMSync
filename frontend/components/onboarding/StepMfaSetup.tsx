import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Alert,
  CircularProgress,
} from '@mui/material';
import { CheckCircle, Smartphone, Key, Download } from 'lucide-react';
import UAParser from 'ua-parser-js';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { StepProps } from './types';

type MfaPhase = 'choose' | 'totp-setup' | 'totp-verify' | 'totp-backup' | 'passkey-setup';

export function StepMfaSetup({ onComplete, isLast }: StepProps) {
  const t = useTranslations();
  const sc = t.onboarding.stepContent?.mfa;

  const [phase, setPhase] = useState<MfaPhase>('choose');
  const [totpConfigured, setTotpConfigured] = useState(false);
  const [passkeyConfigured, setPasskeyConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // TOTP state
  const [password, setPassword] = useState('');
  const [totpURI, setTotpURI] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState('');

  const canFinish = totpConfigured || passkeyConfigured;

  // Generate QR code when totpURI is set
  useEffect(() => {
    if (!totpURI) return;
    let cancelled = false;
    import('qrcode').then((QRCode) => {
      QRCode.toDataURL(totpURI, { width: 200, margin: 2 }).then((url: string) => {
        if (!cancelled) setQrDataUrl(url);
      });
    });
    return () => { cancelled = true; };
  }, [totpURI]);

  const handleEnableTotp = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authClient.twoFactor.enable({ password });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (result as any).data;
      if (data?.totpURI) {
        setTotpURI(data.totpURI);
        setBackupCodes(data.backupCodes ?? []);
        setPhase('totp-verify');
      } else {
        setError(t.common.genericError);
      }
    } catch (err) {
      setError((err as Error).message || t.common.genericError);
    } finally {
      setLoading(false);
    }
  }, [password, t.common.genericError]);

  const handleVerifyTotp = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await authClient.twoFactor.verifyTotp({ code: verifyCode });
      setTotpConfigured(true);
      setPhase(backupCodes.length > 0 ? 'totp-backup' : 'choose');
    } catch (err) {
      setError((err as Error).message || t.common.genericError);
    } finally {
      setLoading(false);
    }
  }, [verifyCode, backupCodes.length, t.common.genericError]);

  const handleAddPasskey = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // ua-parser-js v2 types don't expose constructor; cast to bypass
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser = new (UAParser as any)(navigator.userAgent);
      const browser = parser.getBrowser().name ?? 'Browser';
      const os = parser.getOS().name ?? 'Device';
      const name = `${browser} on ${os}`;
      await authClient.passkey.addPasskey({ name });
      setPasskeyConfigured(true);
      setPhase('choose');
    } catch (err) {
      setError((err as Error).message || t.common.genericError);
    } finally {
      setLoading(false);
    }
  }, [t.common.genericError]);

  const handleDownloadCodes = () => {
    const text = backupCodes.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pmsync-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFinish = () => {
    onComplete({ totpConfigured, passkeyConfigured });
  };

  // --- Choose method screen ---
  if (phase === 'choose') {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          {sc?.title ?? 'Secure Your Account'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {sc?.description ?? 'Multi-factor authentication is required to protect your data (GDPR)'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Stack spacing={2}>
          <MethodCard
            icon={<Smartphone size={24} />}
            title={sc?.setupTotp ?? 'Authenticator App'}
            description={sc?.setupTotpDesc ?? 'Use Google Authenticator, Authy, or similar'}
            configured={totpConfigured}
            configuredLabel={sc?.totpComplete ?? 'Authenticator app configured'}
            onClick={() => setPhase('totp-setup')}
          />
          <MethodCard
            icon={<Key size={24} />}
            title={sc?.setupPasskey ?? 'Passkey'}
            description={sc?.setupPasskeyDesc ?? 'Use Face ID, Touch ID, or a security key'}
            configured={passkeyConfigured}
            configuredLabel={sc?.passkeyComplete ?? 'Passkey registered'}
            onClick={handleAddPasskey}
            loading={loading}
          />
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
          {sc?.bothRecommended ?? 'You can set up both for extra security'}
        </Typography>

        {!canFinish && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {sc?.mustConfigureOne ?? 'You must configure at least one method to continue'}
          </Alert>
        )}

        <Button
          variant="contained"
          fullWidth
          disabled={!canFinish}
          onClick={handleFinish}
          sx={{ mt: 3 }}
        >
          {isLast ? t.onboarding.finish : t.onboarding.next}
        </Button>
      </Box>
    );
  }

  // --- TOTP: password entry ---
  if (phase === 'totp-setup') {
    return (
      <Box sx={{ maxWidth: 420, mx: 'auto' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          {sc?.setupTotp ?? 'Authenticator App'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <TextField
          label={sc?.enterPassword ?? 'Enter your password'}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          autoFocus
          sx={{ mb: 2 }}
        />

        <Stack direction="row" spacing={1}>
          <Button variant="text" onClick={() => setPhase('choose')}>
            {t.onboarding.back}
          </Button>
          <Button
            variant="contained"
            onClick={handleEnableTotp}
            disabled={loading || password.length === 0}
          >
            {loading ? <CircularProgress size={20} /> : (t.onboarding.next)}
          </Button>
        </Stack>
      </Box>
    );
  }

  // --- TOTP: QR code + verification ---
  if (phase === 'totp-verify') {
    return (
      <Box sx={{ maxWidth: 420, mx: 'auto', textAlign: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          {sc?.setupTotp ?? 'Authenticator App'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {qrDataUrl ? (
          <Box component="img" src={qrDataUrl} alt="TOTP QR Code" sx={{ mb: 2 }} />
        ) : (
          <CircularProgress sx={{ mb: 2 }} />
        )}

        <TextField
          label={sc?.enterCode ?? 'Enter 6-digit code'}
          value={verifyCode}
          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
          fullWidth
          autoFocus
          sx={{ mb: 2 }}
        />

        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="text" onClick={() => setPhase('totp-setup')}>
            {t.onboarding.back}
          </Button>
          <Button
            variant="contained"
            onClick={handleVerifyTotp}
            disabled={loading || verifyCode.length !== 6}
          >
            {loading ? <CircularProgress size={20} /> : (sc?.verifyCode ?? 'Verify')}
          </Button>
        </Stack>
      </Box>
    );
  }

  // --- TOTP: backup codes ---
  if (phase === 'totp-backup') {
    return (
      <Box sx={{ maxWidth: 420, mx: 'auto' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {sc?.backupCodesTitle ?? 'Backup Codes'}
        </Typography>

        <Alert severity="warning" sx={{ mb: 2 }}>
          {sc?.backupCodesWarning ?? 'Save these codes -- you will not see them again'}
        </Alert>

        <Box
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            bgcolor: 'grey.100',
            p: 2,
            borderRadius: 1,
            mb: 2,
            lineHeight: 2,
          }}
        >
          {backupCodes.map((code) => (
            <Box key={code}>{code}</Box>
          ))}
        </Box>

        <Stack spacing={1}>
          <Button
            variant="outlined"
            startIcon={<Download size={18} />}
            onClick={handleDownloadCodes}
          >
            {sc?.downloadCodes ?? 'Download as .txt'}
          </Button>
          <Button variant="contained" onClick={() => setPhase('choose')}>
            {t.onboarding.next}
          </Button>
        </Stack>
      </Box>
    );
  }

  return null;
}

// --- Reusable method card ---

interface MethodCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  configured: boolean;
  configuredLabel: string;
  onClick: () => void;
  loading?: boolean;
}

function MethodCard({ icon, title, description, configured, configuredLabel, onClick, loading }: MethodCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderColor: configured ? 'success.main' : undefined,
        cursor: configured ? 'default' : 'pointer',
        '&:hover': configured ? {} : { boxShadow: 2 },
      }}
      onClick={configured ? undefined : onClick}
    >
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="center">
          {icon}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </Box>
          {configured ? (
            <CheckCircle size={24} color="var(--mui-palette-success-main)" />
          ) : loading ? (
            <CircularProgress size={24} />
          ) : null}
        </Stack>
        {configured && (
          <Typography variant="caption" color="success.main" sx={{ ml: 5 }}>
            {configuredLabel}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  TextField,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';
import { Copy, Check, Smartphone, QrCode, KeyRound } from 'lucide-react';
import Image from 'next/image';
import { mfaApi, type TotpSetupResponse } from '@/lib/api/mfa';
import { useTranslations } from '@/lib/hooks/use-translations';

interface TotpSetupWizardProps {
  onComplete: (backupCodes: string[]) => void;
  onCancel: () => void;
}

export function TotpSetupWizard({ onComplete, onCancel }: TotpSetupWizardProps) {
  const t = useTranslations();
  const mfaCopy = t.auth.mfa;

  const [activeStep, setActiveStep] = useState(0);
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);

  // Step 1: Start setup
  const handleStartSetup = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await mfaApi.setupTotp();
      setSetupData(data);
      setActiveStep(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start setup';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Step 3: Verify code
  const handleVerify = useCallback(async () => {
    if (verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await mfaApi.verifyTotp(verificationCode);
      if (result.success && result.backupCodes) {
        onComplete(result.backupCodes);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : mfaCopy.totp.verify.invalid;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [verificationCode, onComplete, mfaCopy]);

  const handleCopySecret = useCallback(() => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  }, [setupData]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(value);
    setError('');
  };

  const steps = [
    {
      label: mfaCopy.totp.setup.step1,
      icon: <Smartphone size={20} />,
    },
    {
      label: mfaCopy.totp.setup.step2,
      icon: <QrCode size={20} />,
    },
    {
      label: mfaCopy.totp.setup.step3,
      icon: <KeyRound size={20} />,
    },
  ];

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
        {mfaCopy.totp.setup.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {mfaCopy.totp.subtitle}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Stepper activeStep={activeStep} orientation="vertical">
        {/* Step 1: Download App */}
        <Step>
          <StepLabel
            StepIconComponent={() => (
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: activeStep >= 0 ? 'primary.main' : 'action.disabled',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {steps[0].icon}
              </Box>
            )}
          >
            {steps[0].label}
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {mfaCopy.totp.setup.step1Description}
            </Typography>
            <Button
              variant="contained"
              onClick={handleStartSetup}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : null}
            >
              {loading ? 'Loading...' : 'Continue'}
            </Button>
          </StepContent>
        </Step>

        {/* Step 2: Scan QR Code */}
        <Step>
          <StepLabel
            StepIconComponent={() => (
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: activeStep >= 1 ? 'primary.main' : 'action.disabled',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {steps[1].icon}
              </Box>
            )}
          >
            {steps[1].label}
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {mfaCopy.totp.setup.step2Description}
            </Typography>

            {setupData && (
              <>
                {/* QR Code */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    mb: 2,
                    display: 'flex',
                    justifyContent: 'center',
                    bgcolor: 'white',
                  }}
                >
                  <Image
                    src={setupData.qrCodeDataUrl}
                    alt="TOTP QR Code"
                    width={200}
                    height={200}
                    unoptimized
                  />
                </Paper>

                {/* Manual Entry */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {mfaCopy.totp.setup.manualEntry}
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.5,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    mb: 2,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}
                  >
                    {setupData.secret}
                  </Typography>
                  <Tooltip title={secretCopied ? mfaCopy.totp.setup.secretCopied : mfaCopy.totp.setup.copySecret}>
                    <IconButton size="small" onClick={handleCopySecret}>
                      {secretCopied ? <Check size={16} /> : <Copy size={16} />}
                    </IconButton>
                  </Tooltip>
                </Box>
              </>
            )}

            <Button variant="contained" onClick={() => setActiveStep(2)}>
              Continue
            </Button>
          </StepContent>
        </Step>

        {/* Step 3: Verify Code */}
        <Step>
          <StepLabel
            StepIconComponent={() => (
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: activeStep >= 2 ? 'primary.main' : 'action.disabled',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {steps[2].icon}
              </Box>
            )}
          >
            {steps[2].label}
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {mfaCopy.totp.setup.step3Description}
            </Typography>

            <TextField
              label={mfaCopy.totp.verify.title}
              value={verificationCode}
              onChange={handleCodeChange}
              placeholder={mfaCopy.totp.verify.placeholder}
              inputProps={{
                maxLength: 6,
                inputMode: 'numeric',
                pattern: '[0-9]*',
                style: { letterSpacing: '0.5em', fontFamily: 'monospace', fontSize: '1.25rem' },
              }}
              sx={{ mb: 2, width: 200 }}
              autoFocus
              error={!!error}
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                onClick={handleVerify}
                disabled={loading || verificationCode.length !== 6}
                startIcon={loading ? <CircularProgress size={16} /> : null}
              >
                {loading ? 'Verifying...' : mfaCopy.totp.verify.submit}
              </Button>
            </Box>
          </StepContent>
        </Step>
      </Stepper>

      <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

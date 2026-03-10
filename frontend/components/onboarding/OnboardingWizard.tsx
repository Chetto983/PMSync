import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { StepNameConfirm } from './StepNameConfirm';
import { StepWorkspace } from './StepWorkspace';
import { StepEmailProvider } from './StepEmailProvider';
import { StepAvatar } from './StepAvatar';
import { StepMfaSetup } from './StepMfaSetup';
import { StepLegalConsent } from './StepLegalConsent';

// Re-export StepProps for Plan 04 consumers
export type { StepProps } from './types';

interface OnboardingWizardProps {
  user: SessionUser;
}

export function OnboardingWizard({ user }: OnboardingWizardProps) {
  const t = useTranslations();
  const router = useRouter();

  const [activeStep, setActiveStep] = useState(0);
  const [_stepData, setStepData] = useState<Record<number, unknown>>({});
  const [completing, setCompleting] = useState(false);

  const steps = [
    { label: t.onboarding.steps.legal, Component: StepLegalConsent },
    { label: t.onboarding.steps.name, Component: StepNameConfirm },
    { label: t.onboarding.steps.workspace, Component: StepWorkspace },
    { label: t.onboarding.steps.emailProvider, Component: StepEmailProvider },
    { label: t.onboarding.steps.avatar, Component: StepAvatar },
    { label: t.onboarding.steps.mfa, Component: StepMfaSetup },
  ];

  const isLastStep = activeStep === steps.length - 1;

  const handleComplete = useCallback(
    async (data?: unknown) => {
      // Store step data
      setStepData((prev) => ({ ...prev, [activeStep]: data }));

      if (isLastStep) {
        // All steps done -- mark onboarding complete
        setCompleting(true);
        try {
          await authClient.updateUser({
            onboardingComplete: true,
          } as Parameters<typeof authClient.updateUser>[0]);

          // Set cookie so middleware skips onboarding redirect
          document.cookie =
            'pmsync:onboarding-complete=1; path=/; max-age=31536000; SameSite=Lax';

          router.replace('/dashboard');
        } catch {
          // If update fails, still try to proceed -- the user can
          // be re-prompted on next login if the flag didn't stick.
          router.replace('/dashboard');
        }
        return;
      }

      setActiveStep((prev) => prev + 1);
    },
    [activeStep, isLastStep, router],
  );

  const handleBack = useCallback(() => {
    setActiveStep((prev) => Math.max(0, prev - 1));
  }, []);

  const { Component: ActiveComponent } = steps[activeStep];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        px: 2,
        py: 4,
        bgcolor: 'background.default',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: '100%',
          maxWidth: 600,
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
        }}
      >
        {/* Header */}
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 0.5 }}>
          {t.onboarding.title}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: 'center', mb: 3 }}
        >
          {t.onboarding.subtitle}
        </Typography>

        {/* Stepper */}
        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
          {steps.map((step) => (
            <Step key={step.label}>
              <StepLabel>{step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step content */}
        {completing ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <ActiveComponent
            user={user}
            onComplete={handleComplete}
            onBack={handleBack}
            isFirst={activeStep === 0}
            isLast={isLastStep}
          />
        )}

        {/* Back button (not shown on first step or while completing) */}
        {activeStep > 0 && !completing && (
          <Button
            onClick={handleBack}
            sx={{ mt: 2 }}
            variant="text"
            fullWidth
          >
            {t.onboarding.back}
          </Button>
        )}
      </Paper>
    </Box>
  );
}

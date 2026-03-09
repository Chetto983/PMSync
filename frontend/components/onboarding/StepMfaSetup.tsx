import { Box, Typography, Button } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { StepProps } from './types';

/**
 * Placeholder -- replaced by Plan 04 with real MFA setup UI.
 */
export function StepMfaSetup({ onComplete, isLast }: StepProps) {
  const t = useTranslations();
  return (
    <Box sx={{ textAlign: 'center', maxWidth: 420, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {t.onboarding.steps.mfa}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Set up two-factor authentication (coming soon)
      </Typography>
      <Button variant="contained" onClick={() => onComplete()}>
        {isLast ? t.onboarding.finish : t.onboarding.skip}
      </Button>
    </Box>
  );
}

import { Box, Typography, Button } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { StepProps } from './types';

/**
 * Placeholder -- replaced by Plan 04 with real avatar upload UI.
 */
export function StepAvatar({ onComplete, isLast }: StepProps) {
  const t = useTranslations();
  return (
    <Box sx={{ textAlign: 'center', maxWidth: 420, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {t.onboarding.steps.avatar}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upload your profile picture (coming soon)
      </Typography>
      <Button variant="contained" onClick={() => onComplete()}>
        {isLast ? t.onboarding.finish : t.onboarding.next}
      </Button>
    </Box>
  );
}

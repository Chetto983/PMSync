'use client';

import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import { useAiHealth } from '@/hooks/queries';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * OBS-M3: Banner shown when AI health endpoint reports degraded/unhealthy status.
 * Polls every 30s and auto-hides when service recovers.
 */
export function AiDegradedBanner() {
  const { data: status } = useAiHealth();
  const t = useTranslations();

  const isDegraded = status === 'degraded' || status === 'unhealthy';

  return (
    <Collapse in={isDegraded}>
      <Alert
        severity="warning"
        variant="filled"
        sx={{ borderRadius: 0 }}
      >
        {t.ai.errors.degradedBanner}
      </Alert>
    </Collapse>
  );
}

/**
 * TodayTierSection — Section header + slot for items per UI-SPEC § Feed-Level.
 *
 * Header: overline (12px, weight 600, letterSpacing 0.08em, uppercase) showing
 * tier label + count. Color/border per UI-SPEC § Urgency Tier Colors.
 */

'use client';

import type { ReactNode } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { TodayTier } from '@/lib/api/dashboard';

interface TodayTierSectionProps {
  tier: TodayTier;
  count: number;
  children: ReactNode;
}

export function TodayTierSection({ tier, count, children }: TodayTierSectionProps) {
  const t = useTranslations();
  const theme = useTheme();

  const palette = {
    urgent: { color: theme.palette.error.main, accent: theme.palette.error.main },
    today: { color: theme.palette.warning.main, accent: theme.palette.warning.main },
    fyi: { color: theme.palette.text.secondary, accent: 'transparent' },
  } as const;

  const { color } = palette[tier];
  const label = t.dashboard.today.tiers[tier];

  // Urgent tier gets the soft 12% red wash + 3px left border per UI-SPEC.
  const isUrgent = tier === 'urgent';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        ...(isUrgent && {
          borderLeft: `3px solid ${theme.palette.error.main}`,
          pl: 1,
          bgcolor: alpha(theme.palette.error.main, 0.04),
          borderRadius: 1,
          py: 1,
        }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: isUrgent ? 1 : 0 }}>
        <Typography
          component="h2"
          variant="overline"
          sx={{
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color,
            lineHeight: 1.5,
          }}
        >
          {`${label} (${count})`}
        </Typography>
      </Box>
      <Box>{children}</Box>
    </Box>
  );
}
